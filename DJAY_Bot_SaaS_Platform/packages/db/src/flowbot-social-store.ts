import { randomUUID } from "node:crypto";
import { createOpaqueToken, hashOpaqueToken, openJson, sealJson } from "@djay/auth";
import { advanceFlow, type FlowEngineResult } from "@djay/flowbot-engine";
import { flowExecutionStateSchema, flowSnapshotSchema, type FlowEntitlements, type FlowInput } from "@djay/flowbot-domain";
import type { TenantContext } from "@djay/tenancy";
import { z } from "zod";
import type { DatabaseClient } from "./client";
import { flowbotEnvironment, flowBusinessSchedulesSchema } from "./flowbot-environment";
import { withTenantTransaction } from "./scoped-transaction";

export type FlowSocialChannel = "line" | "messenger";

export class FlowSocialConnectionStore {
  constructor(private readonly client: DatabaseClient) {}

  async list(context: TenantContext) {
    return withTenantTransaction(this.client, context, async ({ sql }) => sql<{
      id: string; botId: string; channel: FlowSocialChannel; name: string; externalAccountRef: string;
      status: string; healthStatus: string; safeErrorCode: string | null; createdAt: Date; revokedAt: Date | null;
    }[]>`
      SELECT id, bot_id AS "botId", channel, name, external_account_ref AS "externalAccountRef",
             status, health_status AS "healthStatus", safe_error_code AS "safeErrorCode",
             created_at AS "createdAt", revoked_at AS "revokedAt"
      FROM tenancy.flow_social_connections WHERE tenant_id = ${context.tenantId}::uuid
      ORDER BY created_at DESC, id DESC
    `);
  }

  async create(context: TenantContext, input: Readonly<{
    botId: string; channel: FlowSocialChannel; name: string; externalAccountRef: string;
    credentials: unknown; envelopeKey: Buffer;
  }>) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const authority = await sql<{ subscriptionId: string; socialChannelLimit: number | null }[]>`
        SELECT snapshot.subscription_id AS "subscriptionId",
          CASE WHEN jsonb_typeof(snapshot.resolved_json->'limits'->'social_channels') = 'number'
            THEN (snapshot.resolved_json->'limits'->>'social_channels')::int + COALESCE((
              SELECT sum(add_on.quantity)::int FROM tenancy.subscription_add_ons add_on
              WHERE add_on.tenant_id = snapshot.tenant_id AND add_on.subscription_id = snapshot.subscription_id
                AND add_on.add_on_key = 'additional_social_channel' AND add_on.status IN ('active', 'scheduled_end')
                AND add_on.effective_from <= now() AND (add_on.effective_until IS NULL OR add_on.effective_until > now())
            ), 0) ELSE NULL END AS "socialChannelLimit"
        FROM tenancy.entitlement_snapshots snapshot
        JOIN tenancy.product_subscriptions subscription ON subscription.tenant_id = snapshot.tenant_id
          AND subscription.id = snapshot.subscription_id AND subscription.status IN ('active', 'trialing', 'scheduled_change')
        JOIN catalog.plan_versions version ON version.id = snapshot.plan_version_id
        JOIN catalog.plans plan ON plan.id = version.plan_id AND plan.product_key = 'flowbot'
        WHERE snapshot.tenant_id = ${context.tenantId}::uuid AND snapshot.product_key = 'flowbot'
          AND snapshot.access_mode = 'active'
          AND (snapshot.resolved_json->'entitlements'->>'channel.social' = 'true'
            OR EXISTS (SELECT 1 FROM tenancy.subscription_add_ons social_add_on
              WHERE social_add_on.tenant_id = snapshot.tenant_id AND social_add_on.subscription_id = snapshot.subscription_id
                AND social_add_on.add_on_key = 'additional_social_channel' AND social_add_on.status IN ('active', 'scheduled_end')
                AND social_add_on.effective_from <= now() AND (social_add_on.effective_until IS NULL OR social_add_on.effective_until > now())))
        ORDER BY snapshot.created_at DESC, snapshot.id DESC LIMIT 1
      `;
      if (!authority[0]) return { status: "not_entitled" as const };
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${context.tenantId}:flowbot:social_channels`}, 0))`;
      const bot = await sql<{ available: boolean }[]>`
        SELECT status = 'active' AND current_published_version_id IS NOT NULL
          AND tenancy.entitlement_resource_is_writable('flowbot', 'bot', id) AS available
        FROM tenancy.flow_bots WHERE tenant_id = ${context.tenantId}::uuid AND id = ${input.botId}::uuid
      `;
      if (!bot[0]?.available) return { status: "not_found" as const };
      const count = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM tenancy.flow_social_connections
        WHERE tenant_id = ${context.tenantId}::uuid AND status <> 'revoked'
      `;
      if (typeof authority[0].socialChannelLimit === "number" && (count[0]?.count ?? 0) >= authority[0].socialChannelLimit) return { status: "limit_reached" as const };
      const conflict = await sql<{ exists: boolean }[]>`
        SELECT EXISTS (SELECT 1 FROM tenancy.flow_social_connections
          WHERE tenant_id = ${context.tenantId}::uuid AND channel = ${input.channel}
            AND external_account_ref = ${input.externalAccountRef}) AS exists
      `;
      if (conflict[0]?.exists) return { status: "conflict" as const };
      const deploymentId = randomUUID(); const connectionId = randomUUID();
      const deploymentKey = `djay_flow_social_deployment_${createOpaqueToken()}`;
      const webhookKey = `djay_flow_social_${createOpaqueToken()}`;
      await sql`INSERT INTO tenancy.flow_deployments (id, tenant_id, bot_id, name, deployment_key_hash, key_prefix, allowed_origins, created_by_membership_id)
        VALUES (${deploymentId}::uuid, ${context.tenantId}::uuid, ${input.botId}::uuid, ${input.name},
          ${hashOpaqueToken(deploymentKey)}, ${deploymentKey.slice(0, 24)}, '{}', ${context.membershipId}::uuid)`;
      await sql`INSERT INTO tenancy.flow_social_connections (id, tenant_id, bot_id, deployment_id, channel, name,
        external_account_ref, credential_ciphertext, webhook_key_hash, created_by_membership_id)
        VALUES (${connectionId}::uuid, ${context.tenantId}::uuid, ${input.botId}::uuid, ${deploymentId}::uuid,
          ${input.channel}, ${input.name}, ${input.externalAccountRef}, ${sealJson(input.credentials, input.envelopeKey)},
          ${hashOpaqueToken(webhookKey)}, ${context.membershipId}::uuid)`;
      await sql`INSERT INTO tenancy.audit_logs (tenant_id, actor_user_id, actor_membership_id, action, target_type,
        target_id, request_id, result, metadata) VALUES (${context.tenantId}::uuid, ${context.userId}::uuid,
          ${context.membershipId}::uuid, 'flowbot.social_connection_created', 'flow_social_connection',
          ${connectionId}, ${context.requestId}, 'succeeded', ${sql.json({ channel: input.channel })})`;
      return { status: "created" as const, connectionId, webhookKey };
    });
  }

  async revoke(context: TenantContext, connectionId: string) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ deploymentId: string }[]>`
        UPDATE tenancy.flow_social_connections SET status = 'revoked', revoked_at = now(), updated_at = now(),
          credential_ciphertext = 'revoked.' || encode(gen_random_bytes(24), 'base64'), safe_error_code = NULL
        WHERE tenant_id = ${context.tenantId}::uuid AND id = ${connectionId}::uuid AND status <> 'revoked'
        RETURNING deployment_id AS "deploymentId"
      `;
      if (!rows[0]) return { status: "not_found" as const };
      await sql`UPDATE tenancy.flow_deployments SET status = 'revoked', revoked_at = now()
        WHERE tenant_id = ${context.tenantId}::uuid AND id = ${rows[0].deploymentId}::uuid`;
      return { status: "revoked" as const };
    });
  }
}

export class FlowSocialRuntimeStore {
  constructor(private readonly client: DatabaseClient, private readonly envelopeKey: Buffer) {}

  async connection(webhookKey: string, channel: FlowSocialChannel) {
    const rows = await this.client<{
      connection_id: string; tenant_id: string; channel: FlowSocialChannel;
      credential_ciphertext: string; credential_key_version: number;
    }[]>`SELECT * FROM tenancy.flow_social_runtime_connection(${hashOpaqueToken(webhookKey)}, ${channel})`;
    const row = rows[0];
    return row ? { connectionId: row.connection_id, tenantId: row.tenant_id, channel: row.channel,
      credentialKeyVersion: row.credential_key_version, credentials: openJson<unknown>(row.credential_ciphertext, this.envelopeKey) } : null;
  }

  async receive(input: Readonly<{
    webhookKey: string; channel: FlowSocialChannel; externalEventId: string; externalMessageId: string | null;
    subjectHash: Buffer; eventType: "inbound.message" | "delivery.status" | "subject.opt_out";
    occurredAt: Date; normalized: Record<string, unknown>;
  }>) {
    const receiptId = randomUUID();
    const rows = await this.client<{ receipt_id: string; disposition: "accepted" | "out_of_order"; replayed: boolean }[]>`
      SELECT * FROM tenancy.receive_flow_social_event(${hashOpaqueToken(input.webhookKey)}, ${input.channel},
        ${receiptId}::uuid, ${input.externalEventId}, ${input.externalMessageId}, ${input.subjectHash},
        ${input.eventType}, ${input.occurredAt}, ${this.client.json(jsonValue(input.normalized))})
    `;
    return rows[0] ? { receiptId: rows[0].receipt_id, disposition: rows[0].disposition, replayed: rows[0].replayed } : null;
  }
}

const inboundClaimSchema = z.object({
  outbox_id: z.uuid(), receipt_id: z.uuid(), tenant_id: z.uuid(), connection_id: z.uuid(),
  channel: z.enum(["line", "messenger"]), event_type: z.enum(["inbound.message", "delivery.status", "subject.opt_out"]),
  subject_hash: z.instanceof(Buffer), normalized_json: z.record(z.string(), z.unknown()),
  credential_ciphertext: z.string().nullable(), attempt_count: z.number().int().positive(), processing_allowed: z.boolean(),
}).strict();
const preparedTurnSchema = z.object({
  tenant_id: z.uuid(), deployment_id: z.uuid(), execution_id: z.uuid(), flow_version_id: z.uuid(),
  snapshot_json: flowSnapshotSchema, state_json: flowExecutionStateSchema,
  authority_json: z.object({ planKey: z.enum(["flowbot_basic", "flowbot_premium"]), accessMode: z.literal("active"),
    entitlements: z.record(z.string(), z.union([z.boolean(), z.string(), z.number(), z.null()])),
    limits: z.record(z.string(), z.number().nullable()) }).strict(),
  next_input_sequence: z.number().int().positive(), session_token_hash: z.instanceof(Buffer), is_new: z.boolean(),
}).strict();
const deliveryClaimSchema = z.object({
  delivery_id: z.uuid(), tenant_id: z.uuid(), channel: z.enum(["line", "messenger"]),
  response_json: z.object({ messages: z.array(z.object({ type: z.string(), nodeId: z.uuid(), content: z.record(z.string(), z.unknown()) }).passthrough()), status: z.string() }).passthrough(),
  recipient_ciphertext: z.string(), reply_token_ciphertext: z.string().nullable(), credential_ciphertext: z.string(),
  delivered_part_count: z.number().int().nonnegative(), attempt_count: z.number().int().positive(), delivery_allowed: z.boolean(),
}).strict();

export type FlowSocialInboundClaim = z.infer<typeof inboundClaimSchema>;

function jsonValue(value: unknown) { return JSON.parse(JSON.stringify(value)); }

export class FlowSocialWorkerStore {
  constructor(private readonly client: DatabaseClient) {}

  async claim() {
    return this.client.begin(async (sql) => {
      await sql`SELECT set_config('app.service', 'flow_social_worker', true), set_config('app.request_id', ${randomUUID()}, true)`;
      const now = new Date();
      const rows = await sql<Record<string, unknown>[]>`SELECT * FROM tenancy.claim_flow_social_inbound(${now}, ${new Date(now.getTime() - 5 * 60_000)})`;
      return rows[0] ? inboundClaimSchema.parse(rows[0]) : null;
    });
  }

  async processInbound(claim: FlowSocialInboundClaim) {
    if (claim.event_type !== "inbound.message") return this.applyControl(claim.outbox_id);
    const text = typeof claim.normalized_json.text === "string" ? claim.normalized_json.text.trim() : "";
    const subjectCiphertext = typeof claim.normalized_json.subjectCiphertext === "string" ? claim.normalized_json.subjectCiphertext : "";
    if (!claim.processing_allowed || !text || !subjectCiphertext) throw new Error("flow_social_authority_unavailable");
    return this.client.begin(async (sql) => {
      await sql`SELECT set_config('app.service', 'flow_social_worker', true), set_config('app.request_id', ${randomUUID()}, true)`;
      const rows = await sql<Record<string, unknown>[]>`
        SELECT * FROM tenancy.prepare_flow_social_turn(${claim.outbox_id}::uuid, ${randomUUID()}::uuid,
          ${randomUUID()}::uuid, ${randomUUID()}::uuid, ${randomUUID()}::uuid,
          ${hashOpaqueToken(createOpaqueToken())}, ${subjectCiphertext})
      `;
      const turn = preparedTurnSchema.parse(rows[0]);
      await sql`SELECT set_config('app.tenant_id', ${turn.tenant_id}, true)`;
      const scheduleRows = await sql<{ scheduleKey: string; timezone: string; weeklyWindows: unknown; closedDates: string[] }[]>`
        SELECT schedule_key AS "scheduleKey", timezone, weekly_windows AS "weeklyWindows", closed_dates AS "closedDates"
        FROM tenancy.flow_business_schedules WHERE tenant_id = ${turn.tenant_id}::uuid
      `;
      const environment = flowbotEnvironment(new Date(), flowBusinessSchedulesSchema.parse(scheduleRows));
      const requestBase = {
        tenantId: turn.tenant_id, deploymentId: turn.deployment_id, executionId: turn.execution_id,
        flowVersionId: turn.flow_version_id, sequence: turn.next_input_sequence, inputId: claim.receipt_id,
        snapshot: turn.snapshot_json, authority: turn.authority_json as FlowEntitlements, environment,
      };
      let result: FlowEngineResult;
      if (turn.is_new) {
        const started = advanceFlow({ ...requestBase, input: { type: "start", payload: {} }, state: turn.state_json });
        if (started.nextState.status === "active") {
          const continued = advanceFlow({ ...requestBase, input: { type: "text", payload: { text } }, state: started.nextState });
          result = { nextState: continued.nextState, messages: [...started.messages, ...continued.messages],
            commands: [...started.commands, ...continued.commands], events: [...started.events, ...continued.events] };
        } else result = started;
      } else {
        result = advanceFlow({ ...requestBase, input: { type: "text", payload: { text } }, state: turn.state_json });
      }
      const input: FlowInput = { type: "text", payload: { text } };
      const response = { inputId: claim.receipt_id, messages: result.messages, status: result.nextState.status,
        nextSequence: turn.next_input_sequence + 1 };
      const committed = await sql<{ committed: boolean }[]>`
        SELECT tenancy.commit_flow_social_turn(${claim.outbox_id}::uuid, ${claim.receipt_id}::uuid,
          ${turn.session_token_hash}, ${claim.receipt_id}::uuid, ${turn.next_input_sequence},
          ${sql.json(jsonValue(input))}, ${sql.json(jsonValue(result))}, ${sql.json(jsonValue(response))}) AS committed
      `;
      if (!committed[0]?.committed) throw new Error("flow_social_commit_conflict");
      return { status: "processed" as const, executionId: turn.execution_id, messageCount: result.messages.length };
    });
  }

  async applyControl(outboxId: string) {
    return this.client.begin(async (sql) => {
      await sql`SELECT set_config('app.service', 'flow_social_worker', true), set_config('app.request_id', ${randomUUID()}, true)`;
      const rows = await sql<{ applied: boolean }[]>`SELECT tenancy.apply_flow_social_control(${outboxId}::uuid) AS applied`;
      return rows[0]?.applied ? { status: "processed" as const } : { status: "conflict" as const };
    });
  }

  async finish(outboxId: string, processed: boolean, safeErrorCode: string | null, deadLetter = false) {
    return this.client.begin(async (sql) => {
      await sql`SELECT set_config('app.service', 'flow_social_worker', true), set_config('app.request_id', ${randomUUID()}, true)`;
      const rows = await sql<{ finished: boolean }[]>`
        SELECT tenancy.finish_flow_social_inbound(${outboxId}::uuid, ${processed}, ${safeErrorCode}, ${deadLetter}) AS finished
      `;
      return rows[0]?.finished === true;
    });
  }

  async claimDelivery() {
    return this.client.begin(async (sql) => {
      await sql`SELECT set_config('app.service', 'flow_social_worker', true), set_config('app.request_id', ${randomUUID()}, true)`;
      const now = new Date(); const rows = await sql<Record<string, unknown>[]>`
        SELECT * FROM tenancy.claim_flow_social_delivery(${now}, ${new Date(now.getTime() - 5 * 60_000)})
      `;
      return rows[0] ? deliveryClaimSchema.parse(rows[0]) : null;
    });
  }

  async finishDelivery(input: Readonly<{ deliveryId: string; delivered: boolean; externalMessageIds: readonly string[];
    completedPartCount: number; safeErrorCode: string | null; deadLetter?: boolean }>) {
    return this.client.begin(async (sql) => {
      await sql`SELECT set_config('app.service', 'flow_social_worker', true), set_config('app.request_id', ${randomUUID()}, true)`;
      const rows = await sql<{ finished: boolean }[]>`
        SELECT tenancy.finish_flow_social_delivery(${input.deliveryId}::uuid, ${input.delivered},
          ${input.externalMessageIds as string[]}, ${input.completedPartCount}, ${input.safeErrorCode}, ${input.deadLetter ?? false}) AS finished
      `;
      return rows[0]?.finished === true;
    });
  }
}
