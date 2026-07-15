import { createSqlClient, type AdminUser } from "@flowbot/db";

type Sql = any;

export const crmStatuses = ["new", "pending_follow_up", "appointment_made", "not_closed_follow", "closed_deal"] as const;
export type CrmStatus = (typeof crmStatuses)[number];

export type InboxFilter = {
  q?: string | undefined;
  status?: string | undefined;
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

function mapMessage(row: MessageRow) {
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

function textFromContent(content: unknown): string {
  if (!content || typeof content !== "object") return "";
  const record = content as Record<string, unknown>;
  if (typeof record.text === "string") return record.text;
  if (typeof record.action === "string") return record.action;
  if (record.data && typeof record.data === "object") {
    return Object.values(record.data as Record<string, unknown>)
      .map((value) => String(value ?? ""))
      .filter(Boolean)
      .join(" ");
  }
  return "";
}

function customerSearchText(row: Record<string, unknown>): string {
  return [row.customer_name, row.customer_email, row.customer_phone, row.last_message_text, row.id]
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");
}

export async function listDashboardConversations(admin: AdminUser, filters: InboxFilter = {}, sql: Sql = createSqlClient()) {
  const rows = await sql`
    SELECT c.id, c.status, c.crm_status, c.lang, c.starred, c.archived, c.unread_admin, c.started_at, c.last_activity_at,
           c.customer_id, b.name AS bot_name, fv.version_no,
           COALESCE(cu.name, '') AS customer_name,
           COALESCE(cu.email::text, '') AS customer_email,
           COALESCE(cu.phone, '') AS customer_phone,
           lm.sender AS last_sender,
           lm.type AS last_type,
           lm.content AS last_content,
           lm.created_at AS last_message_at
    FROM flowbot_conversations c
    JOIN flowbot_bots b ON b.tenant_id = c.tenant_id AND b.id = c.bot_id
    JOIN flowbot_flow_versions fv ON fv.tenant_id = c.tenant_id AND fv.id = c.flow_version_id
    LEFT JOIN flowbot_customers cu ON cu.tenant_id = c.tenant_id AND cu.id = c.customer_id
    LEFT JOIN LATERAL (
      SELECT sender, type, content, created_at
      FROM flowbot_messages m
      WHERE m.tenant_id = c.tenant_id AND m.conversation_id = c.id
      ORDER BY sequence DESC
      LIMIT 1
    ) lm ON true
    WHERE c.tenant_id = ${admin.tenantId}
      AND c.deleted_at IS NULL
    ORDER BY c.last_activity_at DESC
    LIMIT 250
  `;

  const q = filters.q?.trim().toLowerCase();
  const status = filters.status?.trim();

  return rows
    .map((row: Record<string, unknown>) => ({
      id: row.id,
      status: row.status,
      crmStatus: row.crm_status,
      lang: row.lang,
      starred: row.starred,
      archived: row.archived,
      unreadAdmin: row.unread_admin,
      startedAt: new Date(row.started_at as string | Date).toISOString(),
      lastActivityAt: new Date(row.last_activity_at as string | Date).toISOString(),
      customerId: row.customer_id,
      customerName: row.customer_name,
      customerEmail: row.customer_email,
      customerPhone: row.customer_phone,
      botName: row.bot_name,
      flowVersionNo: row.version_no,
      lastSender: row.last_sender,
      lastType: row.last_type,
      lastMessageText: textFromContent(row.last_content),
      lastMessageAt: row.last_message_at ? new Date(row.last_message_at as string | Date).toISOString() : null
    }))
    .filter((row: Record<string, unknown>) => {
      if (status === "unread" && Number(row.unreadAdmin) <= 0) return false;
      if (status === "awaiting" && row.status !== "awaiting_admin") return false;
      if (status === "starred" && !row.starred) return false;
      if (status === "archived" && !row.archived) return false;
      if (status && crmStatuses.includes(status as CrmStatus) && row.crmStatus !== status) return false;
      if (q && !customerSearchText(row).includes(q)) return false;
      return true;
    });
}

export async function getDashboardConversation(admin: AdminUser, conversationId: string, sql: Sql = createSqlClient()) {
  const rows = await sql`
    SELECT c.id, c.status, c.crm_status, c.lang, c.starred, c.archived, c.unread_admin, c.started_at, c.last_activity_at,
           c.flow_version_id, c.customer_id, b.name AS bot_name, fv.version_no
    FROM flowbot_conversations c
    JOIN flowbot_bots b ON b.tenant_id = c.tenant_id AND b.id = c.bot_id
    JOIN flowbot_flow_versions fv ON fv.tenant_id = c.tenant_id AND fv.id = c.flow_version_id
    WHERE c.tenant_id = ${admin.tenantId}
      AND c.id = ${conversationId}
      AND c.deleted_at IS NULL
    LIMIT 1
  `;
  const conversation = rows[0] as Record<string, unknown> | undefined;
  if (!conversation) return null;

  await sql`
    UPDATE flowbot_conversations
    SET unread_admin = 0
    WHERE tenant_id = ${admin.tenantId}
      AND id = ${conversationId}
  `;

  const [messages, customerRows, leadRows, noteRows] = await Promise.all([
    sql`
      SELECT id, sequence::text, sender, type, content, node_id, created_at
      FROM flowbot_messages
      WHERE tenant_id = ${admin.tenantId}
        AND conversation_id = ${conversationId}
      ORDER BY sequence ASC
      LIMIT 250
    `,
    conversation.customer_id
      ? sql`
          SELECT id, name, email::text, phone, line_id, whatsapp, note, created_at, updated_at
          FROM flowbot_customers
          WHERE tenant_id = ${admin.tenantId}
            AND id = ${conversation.customer_id}
            AND deleted_at IS NULL
          LIMIT 1
        `
      : [],
    sql`
      SELECT id, customer_id, name, phone, email::text, extra, created_at
      FROM flowbot_leads
      WHERE tenant_id = ${admin.tenantId}
        AND conversation_id = ${conversationId}
        AND deleted_at IS NULL
      ORDER BY created_at DESC
    `,
    sql`
      SELECT n.id, n.note, n.created_at, u.name AS user_name
      FROM flowbot_conversation_notes n
      JOIN flowbot_users u ON u.tenant_id = n.tenant_id AND u.id = n.user_id
      WHERE n.tenant_id = ${admin.tenantId}
        AND n.conversation_id = ${conversationId}
      ORDER BY n.created_at DESC
      LIMIT 100
    `
  ]);

  return {
    conversation: {
      id: conversation.id,
      status: conversation.status,
      crmStatus: conversation.crm_status,
      lang: conversation.lang,
      starred: conversation.starred,
      archived: conversation.archived,
      unreadAdmin: 0,
      startedAt: new Date(conversation.started_at as string | Date).toISOString(),
      lastActivityAt: new Date(conversation.last_activity_at as string | Date).toISOString(),
      flowVersionId: conversation.flow_version_id,
      flowVersionNo: conversation.version_no,
      customerId: conversation.customer_id,
      botName: conversation.bot_name
    },
    messages: (messages as MessageRow[]).map(mapMessage),
    customer: customerRows[0] ?? null,
    leads: leadRows,
    notes: noteRows.map((row: Record<string, unknown>) => ({
      id: row.id,
      note: row.note,
      userName: row.user_name,
      createdAt: new Date(row.created_at as string | Date).toISOString()
    })),
    matchSuggestions: await getCustomerMatchSuggestions(admin, leadRows[0] as Record<string, unknown> | undefined, sql)
  };
}

export async function updateDashboardConversation(
  admin: AdminUser,
  conversationId: string,
  patch: { crmStatus?: CrmStatus | undefined; starred?: boolean | undefined; archived?: boolean | undefined; customerId?: string | null | undefined },
  sql: Sql = createSqlClient()
) {
  if (patch.customerId) {
    const allowed = await sql`
      SELECT id
      FROM flowbot_customers
      WHERE tenant_id = ${admin.tenantId}
        AND id = ${patch.customerId}
        AND deleted_at IS NULL
      LIMIT 1
    `;
    if (!allowed[0]) return null;
  }

  const rows = await sql`
    UPDATE flowbot_conversations
    SET crm_status = COALESCE(${patch.crmStatus ?? null}, crm_status),
        starred = COALESCE(${patch.starred ?? null}, starred),
        archived = COALESCE(${patch.archived ?? null}, archived),
        customer_id = CASE WHEN ${patch.customerId === undefined} THEN customer_id ELSE ${patch.customerId ?? null}::uuid END,
        last_activity_at = last_activity_at
    WHERE tenant_id = ${admin.tenantId}
      AND id = ${conversationId}
      AND deleted_at IS NULL
    RETURNING id, status, crm_status, starred, archived, customer_id
  `;
  return rows[0] ?? null;
}

export async function softDeleteDashboardConversation(admin: AdminUser, conversationId: string, sql: Sql = createSqlClient()) {
  const rows = await sql`
    UPDATE flowbot_conversations
    SET deleted_at = now(), archived = true
    WHERE tenant_id = ${admin.tenantId}
      AND id = ${conversationId}
      AND deleted_at IS NULL
    RETURNING id
  `;
  return rows[0] ?? null;
}

export async function addConversationNote(admin: AdminUser, conversationId: string, note: string, sql: Sql = createSqlClient()) {
  const conversation = await sql`
    SELECT id
    FROM flowbot_conversations
    WHERE tenant_id = ${admin.tenantId}
      AND id = ${conversationId}
      AND deleted_at IS NULL
    LIMIT 1
  `;
  if (!conversation[0]) return null;
  const rows = await sql`
    INSERT INTO flowbot_conversation_notes (tenant_id, conversation_id, user_id, note)
    VALUES (${admin.tenantId}, ${conversationId}, ${admin.id}, ${note})
    RETURNING id, note, created_at
  `;
  return {
    id: rows[0].id,
    note: rows[0].note,
    userName: admin.name,
    createdAt: new Date(rows[0].created_at).toISOString()
  };
}

export async function listCustomers(admin: AdminUser, q?: string, sql: Sql = createSqlClient()) {
  const rows = await sql`
    SELECT cu.id, cu.name, cu.email::text, cu.phone, cu.line_id, cu.whatsapp, cu.note, cu.created_at, cu.updated_at,
           COUNT(DISTINCT c.id)::int AS conversation_count,
           MAX(c.last_activity_at) AS last_contact_at,
           MAX(c.crm_status) AS latest_crm_status
    FROM flowbot_customers cu
    LEFT JOIN flowbot_conversations c ON c.tenant_id = cu.tenant_id AND c.customer_id = cu.id AND c.deleted_at IS NULL
    WHERE cu.tenant_id = ${admin.tenantId}
      AND cu.deleted_at IS NULL
    GROUP BY cu.id
    ORDER BY COALESCE(MAX(c.last_activity_at), cu.updated_at) DESC
    LIMIT 250
  `;
  const query = q?.trim().toLowerCase();
  return rows.filter((row: Record<string, unknown>) => {
    if (!query) return true;
    return [row.name, row.email, row.phone, row.line_id, row.whatsapp]
      .map((value) => String(value ?? "").toLowerCase())
      .join(" ")
      .includes(query);
  });
}

export async function createCustomer(
  admin: AdminUser,
  data: { name?: string | undefined; email?: string | undefined; phone?: string | undefined; lineId?: string | undefined; whatsapp?: string | undefined; note?: string | undefined },
  sql: Sql = createSqlClient()
) {
  const phone = data.phone?.trim() || null;
  const phoneNormalized = phone?.replace(/[^\d+]/g, "") || null;
  const rows = await sql`
    INSERT INTO flowbot_customers (tenant_id, name, email, phone, phone_normalized, line_id, whatsapp, note)
    VALUES (
      ${admin.tenantId},
      ${data.name?.trim() || null},
      ${data.email?.trim().toLowerCase() || null},
      ${phone},
      ${phoneNormalized},
      ${data.lineId?.trim() || null},
      ${data.whatsapp?.trim() || null},
      ${data.note?.trim() || ""}
    )
    RETURNING id, name, email::text, phone, line_id, whatsapp, note, created_at, updated_at
  `;
  return rows[0];
}

export async function updateCustomer(
  admin: AdminUser,
  customerId: string,
  data: {
    name?: string | null | undefined;
    email?: string | null | undefined;
    phone?: string | null | undefined;
    lineId?: string | null | undefined;
    whatsapp?: string | null | undefined;
    note?: string | null | undefined;
  },
  sql: Sql = createSqlClient()
) {
  const phone = data.phone === undefined ? undefined : data.phone?.trim() || null;
  const phoneNormalized = phone === undefined ? undefined : phone?.replace(/[^\d+]/g, "") || null;
  const rows = await sql`
    UPDATE flowbot_customers
    SET name = COALESCE(${data.name === undefined ? null : data.name?.trim() || null}, name),
        email = COALESCE(${data.email === undefined ? null : data.email?.trim().toLowerCase() || null}, email),
        phone = COALESCE(${phone === undefined ? null : phone}, phone),
        phone_normalized = COALESCE(${phoneNormalized === undefined ? null : phoneNormalized}, phone_normalized),
        line_id = COALESCE(${data.lineId === undefined ? null : data.lineId?.trim() || null}, line_id),
        whatsapp = COALESCE(${data.whatsapp === undefined ? null : data.whatsapp?.trim() || null}, whatsapp),
        note = COALESCE(${data.note === undefined ? null : data.note?.trim() ?? ""}, note),
        updated_at = now()
    WHERE tenant_id = ${admin.tenantId}
      AND id = ${customerId}
      AND deleted_at IS NULL
    RETURNING id, name, email::text, phone, line_id, whatsapp, note, created_at, updated_at
  `;
  return rows[0] ?? null;
}

export async function softDeleteCustomer(admin: AdminUser, customerId: string, sql: Sql = createSqlClient()) {
  const rows = await sql`
    UPDATE flowbot_customers
    SET deleted_at = now()
    WHERE tenant_id = ${admin.tenantId}
      AND id = ${customerId}
      AND deleted_at IS NULL
    RETURNING id
  `;
  return rows[0] ?? null;
}

export async function listLeads(admin: AdminUser, sql: Sql = createSqlClient()) {
  return sql`
    SELECT l.id, l.conversation_id, l.customer_id, l.name, l.phone, l.email::text, l.extra, l.created_at,
           c.crm_status, c.status AS conversation_status
    FROM flowbot_leads l
    LEFT JOIN flowbot_conversations c ON c.tenant_id = l.tenant_id AND c.id = l.conversation_id
    WHERE l.tenant_id = ${admin.tenantId}
      AND l.deleted_at IS NULL
    ORDER BY l.created_at DESC
    LIMIT 250
  `;
}

export async function getOverview(admin: AdminUser, sql: Sql = createSqlClient()) {
  const [conversationCounts, crmCounts, eventCounts, unmatched, recentLeads, botStatus] = await Promise.all([
    sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'awaiting_admin')::int AS awaiting,
        COUNT(*) FILTER (WHERE status = 'admin_active')::int AS admin_active,
        COUNT(*) FILTER (WHERE unread_admin > 0)::int AS unread,
        COUNT(*) FILTER (WHERE started_at >= now() - interval '7 days')::int AS last_7_days
      FROM flowbot_conversations
      WHERE tenant_id = ${admin.tenantId}
        AND deleted_at IS NULL
    `,
    sql`
      SELECT crm_status, COUNT(*)::int AS count
      FROM flowbot_conversations
      WHERE tenant_id = ${admin.tenantId}
        AND deleted_at IS NULL
      GROUP BY crm_status
    `,
    sql`
      SELECT type, COUNT(*)::int AS count
      FROM flowbot_events
      WHERE tenant_id = ${admin.tenantId}
        AND created_at >= now() - interval '30 days'
      GROUP BY type
    `,
    sql`
      SELECT payload->>'text' AS text, COUNT(*)::int AS count, MAX(created_at) AS last_seen_at
      FROM flowbot_events
      WHERE tenant_id = ${admin.tenantId}
        AND type IN ('keyword_miss','fallback')
      GROUP BY payload->>'text'
      ORDER BY COUNT(*) DESC, MAX(created_at) DESC
      LIMIT 20
    `,
    sql`
      SELECT COUNT(*)::int AS count
      FROM flowbot_leads
      WHERE tenant_id = ${admin.tenantId}
        AND deleted_at IS NULL
        AND created_at >= now() - interval '30 days'
    `,
    sql`
      SELECT b.id, b.name, b.public_key, b.published_version_id, b.widget_settings, fv.version_no,
             (SELECT COUNT(*)::int FROM flowbot_flow_versions d WHERE d.tenant_id = b.tenant_id AND d.bot_id = b.id AND d.status = 'draft') AS draft_count
      FROM flowbot_bots b
      LEFT JOIN flowbot_flow_versions fv ON fv.tenant_id = b.tenant_id AND fv.id = b.published_version_id
      WHERE b.tenant_id = ${admin.tenantId}
      ORDER BY b.created_at ASC
      LIMIT 10
    `
  ]);

  const eventMap = Object.fromEntries(eventCounts.map((row: Record<string, unknown>) => [row.type, Number(row.count)]));
  const totalTyped = Number(eventMap.keyword_match ?? 0) + Number(eventMap.keyword_miss ?? 0);
  const matchRate = totalTyped ? Math.round((Number(eventMap.keyword_match ?? 0) / totalTyped) * 100) : 0;

  return {
    conversations: conversationCounts[0],
    crm: crmCounts,
    events: eventMap,
    matchRate,
    leadsLast30Days: recentLeads[0]?.count ?? 0,
    unmatched,
    bots: botStatus
  };
}

async function getCustomerMatchSuggestions(admin: AdminUser, lead?: Record<string, unknown>, sql: Sql = createSqlClient()) {
  if (!lead) return [];
  const email = typeof lead.email === "string" ? lead.email : null;
  const phone = typeof lead.phone === "string" ? lead.phone.replace(/[^\d+]/g, "") : null;
  if (!email && !phone) return [];
  return sql`
    SELECT id, name, email::text, phone, line_id, whatsapp
    FROM flowbot_customers
    WHERE tenant_id = ${admin.tenantId}
      AND deleted_at IS NULL
      AND id <> ${lead.customer_id ?? null}
      AND (
        (${email}::citext IS NOT NULL AND email = ${email})
        OR (${phone}::text IS NOT NULL AND phone_normalized = ${phone})
      )
    ORDER BY updated_at DESC
    LIMIT 10
  `;
}
