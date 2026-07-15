import { advance } from "@flowbot/core";
import { createSessionToken, createSqlClient, hashSessionToken, type AdminUser } from "@flowbot/db";
import { Pool, type PoolClient } from "@neondatabase/serverless";
import { engineInputSchema, flowSnapshotSchema, type EngineInput, type FlowSnapshot } from "@flowbot/shared";
import { randomUUID } from "node:crypto";
import { publishConversationEvent } from "./sse-hub";

type Sql = any;
let pgPool: Pool | null = null;

type BotRow = {
  id: string;
  tenant_id: string;
  public_key: string;
  name: string;
  default_lang: "th" | "en";
  widget_settings: Record<string, unknown>;
  allowed_origins: string[];
  published_version_id: string | null;
};

type ConversationRow = {
  id: string;
  tenant_id: string;
  bot_id: string;
  flow_version_id: string;
  customer_id: string | null;
  status: "bot" | "awaiting_admin" | "admin_active" | "closed";
  current_node_id: string | null;
  lang: "th" | "en";
  crm_status: string;
  session_expires_at: Date | string;
};

type MessageRow = {
  id: string;
  sequence: string;
  sender: "bot" | "visitor" | "admin" | "system";
  type: string;
  content: unknown;
  node_id: string | null;
  created_at: Date | string;
};

export type ApiMessage = {
  id: string;
  sequence: string;
  sender: MessageRow["sender"];
  type: string;
  content: unknown;
  nodeId?: string | undefined;
  createdAt: string;
};

export type ConversationState = {
  status: ConversationRow["status"];
  currentNodeId?: string | null;
  flowVersionId: string;
  lang: "th" | "en";
};

export async function getPublicConfig(botKey: string, sql = createSqlClient()) {
  const bot = await getBotByKey(botKey, sql);
  if (!bot) return null;
  const widgetSettings = bot.widget_settings ?? {};
  const contactChannels = await sql`
    SELECT type, label, value
    FROM flowbot_contact_channels
    WHERE tenant_id = ${bot.tenant_id} AND bot_id = ${bot.id}
    ORDER BY sort_order ASC
  `;

  return {
    botName: bot.name,
    enabled: widgetSettings.enabled !== false,
    defaultLang: bot.default_lang,
    langToggle: widgetSettings.langToggle !== false,
    theme: widgetSettings,
    greeting: {
      th: typeof widgetSettings.greetingTh === "string" ? widgetSettings.greetingTh : "สวัสดีครับ ต้องการให้ช่วยเรื่องไหน?",
      en: typeof widgetSettings.greetingEn === "string" ? widgetSettings.greetingEn : "Hi, what would you like help with?"
    },
    contactChannels,
    hasPublishedFlow: Boolean(bot.published_version_id),
    widgetBundleVersion: "m2"
  };
}

export async function createOrResumeSession(params: {
  botKey: string;
  sessionToken?: string | undefined;
  lang?: "th" | "en" | undefined;
  afterSequence?: string | undefined;
  sql?: Sql;
}) {
  const sql = params.sql ?? createSqlClient();
  const bot = await getBotByKey(params.botKey, sql);
  if (!bot || !bot.published_version_id || bot.widget_settings?.enabled === false) return null;

  const requestedLang = params.lang ?? bot.default_lang;
  const existing = params.sessionToken
    ? await getConversationByToken({ bot, sessionToken: params.sessionToken, sql })
    : null;

  if (existing && existing.status !== "closed") {
    const messages = await getMessagesAfter(sql, existing.tenant_id, existing.id, params.afterSequence);
    return {
      sessionToken: params.sessionToken,
      conversationId: existing.id,
      state: conversationState(existing),
      messages,
      lastSequence: messages.at(-1)?.sequence ?? params.afterSequence ?? "0",
      expiresAt: new Date(existing.session_expires_at).toISOString()
    };
  }

  const sessionToken = createSessionToken();
  const sessionTokenHash = hashSessionToken(sessionToken);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);
  const snapshot = await loadSnapshot(sql, bot.tenant_id, bot.published_version_id);
  const conversationId = randomUUID();

  await sql`
    INSERT INTO flowbot_conversations (
      id, tenant_id, bot_id, flow_version_id, session_token_hash, session_expires_at,
      status, current_node_id, lang, crm_status
    )
    VALUES (
      ${conversationId}, ${bot.tenant_id}, ${bot.id}, ${snapshot.flowVersionId}, ${sessionTokenHash},
      ${expiresAt.toISOString()}, 'bot', ${snapshot.rootNodeId}, ${requestedLang}, 'new'
    )
  `;

  const state = {
    status: "bot" as const,
    currentNodeId: snapshot.rootNodeId,
    flowVersionId: snapshot.flowVersionId,
    lang: requestedLang
  };
  const rootMessages = await advance(
    {
      tenantId: bot.tenant_id,
      botId: bot.id,
      conversation: {
        id: conversationId,
        flowVersionId: snapshot.flowVersionId,
        currentNodeId: snapshot.rootNodeId,
        status: "bot",
        lang: requestedLang
      },
      config: { snapshot }
    },
    { type: "action", payload: { action: "restart" } }
  );

  const messages = await insertBotMessages(sql, {
    tenantId: bot.tenant_id,
    conversationId,
    flowVersionId: snapshot.flowVersionId,
    messages: rootMessages.messages,
    nodeId: snapshot.rootNodeId
  });
  await insertEvent(sql, bot.tenant_id, bot.id, conversationId, "session_start", {});

  return {
    sessionToken,
    conversationId,
    state,
    messages,
    lastSequence: messages.at(-1)?.sequence ?? "0",
    expiresAt: expiresAt.toISOString()
  };
}

export async function processVisitorMessage(params: {
  botKey: string;
  sessionToken: string;
  inputId: string;
  lang?: "th" | "en" | undefined;
  input: EngineInput;
  testFault?: "after_visitor_message" | undefined;
  sql?: Sql;
}) {
  const sql = params.sql ?? createSqlClient();
  const parsedInput = engineInputSchema.parse(params.input);
  const bot = await getBotByKey(params.botKey, sql);
  if (!bot || bot.widget_settings?.enabled === false) return null;

  const result = await withPgTransaction(async (txSql) => {
    const conversation = await getConversationByTokenForUpdate({ bot, sessionToken: params.sessionToken, sql: txSql });
    if (!conversation) return null;

    const existing = await txSql`
      SELECT response
      FROM flowbot_processed_inputs
      WHERE tenant_id = ${conversation.tenant_id}
        AND conversation_id = ${conversation.id}
        AND input_id = ${params.inputId}
      LIMIT 1
    `;
    if (existing[0]) {
      return {
        conversationId: conversation.id,
        response: existing[0].response,
        shouldPublish: false
      };
    }

    if (conversation.status === "closed") {
      throw Object.assign(new Error("Conversation is closed."), { statusCode: 409 });
    }
    if (conversation.status === "admin_active" && parsedInput.type !== "text") {
      throw Object.assign(new Error("This conversation is being handled by staff."), { statusCode: 409 });
    }
    if (
      conversation.status === "awaiting_admin" &&
      parsedInput.type !== "text" &&
      !(parsedInput.type === "action" && parsedInput.payload.action === "return_to_bot")
    ) {
      throw Object.assign(new Error("This conversation is waiting for staff."), { statusCode: 409 });
    }

    const snapshot = await loadSnapshot(txSql, conversation.tenant_id, conversation.flow_version_id);
    const visitorMessage = await insertVisitorMessage(txSql, {
      tenantId: conversation.tenant_id,
      conversationId: conversation.id,
      flowVersionId: conversation.flow_version_id,
      inputId: params.inputId,
      input: parsedInput
    });
    if (params.testFault === "after_visitor_message") {
      throw new Error("Injected test fault after visitor message.");
    }

    let engineResult;
    if (conversation.status === "bot" || (parsedInput.type === "action" && parsedInput.payload.action === "return_to_bot")) {
      engineResult = await advance(
        {
          tenantId: conversation.tenant_id,
          botId: conversation.bot_id,
          conversation: {
            id: conversation.id,
            flowVersionId: conversation.flow_version_id,
            currentNodeId: conversation.current_node_id,
            status: parsedInput.type === "action" && parsedInput.payload.action === "return_to_bot" ? "bot" : conversation.status,
            lang: params.lang ?? conversation.lang
          },
          config: { snapshot }
        },
        parsedInput
      );
    } else {
      engineResult = { messages: [], stateUpdates: {}, events: [], effects: [] };
    }

    const nextStatus = engineResult.stateUpdates.status ?? conversation.status;
    const nextNodeId =
      engineResult.stateUpdates.currentNodeId === undefined ? conversation.current_node_id : engineResult.stateUpdates.currentNodeId;
    const nextLang = engineResult.stateUpdates.lang ?? params.lang ?? conversation.lang;

    const outboundMessages = [...engineResult.messages];
    let lead = null;
    for (const effect of engineResult.effects) {
      if (effect.type === "create_lead") {
        lead = await createLead(txSql, {
          tenantId: conversation.tenant_id,
          conversationId: conversation.id,
          flowVersionId: conversation.flow_version_id,
          sourceNodeId: effect.payload.sourceNodeId,
          data: effect.payload.data
        });
      }
      if (effect.type === "request_handoff") {
        await insertOutbox(txSql, conversation.tenant_id, conversation.id, effect.payload.reason);
        outboundMessages.push({
          type: "cta",
          content: {
            kind: "contact_channels",
            text:
              nextLang === "th"
                ? "ช่องทางติดต่อเพิ่มเติมของทีมงาน"
                : "Additional ways to contact the team",
            channels: await getContactChannels(txSql, conversation.tenant_id, conversation.bot_id)
          }
        });
      }
    }

    const botMessages = await insertBotMessages(txSql, {
      tenantId: conversation.tenant_id,
      conversationId: conversation.id,
      flowVersionId: conversation.flow_version_id,
      messages: outboundMessages,
      nodeId: nextNodeId
    });

    for (const event of engineResult.events) {
      await insertEvent(txSql, conversation.tenant_id, conversation.bot_id, conversation.id, event.type, event.payload);
    }

    await txSql`
      UPDATE flowbot_conversations
      SET status = ${nextStatus},
          current_node_id = ${nextNodeId},
          lang = ${nextLang},
          crm_status = CASE WHEN ${lead?.id ?? null}::uuid IS NULL THEN crm_status ELSE 'pending_follow_up' END,
          unread_admin = CASE WHEN ${nextStatus} IN ('awaiting_admin','admin_active') THEN unread_admin + 1 ELSE unread_admin END,
          last_activity_at = now()
      WHERE tenant_id = ${conversation.tenant_id}
        AND id = ${conversation.id}
    `;

    const response = {
      messages: [...(visitorMessage ? [visitorMessage] : []), ...botMessages],
      state: {
        status: nextStatus,
        currentNodeId: nextNodeId,
        flowVersionId: conversation.flow_version_id,
        lang: nextLang
      },
      lastSequence: botMessages.at(-1)?.sequence ?? visitorMessage?.sequence ?? "0",
      lead
    };

    await txSql`
      INSERT INTO flowbot_processed_inputs (tenant_id, conversation_id, input_id, response)
      VALUES (${conversation.tenant_id}, ${conversation.id}, ${params.inputId}, ${JSON.stringify(response)})
    `;

    return {
      conversationId: conversation.id,
      response,
      shouldPublish: true
    };
  });

  if (!result) return null;
  if (result.shouldPublish) {
    for (const message of result.response.messages) {
      publishConversationEvent(result.conversationId, { type: "message", sequence: message.sequence, payload: message });
    }
    publishConversationEvent(result.conversationId, { type: "state", payload: result.response.state });
  }

  return result.response;
}

export async function getConversationForStream(params: { botKey: string; sessionToken: string; sql?: Sql }) {
  const sql = params.sql ?? createSqlClient();
  const bot = await getBotByKey(params.botKey, sql);
  if (!bot) return null;
  return getConversationByToken({ bot, sessionToken: params.sessionToken, sql });
}

export async function syncConversation(params: { botKey: string; sessionToken: string; afterSequence?: string | undefined; sql?: Sql }) {
  const sql = params.sql ?? createSqlClient();
  const bot = await getBotByKey(params.botKey, sql);
  if (!bot) return null;
  const conversation = await getConversationByToken({ bot, sessionToken: params.sessionToken, sql });
  if (!conversation) return null;
  const messages = await getMessagesAfter(sql, conversation.tenant_id, conversation.id, params.afterSequence);
  return {
    messages,
    state: conversationState(conversation),
    lastSequence: messages.at(-1)?.sequence ?? params.afterSequence ?? "0"
  };
}

export async function listAdminConversations(admin: AdminUser, sql: Sql = createSqlClient()) {
  const rows = await sql`
    SELECT c.id, c.status, c.crm_status, c.lang, c.starred, c.unread_admin, c.last_activity_at,
           b.name AS bot_name,
           COALESCE(cu.name, '') AS customer_name,
           COALESCE(cu.email::text, '') AS customer_email,
           COALESCE(cu.phone, '') AS customer_phone
    FROM flowbot_conversations c
    JOIN flowbot_bots b ON b.tenant_id = c.tenant_id AND b.id = c.bot_id
    LEFT JOIN flowbot_customers cu ON cu.tenant_id = c.tenant_id AND cu.id = c.customer_id
    WHERE c.tenant_id = ${admin.tenantId}
      AND c.deleted_at IS NULL
    ORDER BY c.last_activity_at DESC
    LIMIT 100
  `;
  return rows;
}

export async function getAdminConversation(admin: AdminUser, conversationId: string, afterSequence: string | undefined, sql: Sql = createSqlClient()) {
  const conversations = await sql`
    SELECT id, tenant_id, bot_id, flow_version_id, customer_id, status, current_node_id, lang, crm_status, session_expires_at
    FROM flowbot_conversations
    WHERE tenant_id = ${admin.tenantId}
      AND id = ${conversationId}
      AND deleted_at IS NULL
    LIMIT 1
  `;
  const conversation = conversations[0] as ConversationRow | undefined;
  if (!conversation) return null;
  return {
    conversation: {
      id: conversation.id,
      status: conversation.status,
      crmStatus: conversation.crm_status,
      state: conversationState(conversation)
    },
    messages: await getMessagesAfter(sql, admin.tenantId, conversation.id, afterSequence)
  };
}

export async function takeoverConversation(admin: AdminUser, conversationId: string, sql: Sql = createSqlClient()) {
  const rows = await sql`
    UPDATE flowbot_conversations
    SET status = 'admin_active', unread_admin = 0, last_activity_at = now()
    WHERE tenant_id = ${admin.tenantId}
      AND id = ${conversationId}
      AND status IN ('bot','awaiting_admin')
      AND deleted_at IS NULL
    RETURNING id, tenant_id, bot_id, flow_version_id, customer_id, status, current_node_id, lang, crm_status, session_expires_at
  `;
  const conversation = rows[0] as ConversationRow | undefined;
  if (!conversation) return null;
  await insertEvent(sql, admin.tenantId, conversation.bot_id, conversation.id, "takeover", { adminUserId: admin.id });
  const state = conversationState(conversation);
  publishConversationEvent(conversation.id, { type: "state", payload: state });
  return state;
}

export async function releaseConversation(admin: AdminUser, conversationId: string, sql: Sql = createSqlClient()) {
  const rows = await sql`
    SELECT c.id, c.tenant_id, c.bot_id, c.flow_version_id, c.customer_id, c.status, c.current_node_id, c.lang, c.crm_status,
           c.session_expires_at, fv.snapshot
    FROM flowbot_conversations c
    JOIN flowbot_flow_versions fv ON fv.tenant_id = c.tenant_id AND fv.id = c.flow_version_id
    WHERE c.tenant_id = ${admin.tenantId}
      AND c.id = ${conversationId}
      AND c.status = 'admin_active'
      AND c.deleted_at IS NULL
    LIMIT 1
  `;
  const row = rows[0] as (ConversationRow & { snapshot: FlowSnapshot }) | undefined;
  if (!row) return null;
  const snapshot = row.snapshot;
  await sql`
    UPDATE flowbot_conversations
    SET status = 'bot', current_node_id = ${snapshot.rootNodeId}, last_activity_at = now()
    WHERE tenant_id = ${admin.tenantId}
      AND id = ${conversationId}
  `;
  await insertEvent(sql, admin.tenantId, row.bot_id, row.id, "release", { adminUserId: admin.id });
  const messages = await insertBotMessages(sql, {
    tenantId: admin.tenantId,
    conversationId,
    flowVersionId: row.flow_version_id,
    nodeId: snapshot.rootNodeId,
    messages: [
      {
        type: "options",
        content: {
          text: row.lang === "th" ? snapshot.nodes[snapshot.rootNodeId]?.contentTh : snapshot.nodes[snapshot.rootNodeId]?.contentEn,
          options: (snapshot.nodes[snapshot.rootNodeId]?.options ?? []).map((option) => ({
            id: option.id,
            label: row.lang === "th" ? option.labelTh : option.labelEn,
            targetNodeId: option.targetNodeId
          }))
        }
      }
    ]
  });
  const state = { status: "bot" as const, currentNodeId: snapshot.rootNodeId, flowVersionId: row.flow_version_id, lang: row.lang };
  for (const message of messages) publishConversationEvent(conversationId, { type: "message", sequence: message.sequence, payload: message });
  publishConversationEvent(conversationId, { type: "state", payload: state });
  return { state, messages };
}

export async function adminReply(params: { admin: AdminUser; conversationId: string; idempotencyKey: string; text: string; sql?: Sql }) {
  const sql = params.sql ?? createSqlClient();
  const conversations = await sql`
    SELECT id, tenant_id, bot_id, flow_version_id, customer_id, status, current_node_id, lang, crm_status, session_expires_at
    FROM flowbot_conversations
    WHERE tenant_id = ${params.admin.tenantId}
      AND id = ${params.conversationId}
      AND status = 'admin_active'
      AND deleted_at IS NULL
    LIMIT 1
  `;
  const conversation = conversations[0] as ConversationRow | undefined;
  if (!conversation) return null;

  const rows = await sql`
    INSERT INTO flowbot_messages (
      tenant_id, conversation_id, flow_version_id, sender, admin_user_id, type, content, client_request_id
    )
    VALUES (
      ${params.admin.tenantId}, ${params.conversationId}, ${conversation.flow_version_id}, 'admin',
      ${params.admin.id}, 'text', ${JSON.stringify({ text: params.text })}, ${params.idempotencyKey}
    )
    ON CONFLICT DO NOTHING
    RETURNING id, sequence::text, sender, type, content, node_id, created_at
  `;
  const existingOrInserted = rows[0]
    ? rows
    : await sql`
        SELECT id, sequence::text, sender, type, content, node_id, created_at
        FROM flowbot_messages
        WHERE tenant_id = ${params.admin.tenantId}
          AND conversation_id = ${params.conversationId}
          AND sender = 'admin'
          AND client_request_id = ${params.idempotencyKey}
        LIMIT 1
      `;
  const message = mapMessage(existingOrInserted[0] as MessageRow);
  await sql`
    UPDATE flowbot_conversations
    SET last_activity_at = now()
    WHERE tenant_id = ${params.admin.tenantId}
      AND id = ${params.conversationId}
  `;
  publishConversationEvent(params.conversationId, { type: "message", sequence: message.sequence, payload: message });
  return message;
}

export async function getMessagesAfter(sql: Sql, tenantId: string, conversationId: string, afterSequence?: string) {
  const rows = afterSequence
    ? await sql`
        SELECT id, sequence::text, sender, type, content, node_id, created_at
        FROM flowbot_messages
        WHERE tenant_id = ${tenantId}
          AND conversation_id = ${conversationId}
          AND sequence > ${afterSequence}
        ORDER BY sequence ASC
        LIMIT 100
      `
    : await sql`
        SELECT id, sequence::text, sender, type, content, node_id, created_at
        FROM flowbot_messages
        WHERE tenant_id = ${tenantId}
          AND conversation_id = ${conversationId}
        ORDER BY sequence DESC
        LIMIT 50
      `;
  return (afterSequence ? rows : [...rows].reverse()).map((row: unknown) => mapMessage(row as MessageRow));
}

function conversationState(conversation: ConversationRow): ConversationState {
  return {
    status: conversation.status,
    currentNodeId: conversation.current_node_id,
    flowVersionId: conversation.flow_version_id,
    lang: conversation.lang
  };
}

async function getBotByKey(botKey: string, sql: Sql): Promise<BotRow | null> {
  const rows = await sql`
    SELECT id, tenant_id, public_key, name, default_lang, widget_settings, allowed_origins, published_version_id
    FROM flowbot_bots
    WHERE public_key = ${botKey}
    LIMIT 1
  `;
  return (rows[0] as BotRow | undefined) ?? null;
}

async function getConversationByToken(params: { bot: BotRow; sessionToken: string; sql: Sql }) {
  const tokenHash = hashSessionToken(params.sessionToken);
  const rows = await params.sql`
    SELECT id, tenant_id, bot_id, flow_version_id, customer_id, status, current_node_id, lang, crm_status, session_expires_at
    FROM flowbot_conversations
    WHERE tenant_id = ${params.bot.tenant_id}
      AND bot_id = ${params.bot.id}
      AND session_token_hash = ${tokenHash}
      AND session_expires_at > now()
      AND deleted_at IS NULL
    LIMIT 1
  `;
  return (rows[0] as ConversationRow | undefined) ?? null;
}

async function getConversationByTokenForUpdate(params: { bot: BotRow; sessionToken: string; sql: Sql }) {
  const tokenHash = hashSessionToken(params.sessionToken);
  const rows = await params.sql`
    SELECT id, tenant_id, bot_id, flow_version_id, customer_id, status, current_node_id, lang, crm_status, session_expires_at
    FROM flowbot_conversations
    WHERE tenant_id = ${params.bot.tenant_id}
      AND bot_id = ${params.bot.id}
      AND session_token_hash = ${tokenHash}
      AND session_expires_at > now()
      AND deleted_at IS NULL
    LIMIT 1
    FOR UPDATE
  `;
  return (rows[0] as ConversationRow | undefined) ?? null;
}

async function loadSnapshot(sql: Sql, tenantId: string, flowVersionId: string): Promise<FlowSnapshot> {
  const rows = await sql`
    SELECT snapshot
    FROM flowbot_flow_versions
    WHERE tenant_id = ${tenantId}
      AND id = ${flowVersionId}
      AND status IN ('published','retired')
    LIMIT 1
  `;
  const rawSnapshot = rows[0]?.snapshot;
  if (!rawSnapshot) throw new Error("Published flow snapshot not found.");
  const snapshot = flowSnapshotSchema.parse(rawSnapshot);
  if (snapshot.keywords.length > 0) return snapshot;

  const keywords = await sql`
    SELECT node_id, keyword, lang, priority, substring_enabled
    FROM flowbot_node_keywords
    WHERE tenant_id = ${tenantId}
      AND flow_version_id = ${flowVersionId}
    ORDER BY priority ASC, created_at ASC
  `;
  return {
    ...snapshot,
    keywords: keywords.map((keyword: Record<string, unknown>, index: number) => ({
      nodeId: String(keyword.node_id),
      keyword: String(keyword.keyword),
      lang: keyword.lang === "en" ? "en" : "th",
      priority: Number(keyword.priority ?? 100),
      substringEnabled: keyword.substring_enabled !== false,
      order: index
    }))
  };
}

async function insertVisitorMessage(sql: Sql, params: { tenantId: string; conversationId: string; flowVersionId: string; inputId: string; input: EngineInput }) {
  const content = visitorContent(params.input);
  const rows = await sql`
    INSERT INTO flowbot_messages (tenant_id, conversation_id, flow_version_id, sender, type, content, client_request_id)
    VALUES (${params.tenantId}, ${params.conversationId}, ${params.flowVersionId}, 'visitor', ${content.type}, ${JSON.stringify(content.content)}, ${params.inputId})
    RETURNING id, sequence::text, sender, type, content, node_id, created_at
  `;
  return mapMessage(rows[0] as MessageRow);
}

async function insertBotMessages(sql: Sql, params: { tenantId: string; conversationId: string; flowVersionId: string; messages: { type: string; content: Record<string, unknown> }[]; nodeId?: string | null }) {
  const inserted: ApiMessage[] = [];
  for (const message of params.messages) {
    const rows = await sql`
      INSERT INTO flowbot_messages (tenant_id, conversation_id, flow_version_id, sender, type, content, node_id)
      VALUES (${params.tenantId}, ${params.conversationId}, ${params.flowVersionId}, 'bot', ${message.type}, ${JSON.stringify(message.content)}, ${params.nodeId ?? null})
      RETURNING id, sequence::text, sender, type, content, node_id, created_at
    `;
    inserted.push(mapMessage(rows[0] as MessageRow));
  }
  return inserted;
}

function visitorContent(input: EngineInput) {
  if (input.type === "text") return { type: "text", content: { text: input.payload.text } };
  if (input.type === "option") return { type: "text", content: { optionId: input.payload.optionId } };
  if (input.type === "form") return { type: "form", content: { nodeId: input.payload.nodeId, data: input.payload.data } };
  if (input.type === "action") return { type: "system", content: { action: input.payload.action } };
  return { type: "audio", content: input.payload };
}

async function createLead(sql: Sql, params: { tenantId: string; conversationId: string; flowVersionId: string; sourceNodeId: string; data: Record<string, string> }) {
  const name = params.data.name?.trim() || null;
  const phone = params.data.phone?.trim() || null;
  const email = params.data.email?.trim().toLowerCase() || null;
  const phoneNormalized = phone?.replace(/[^\d+]/g, "") || null;
  const customerRows = await sql`
    INSERT INTO flowbot_customers (tenant_id, name, phone, phone_normalized, email)
    VALUES (${params.tenantId}, ${name}, ${phone}, ${phoneNormalized}, ${email})
    RETURNING id
  `;
  const customerId = customerRows[0].id as string;
  const leadRows = await sql`
    INSERT INTO flowbot_leads (
      tenant_id, conversation_id, customer_id, flow_version_id, source_node_id,
      name, phone, phone_normalized, email, extra
    )
    VALUES (
      ${params.tenantId}, ${params.conversationId}, ${customerId}, ${params.flowVersionId}, ${params.sourceNodeId},
      ${name}, ${phone}, ${phoneNormalized}, ${email}, ${JSON.stringify(params.data)}
    )
    RETURNING id, name, phone, email::text
  `;
  await sql`
    UPDATE flowbot_conversations
    SET customer_id = ${customerId}
    WHERE tenant_id = ${params.tenantId}
      AND id = ${params.conversationId}
  `;
  return leadRows[0];
}

async function insertOutbox(sql: Sql, tenantId: string, conversationId: string, reason: string) {
  await sql`
    INSERT INTO flowbot_notification_outbox (tenant_id, conversation_id, channel, type, dedupe_key, payload)
    VALUES (
      ${tenantId}, ${conversationId}, 'email', 'handoff_requested',
      ${`handoff:${conversationId}`}, ${JSON.stringify({ reason })}
    )
    ON CONFLICT (tenant_id, dedupe_key) DO NOTHING
  `;
}

async function getContactChannels(sql: Sql, tenantId: string, botId: string) {
  return sql`
    SELECT type, label, value
    FROM flowbot_contact_channels
    WHERE tenant_id = ${tenantId}
      AND bot_id = ${botId}
    ORDER BY sort_order ASC
  `;
}

async function insertEvent(sql: Sql, tenantId: string, botId: string, conversationId: string, type: string, payload: Record<string, unknown>) {
  await sql`
    INSERT INTO flowbot_events (tenant_id, bot_id, conversation_id, type, payload)
    VALUES (${tenantId}, ${botId}, ${conversationId}, ${type}, ${JSON.stringify(payload)})
  `;
}

async function withPgTransaction<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
  const client = await getPgPool().connect();
  const sql = createTxSql(client);

  try {
    await client.query("BEGIN");
    const result = await fn(sql);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function createTxSql(client: PoolClient): Sql {
  return async (strings: TemplateStringsArray, ...values: unknown[]) => {
    let text = "";
    for (let index = 0; index < strings.length; index += 1) {
      text += strings[index];
      if (index < values.length) text += `$${index + 1}`;
    }
    const result = await client.query(text, values);
    return result.rows;
  };
}

function getPgPool(): Pool {
  if (!pgPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is required.");
    pgPool = new Pool({ connectionString });
  }
  return pgPool;
}

function mapMessage(row: MessageRow): ApiMessage {
  return {
    id: row.id,
    sequence: String(row.sequence),
    sender: row.sender,
    type: row.type,
    content: row.content,
    nodeId: row.node_id ?? undefined,
    createdAt: new Date(row.created_at).toISOString()
  };
}
