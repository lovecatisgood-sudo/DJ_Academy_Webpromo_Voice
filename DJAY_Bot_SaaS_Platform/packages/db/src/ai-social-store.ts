import { createHash, randomUUID } from "node:crypto";
import type { AiPublicResponse, AiTurnContext } from "@djay/ai-chat-runtime";
import type { SalesCoreOutput } from "@djay/sales-core";
import { createOpaqueToken, hashOpaqueToken, openJson, sealJson } from "@djay/auth";
import type { TenantContext } from "@djay/tenancy";
import { z } from "zod";
import type { DatabaseClient } from "./client";
import { withTenantTransaction } from "./scoped-transaction";
import { checkSocialChannelAdmission, claimIncludedSocialChannel } from "./social-channel-admission";

export type SocialChannel = "line" | "whatsapp" | "messenger";
type SocialConnectionInput = Readonly<{
  agentId: string; name: string; externalAccountRef: string;
  credentials: unknown; envelopeKey: Buffer;
}>;
type SocialRotationInput = Readonly<{
  connectionId: string; credentials: unknown; envelopeKey: Buffer;
}>;

export class AiSocialConnectionStore {
  constructor(private readonly client: DatabaseClient) {}

  async list(context: TenantContext) {
    return withTenantTransaction(this.client, context, async ({ sql }) => sql<{
      id: string;
      agentId: string;
      channel: SocialChannel;
      name: string;
      externalAccountRef: string;
      status: "active" | "reauthorization_required" | "revoked";
      healthStatus: "unchecked" | "healthy" | "degraded" | "failed";
      safeErrorCode: string | null;
      createdAt: Date;
      lastHealthAt: Date | null;
      revokedAt: Date | null;
      pendingDeliveries: number;
      failedDeliveries: number;
      deadLetterDeliveries: number;
      succeededDeliveries: number;
      attemptedQuantity: number;
    }[]>`
      SELECT id, agent_id AS "agentId", channel, name,
             external_account_ref AS "externalAccountRef", status,
             health_status AS "healthStatus", safe_error_code AS "safeErrorCode",
             connection.created_at AS "createdAt", last_health_at AS "lastHealthAt", revoked_at AS "revokedAt",
             COALESCE(delivery.pending, 0)::int AS "pendingDeliveries",
             COALESCE(delivery.failed, 0)::int AS "failedDeliveries",
             COALESCE(delivery.dead_letter, 0)::int AS "deadLetterDeliveries",
             COALESCE(delivery.succeeded, 0)::int AS "succeededDeliveries",
             COALESCE(quantity.attempted, 0)::int AS "attemptedQuantity"
      FROM tenancy.ai_social_connections connection
      LEFT JOIN LATERAL (
        SELECT count(*) FILTER (WHERE status IN ('pending', 'processing')) AS pending,
               count(*) FILTER (WHERE status = 'failed') AS failed,
               count(*) FILTER (WHERE status = 'dead_letter') AS dead_letter,
               count(*) FILTER (WHERE status = 'succeeded') AS succeeded
        FROM tenancy.ai_social_outbound_deliveries item
        WHERE item.tenant_id = connection.tenant_id AND item.connection_id = connection.id
      ) delivery ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(sum(event.attempted_quantity), 0) AS attempted
        FROM tenancy.ai_social_channel_quantity_events event
        WHERE event.tenant_id = connection.tenant_id AND event.connection_id = connection.id
      ) quantity ON true
      WHERE connection.tenant_id = ${context.tenantId}::uuid
      ORDER BY connection.created_at DESC, connection.id DESC
    `);
  }

  async createLine(context: TenantContext, input: SocialConnectionInput) {
    return this.createChannel(context, "line", input);
  }

  async createWhatsApp(context: TenantContext, input: SocialConnectionInput) {
    return this.createChannel(context, "whatsapp", input);
  }

  async createMessenger(context: TenantContext, input: SocialConnectionInput) {
    return this.createChannel(context, "messenger", input);
  }

  private async createChannel(context: TenantContext, channel: SocialChannel, input: SocialConnectionInput) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const authority = await sql<{ entitled: boolean; socialChannelLimit: number | null }[]>`
        SELECT true AS entitled,
               CASE WHEN jsonb_typeof(snapshot.resolved_json->'limits'->'social_channels') = 'number'
                 THEN (snapshot.resolved_json->'limits'->>'social_channels')::int + COALESCE((
                   SELECT sum(add_on.quantity)::int FROM tenancy.subscription_add_ons add_on
                   WHERE add_on.tenant_id = snapshot.tenant_id
                     AND add_on.subscription_id = snapshot.subscription_id
                     AND add_on.add_on_key = 'additional_social_channel'
                     AND add_on.status IN ('active', 'scheduled_end')
                     AND add_on.effective_from <= now()
                     AND (add_on.effective_until IS NULL OR add_on.effective_until > now())
                 ), 0) ELSE NULL END AS "socialChannelLimit"
        FROM tenancy.entitlement_snapshots snapshot
        JOIN tenancy.product_subscriptions subscription
          ON subscription.tenant_id = snapshot.tenant_id AND subscription.id = snapshot.subscription_id
          AND subscription.status IN ('active', 'trialing', 'scheduled_change')
        JOIN catalog.plan_versions version ON version.id = snapshot.plan_version_id
        JOIN catalog.plans plan ON plan.id = version.plan_id
          AND plan.product_key = 'ai_chat' AND plan.plan_key = 'ai_chat_premium'
        WHERE snapshot.tenant_id = ${context.tenantId}::uuid
          AND snapshot.product_key = 'ai_chat' AND snapshot.access_mode = 'active'
          AND snapshot.resolved_json->'entitlements'->>(${`channel.${channel}`}::text) = 'true'
        ORDER BY snapshot.created_at DESC, snapshot.id DESC LIMIT 1
      `;
      if (!authority[0]?.entitled) return { status: "not_entitled" as const };
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${context.tenantId}:ai_chat:social_channels`}, 0))`;
      const agents = await sql<{ available: boolean }[]>`
        SELECT status = 'active' AND current_published_playbook_version_id IS NOT NULL
          AND tenancy.entitlement_resource_is_writable('ai_chat', 'bot', id) AS available
        FROM tenancy.ai_agents
        WHERE tenant_id = ${context.tenantId}::uuid AND id = ${input.agentId}::uuid
      `;
      if (!agents[0]?.available) return { status: "not_found" as const };
      const existing = await sql<{ exists: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM tenancy.ai_social_connections
          WHERE tenant_id = ${context.tenantId}::uuid AND channel = ${channel}
            AND external_account_ref = ${input.externalAccountRef}
        ) AS exists
      `;
      if (existing[0]?.exists) return { status: "conflict" as const };
      const counts = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM tenancy.ai_social_connections
        WHERE tenant_id = ${context.tenantId}::uuid AND status <> 'revoked'
      `;
      const limit = authority[0].socialChannelLimit;
      if (typeof limit === "number" && (counts[0]?.count ?? 0) >= limit) {
        return { status: "limit_reached" as const };
      }
      // CHN-004 parity with FlowBot: the included slot covers one channel.
      const admission = await checkSocialChannelAdmission(sql, context.tenantId, "ai_chat", channel);
      if (admission.status === "refused") {
        return { status: "channel_not_admitted" as const, decision: admission.decision };
      }

      const deploymentId = randomUUID();
      const connectionId = randomUUID();
      const webhookKey = `djay_social_${createOpaqueToken()}`;
      await sql`
        INSERT INTO tenancy.ai_deployments (
          id, tenant_id, agent_id, name, channel, created_by_membership_id
        ) VALUES (
          ${deploymentId}::uuid, ${context.tenantId}::uuid, ${input.agentId}::uuid,
          ${input.name}, ${channel}, ${context.membershipId}::uuid
        )
      `;
      await sql`
        INSERT INTO tenancy.ai_social_connections (
          id, tenant_id, agent_id, deployment_id, channel, name, external_account_ref,
          credential_ciphertext, webhook_key_hash, created_by_membership_id
        ) VALUES (
          ${connectionId}::uuid, ${context.tenantId}::uuid, ${input.agentId}::uuid,
          ${deploymentId}::uuid, ${channel}, ${input.name}, ${input.externalAccountRef},
          ${sealJson(input.credentials, input.envelopeKey)}, ${hashOpaqueToken(webhookKey)},
          ${context.membershipId}::uuid
        )
      `;
      await sql`
        INSERT INTO tenancy.audit_logs (
          tenant_id, actor_user_id, actor_membership_id, action, target_type,
          target_id, request_id, result, metadata
        ) VALUES (
          ${context.tenantId}::uuid, ${context.userId}::uuid, ${context.membershipId}::uuid,
          'ai_chat.social_connection_created', 'ai_social_connection', ${connectionId},
          ${context.requestId}, 'succeeded', ${sql.json({ channel })}
        )
      `;
      // An add-on channel is a paid EXTRA and must not take over the included slot.
      const slot = admission.status === "admitted" && admission.decision === "add_on"
        ? "unchanged" as const
        : await claimIncludedSocialChannel(sql, context.tenantId, "ai_chat", channel, context.membershipId);
      if (slot === "moved") {
        await sql`
          INSERT INTO tenancy.audit_logs (
            tenant_id, actor_user_id, actor_membership_id, action, target_type,
            target_id, request_id, result, metadata
          ) VALUES (
            ${context.tenantId}::uuid, ${context.userId}::uuid, ${context.membershipId}::uuid,
            'ai_chat.included_social_channel_moved', 'ai_social_connection', ${connectionId},
            ${context.requestId}, 'succeeded',
            ${sql.json({ channel, admission: admission.status === "admitted" ? admission.decision : "unenforced" })}
          )
        `;
      }
      return { status: "created" as const, connectionId, webhookKey };
    });
  }

  async revoke(context: TenantContext, connectionId: string) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ deploymentId: string; channel: SocialChannel }[]>`
        UPDATE tenancy.ai_social_connections
        SET status = 'revoked', revoked_at = now(), updated_at = now(),
            credential_ciphertext = 'revoked.' || encode(gen_random_bytes(24), 'base64'),
            safe_error_code = NULL
        WHERE tenant_id = ${context.tenantId}::uuid AND id = ${connectionId}::uuid
          AND status <> 'revoked'
        RETURNING deployment_id AS "deploymentId", channel
      `;
      if (!rows[0]) return { status: "not_found" as const };
      await sql`
        UPDATE tenancy.ai_deployments
        SET status = 'revoked', revoked_at = now()
        WHERE tenant_id = ${context.tenantId}::uuid AND id = ${rows[0].deploymentId}::uuid
      `;
      await sql`
        INSERT INTO tenancy.audit_logs (
          tenant_id, actor_user_id, actor_membership_id, action, target_type,
          target_id, request_id, result, metadata
        ) VALUES (
          ${context.tenantId}::uuid, ${context.userId}::uuid, ${context.membershipId}::uuid,
          'ai_chat.social_connection_revoked', 'ai_social_connection', ${connectionId},
          ${context.requestId}, 'succeeded', ${sql.json({ channel: rows[0].channel })}
        )
      `;
      return { status: "revoked" as const };
    });
  }

  async runtimeCredentials(context: TenantContext, connectionId: string, envelopeKey: Buffer) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{
        channel: SocialChannel;
        credentialCiphertext: string;
        credentialKeyVersion: number;
      }[]>`
        SELECT channel, credential_ciphertext AS "credentialCiphertext",
               credential_key_version AS "credentialKeyVersion"
        FROM tenancy.ai_social_connections
        WHERE tenant_id = ${context.tenantId}::uuid AND id = ${connectionId}::uuid
          AND status IN ('active', 'reauthorization_required')
      `;
      const row = rows[0];
      return row ? {
        channel: row.channel,
        credentialKeyVersion: row.credentialKeyVersion,
        credentials: openJson<unknown>(row.credentialCiphertext, envelopeKey),
      } : null;
    });
  }

  async rotateLine(context: TenantContext, input: SocialRotationInput) {
    return this.rotateChannel(context, "line", input);
  }

  async rotateWhatsApp(context: TenantContext, input: SocialRotationInput) {
    return this.rotateChannel(context, "whatsapp", input);
  }

  async rotateMessenger(context: TenantContext, input: SocialRotationInput) {
    return this.rotateChannel(context, "messenger", input);
  }

  private async rotateChannel(context: TenantContext, channel: SocialChannel, input: SocialRotationInput) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ credentialKeyVersion: number }[]>`
        UPDATE tenancy.ai_social_connections connection
        SET credential_ciphertext = ${sealJson(input.credentials, input.envelopeKey)},
            credential_key_version = connection.credential_key_version + 1,
            status = 'active', health_status = 'unchecked', safe_error_code = NULL,
            last_health_at = NULL, updated_at = now()
        WHERE connection.tenant_id = ${context.tenantId}::uuid
          AND connection.id = ${input.connectionId}::uuid
          AND connection.channel = ${channel} AND connection.status <> 'revoked'
        RETURNING credential_key_version AS "credentialKeyVersion"
      `;
      if (!rows[0]) return { status: "not_found" as const };
      await sql`
        INSERT INTO tenancy.audit_logs (
          tenant_id, actor_user_id, actor_membership_id, action, target_type,
          target_id, request_id, result, metadata
        ) VALUES (
          ${context.tenantId}::uuid, ${context.userId}::uuid, ${context.membershipId}::uuid,
          'ai_chat.social_credentials_rotated', 'ai_social_connection', ${input.connectionId},
          ${context.requestId}, 'succeeded',
          ${sql.json({ channel, credentialKeyVersion: rows[0].credentialKeyVersion })}
        )
      `;
      return { status: "rotated" as const, credentialKeyVersion: rows[0].credentialKeyVersion };
    });
  }

  async recordHealth(context: TenantContext, input: Readonly<{
    connectionId: string;
    healthy: boolean;
    reauthorizationRequired: boolean;
    safeErrorCode: string | null;
  }>) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ status: string; healthStatus: string; lastHealthAt: Date }[]>`
        UPDATE tenancy.ai_social_connections
        SET status = CASE WHEN ${input.reauthorizationRequired} THEN 'reauthorization_required' ELSE status END,
            health_status = CASE WHEN ${input.healthy} THEN 'healthy'
                                 WHEN ${input.reauthorizationRequired} THEN 'failed' ELSE 'degraded' END,
            safe_error_code = ${input.safeErrorCode}, last_health_at = now(), updated_at = now()
        WHERE tenant_id = ${context.tenantId}::uuid AND id = ${input.connectionId}::uuid
          AND status <> 'revoked'
        RETURNING status, health_status AS "healthStatus", last_health_at AS "lastHealthAt"
      `;
      if (!rows[0]) return { status: "not_found" as const };
      await sql`
        INSERT INTO tenancy.audit_logs (
          tenant_id, actor_user_id, actor_membership_id, action, target_type,
          target_id, request_id, result, metadata
        ) VALUES (
          ${context.tenantId}::uuid, ${context.userId}::uuid, ${context.membershipId}::uuid,
          'ai_chat.social_health_checked', 'ai_social_connection', ${input.connectionId},
          ${context.requestId}, ${input.healthy ? "succeeded" : "failed"},
          ${sql.json({ healthStatus: rows[0].healthStatus, safeErrorCode: input.safeErrorCode })}
        )
      `;
      return { status: "checked" as const, connectionStatus: rows[0].status,
        healthStatus: rows[0].healthStatus, lastHealthAt: rows[0].lastHealthAt };
    });
  }
}

export class AiSocialRuntimeStore {
  constructor(private readonly client: DatabaseClient, private readonly envelopeKey: Buffer) {}

  async connection(webhookKey: string, channel: SocialChannel) {
    const rows = await this.client<{
      connectionId: string;
      tenantId: string;
      channel: SocialChannel;
      credentialCiphertext: string;
      credentialKeyVersion: number;
    }[]>`
      SELECT connection_id AS "connectionId", tenant_id AS "tenantId", channel,
             credential_ciphertext AS "credentialCiphertext",
             credential_key_version AS "credentialKeyVersion"
      FROM tenancy.ai_social_runtime_connection(${hashOpaqueToken(webhookKey)}, ${channel})
    `;
    const row = rows[0];
    return row ? {
      connectionId: row.connectionId,
      tenantId: row.tenantId,
      channel: row.channel,
      credentialKeyVersion: row.credentialKeyVersion,
      credentials: openJson<unknown>(row.credentialCiphertext, this.envelopeKey),
    } : null;
  }

  async receive(input: Readonly<{
    webhookKey: string;
    channel: SocialChannel;
    receiptId?: string;
    externalEventId: string;
    externalMessageId: string | null;
    subjectHash: Buffer;
    eventType: "inbound.message" | "delivery.status" | "subject.opt_out";
    occurredAt: Date;
    normalized: Record<string, string | null>;
  }>) {
    const rows = await this.client<{
      receiptId: string;
      disposition: "accepted" | "out_of_order";
      replayed: boolean;
    }[]>`
      SELECT receipt_id AS "receiptId", disposition, replayed
      FROM tenancy.receive_ai_social_event(
        ${hashOpaqueToken(input.webhookKey)}, ${input.channel}, ${input.receiptId ?? randomUUID()}::uuid,
        ${input.externalEventId}, ${input.externalMessageId}, ${input.subjectHash},
        ${input.eventType}, ${input.occurredAt}, ${this.client.json(input.normalized)}
      )
    `;
    return rows[0] ?? null;
  }
}

const socialInboundClaimSchema = z.object({
  outbox_id: z.uuid(),
  receipt_id: z.uuid(),
  tenant_id: z.uuid(),
  connection_id: z.uuid(),
  channel: z.enum(["line", "whatsapp", "messenger"]),
  event_type: z.enum(["inbound.message", "delivery.status", "subject.opt_out"]),
  external_message_id: z.string().nullable(),
  subject_hash: z.instanceof(Buffer),
  occurred_at: z.coerce.date(),
  normalized_json: z.record(z.string(), z.unknown()),
  credential_ciphertext: z.string().nullable(),
  credential_key_version: z.number().int().positive(),
  attempt_count: z.number().int().positive(),
  processing_allowed: z.boolean(),
}).strict();

const encryptedValueSchema = z.object({ value: z.string().min(1).max(500) }).strict();
const socialDeliveryClaimSchema = z.object({
  delivery_id: z.uuid(), tenant_id: z.uuid(), connection_id: z.uuid(), message_id: z.uuid(),
  channel: z.enum(["line", "whatsapp", "messenger"]),
  recipient_ciphertext: z.string(), reply_token_ciphertext: z.string().nullable(),
  response_json: z.object({ text: z.string().min(1).max(5000), quickReplies: z.array(z.string()).max(6) }).passthrough(),
  credential_ciphertext: z.string().nullable(), credential_key_version: z.number().int().positive(),
  attempt_count: z.number().int().positive(), delivered_part_count: z.number().int().nonnegative(),
  service_window_open: z.boolean(), delivery_allowed: z.boolean(),
  // Added by migration 0084 (see the FlowBot claim schema for the rationale). Optional
  // so the worker keeps running before the migration is applied.
  inbound_occurred_at: z.coerce.date().nullish(),
}).strict();

export class AiSocialWorkerStore {
  constructor(private readonly client: DatabaseClient, private readonly envelopeKey: Buffer) {}

  async claim(now = new Date(), staleBefore = new Date(Date.now() - 5 * 60 * 1000)) {
    return this.client.begin(async (sql) => {
      await sql`
        SELECT set_config('app.service', 'ai_social_worker', true),
               set_config('app.request_id', ${randomUUID()}, true)
      `;
      const rows = await sql<Record<string, unknown>[]>`
        SELECT * FROM tenancy.claim_ai_social_inbound(${now}, ${staleBefore})
      `;
      const row = rows[0] ? socialInboundClaimSchema.parse(rows[0]) : null;
      if (!row) return null;
      const normalized = row.normalized_json;
      const subjectCiphertext = typeof normalized.subjectCiphertext === "string"
        ? normalized.subjectCiphertext : null;
      const replyTokenCiphertext = typeof normalized.replyTokenCiphertext === "string"
        ? normalized.replyTokenCiphertext : null;
      return {
        outboxId: row.outbox_id,
        receiptId: row.receipt_id,
        tenantId: row.tenant_id,
        connectionId: row.connection_id,
        channel: row.channel,
        eventType: row.event_type,
        externalMessageId: row.external_message_id,
        subjectHash: row.subject_hash,
        occurredAt: row.occurred_at,
        text: typeof normalized.text === "string" ? normalized.text : null,
        deliveryStatus: typeof normalized.deliveryStatus === "string" ? normalized.deliveryStatus : null,
        attemptCount: row.attempt_count,
        processingAllowed: row.processing_allowed,
        subjectCiphertext,
        externalSubject: row.processing_allowed && subjectCiphertext
          ? encryptedValueSchema.parse(openJson(subjectCiphertext, this.envelopeKey)).value : null,
        replyToken: row.processing_allowed && replyTokenCiphertext
          ? encryptedValueSchema.parse(openJson(replyTokenCiphertext, this.envelopeKey)).value : null,
        credentials: row.processing_allowed && row.credential_ciphertext
          ? openJson<unknown>(row.credential_ciphertext, this.envelopeKey) : null,
        credentialKeyVersion: row.credential_key_version,
      } as const;
    });
  }

  async beginTurn(claim: Readonly<{
    outboxId: string;
    eventType: "inbound.message" | "delivery.status" | "subject.opt_out";
    processingAllowed: boolean;
    subjectCiphertext: string | null;
    text: string | null;
  }>): Promise<AiTurnContext> {
    if (claim.eventType !== "inbound.message" || !claim.processingAllowed
      || !claim.subjectCiphertext || !claim.text) throw new Error("ai_social_turn_not_allowed");
    const customerMessageHash = createHash("sha256").update(claim.text).digest();
    const sessionHash = createHash("sha256").update(`social-session:${randomUUID()}`).digest();
    return this.client.begin(async (sql) => {
      await sql`
        SELECT set_config('app.service', 'ai_social_worker', true),
               set_config('app.request_id', ${randomUUID()}, true)
      `;
      const rows = await sql<{
        sessionId: string; tenantId: string; conversationId: string;
        playbook: unknown | null; language: "th" | "en"; authority: unknown | null;
        turnSequence: number; recentMessages: unknown; knowledgeChunks: unknown;
        replayResponse: AiTurnContext["replayResponse"];
      }[]>`
        SELECT session_id AS "sessionId", tenant_id AS "tenantId",
               conversation_id AS "conversationId", playbook_json AS playbook,
               language, authority_json AS authority, turn_sequence AS "turnSequence",
               recent_messages AS "recentMessages", knowledge_chunks AS "knowledgeChunks",
               replay_response_json AS "replayResponse"
        FROM tenancy.begin_ai_social_turn(
          ${claim.outboxId}::uuid, ${claim.subjectCiphertext},
          ${randomUUID()}::uuid, ${randomUUID()}::uuid, ${randomUUID()}::uuid,
          ${sessionHash}, ${randomUUID()}::uuid, ${randomUUID()}::uuid,
          ${claim.text}, ${customerMessageHash}
        )
      `;
      if (!rows[0]) throw new Error("ai_social_turn_not_available");
      return rows[0];
    }) as Promise<AiTurnContext>;
  }

  async commitTurn(input: Readonly<{
    outboxId: string;
    output: SalesCoreOutput;
    publicResponse: AiPublicResponse;
    nativeUsage: { inputUnits: number; outputUnits: number; cachedUnits?: number };
  }>) {
    return this.client.begin(async (sql) => {
      await sql`
        SELECT set_config('app.service', 'ai_social_worker', true),
               set_config('app.request_id', ${randomUUID()}, true)
      `;
      const rows = await sql<{ result: AiPublicResponse | { status: "handover" } }[]>`
        SELECT tenancy.commit_ai_social_turn(
          ${input.outboxId}::uuid, ${sql.json(input.output)}, ${sql.json(input.publicResponse)},
          ${input.nativeUsage.inputUnits}, ${input.nativeUsage.outputUnits},
          ${input.nativeUsage.cachedUnits ?? 0}
        ) AS result
      `;
      if (!rows[0]) throw new Error("ai_social_turn_commit_failed");
      return rows[0].result;
    });
  }

  async failTurn(outboxId: string, safeErrorCode: string) {
    return this.client.begin(async (sql) => {
      await sql`
        SELECT set_config('app.service', 'ai_social_worker', true),
               set_config('app.request_id', ${randomUUID()}, true)
      `;
      const rows = await sql<{ failed: boolean }[]>`
        SELECT tenancy.fail_ai_social_turn(${outboxId}::uuid, ${safeErrorCode}) AS failed
      `;
      return rows[0]?.failed ?? false;
    });
  }

  async applyControlEvent(outboxId: string) {
    return this.client.begin(async (sql) => {
      await sql`
        SELECT set_config('app.service', 'ai_social_worker', true),
               set_config('app.request_id', ${randomUUID()}, true)
      `;
      const rows = await sql<{ applied: boolean }[]>`
        SELECT tenancy.apply_ai_social_control_event(${outboxId}::uuid) AS applied
      `;
      return rows[0]?.applied ?? false;
    });
  }

  async claimDelivery(now = new Date(), staleBefore = new Date(Date.now() - 5 * 60 * 1000)) {
    return this.client.begin(async (sql) => {
      await sql`
        SELECT set_config('app.service', 'ai_social_delivery_worker', true),
               set_config('app.request_id', ${randomUUID()}, true)
      `;
      const rows = await sql<Record<string, unknown>[]>`
        SELECT * FROM tenancy.claim_ai_social_delivery(${now}, ${staleBefore})
      `;
      const row = rows[0] ? socialDeliveryClaimSchema.parse(rows[0]) : null;
      if (!row) return null;
      return {
        deliveryId: row.delivery_id, tenantId: row.tenant_id,
        connectionId: row.connection_id, messageId: row.message_id,
        channel: row.channel, response: row.response_json,
        recipient: row.delivery_allowed
          ? encryptedValueSchema.parse(openJson(row.recipient_ciphertext, this.envelopeKey)).value : null,
        replyToken: row.delivery_allowed && row.reply_token_ciphertext
          ? encryptedValueSchema.parse(openJson(row.reply_token_ciphertext, this.envelopeKey)).value : null,
        credentials: row.delivery_allowed && row.credential_ciphertext
          ? openJson<unknown>(row.credential_ciphertext, this.envelopeKey) : null,
        credentialKeyVersion: row.credential_key_version,
        attemptCount: row.attempt_count, deliveredPartCount: row.delivered_part_count,
        serviceWindowOpen: row.service_window_open,
        deliveryAllowed: row.delivery_allowed,
        inboundOccurredAt: row.inbound_occurred_at ?? null,
      } as const;
    });
  }

  async finishDelivery(input: Readonly<{
    deliveryId: string; delivered: boolean; externalMessageIds: readonly string[];
    feeClassification: "reply" | "push" | "service_window_reply";
    attemptedQuantity: number; completedPartCount?: number;
    safeErrorCode: string | null; deadLetter?: boolean;
  }>) {
    return this.client.begin(async (sql) => {
      await sql`
        SELECT set_config('app.service', 'ai_social_delivery_worker', true),
               set_config('app.request_id', ${randomUUID()}, true)
      `;
      const rows = await sql<{ finished: boolean }[]>`
        SELECT tenancy.finish_ai_social_delivery_parts(
          ${input.deliveryId}::uuid, ${input.delivered}, ${input.externalMessageIds as string[]},
          ${input.feeClassification}, ${input.attemptedQuantity},
          ${input.completedPartCount ?? (input.delivered ? input.attemptedQuantity : 0)},
          ${input.safeErrorCode},
          ${input.deadLetter ?? false}
        ) AS finished
      `;
      if (!rows[0]?.finished) throw new Error("ai_social_delivery_finish_conflict");
    });
  }

  async finish(outboxId: string, processed: boolean, safeErrorCode: string | null, deadLetter = false) {
    return this.client.begin(async (sql) => {
      await sql`
        SELECT set_config('app.service', 'ai_social_worker', true),
               set_config('app.request_id', ${randomUUID()}, true)
      `;
      const rows = await sql<{ finished: boolean }[]>`
        SELECT tenancy.finish_ai_social_inbound(
          ${outboxId}::uuid, ${processed}, ${safeErrorCode}, ${deadLetter}
        ) AS finished
      `;
      if (!rows[0]?.finished) throw new Error("ai_social_inbound_finish_conflict");
    });
  }
}
