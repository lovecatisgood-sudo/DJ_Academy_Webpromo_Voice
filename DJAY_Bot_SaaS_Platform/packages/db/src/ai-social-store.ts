import { randomUUID } from "node:crypto";
import { createOpaqueToken, hashOpaqueToken, openJson, sealJson } from "@djay/auth";
import type { TenantContext } from "@djay/tenancy";
import type { DatabaseClient } from "./client";
import { withTenantTransaction } from "./scoped-transaction";

export type SocialChannel = "line" | "whatsapp" | "messenger";

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
    }[]>`
      SELECT id, agent_id AS "agentId", channel, name,
             external_account_ref AS "externalAccountRef", status,
             health_status AS "healthStatus", safe_error_code AS "safeErrorCode",
             created_at AS "createdAt", last_health_at AS "lastHealthAt", revoked_at AS "revokedAt"
      FROM tenancy.ai_social_connections
      WHERE tenant_id = ${context.tenantId}::uuid
      ORDER BY created_at DESC, id DESC
    `);
  }

  async createLine(context: TenantContext, input: Readonly<{
    agentId: string;
    name: string;
    externalAccountRef: string;
    credentials: unknown;
    envelopeKey: Buffer;
  }>) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const authority = await sql<{ entitled: boolean; deploymentLimit: number | null }[]>`
        SELECT true AS entitled,
               CASE WHEN jsonb_typeof(snapshot.resolved_json->'limits'->'deployments') = 'number'
                 THEN (snapshot.resolved_json->'limits'->>'deployments')::int ELSE NULL END AS "deploymentLimit"
        FROM tenancy.entitlement_snapshots snapshot
        JOIN tenancy.product_subscriptions subscription
          ON subscription.tenant_id = snapshot.tenant_id AND subscription.id = snapshot.subscription_id
          AND subscription.status IN ('active', 'trialing', 'scheduled_change')
        JOIN catalog.plan_versions version ON version.id = snapshot.plan_version_id
        JOIN catalog.plans plan ON plan.id = version.plan_id
          AND plan.product_key = 'ai_chat' AND plan.plan_key = 'ai_chat_premium'
        WHERE snapshot.tenant_id = ${context.tenantId}::uuid
          AND snapshot.product_key = 'ai_chat' AND snapshot.access_mode = 'active'
          AND snapshot.resolved_json->'entitlements'->>'channel.line' = 'true'
        ORDER BY snapshot.created_at DESC, snapshot.id DESC LIMIT 1
      `;
      if (!authority[0]?.entitled) return { status: "not_entitled" as const };
      const agents = await sql<{ available: boolean }[]>`
        SELECT status = 'active' AND current_published_playbook_version_id IS NOT NULL AS available
        FROM tenancy.ai_agents
        WHERE tenant_id = ${context.tenantId}::uuid AND id = ${input.agentId}::uuid
      `;
      if (!agents[0]?.available) return { status: "not_found" as const };
      const existing = await sql<{ exists: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM tenancy.ai_social_connections
          WHERE tenant_id = ${context.tenantId}::uuid AND channel = 'line'
            AND external_account_ref = ${input.externalAccountRef}
        ) AS exists
      `;
      if (existing[0]?.exists) return { status: "conflict" as const };
      const counts = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM tenancy.ai_deployments
        WHERE tenant_id = ${context.tenantId}::uuid AND status = 'active'
      `;
      const limit = authority[0].deploymentLimit;
      if (typeof limit === "number" && (counts[0]?.count ?? 0) >= limit) {
        return { status: "limit_reached" as const };
      }

      const deploymentId = randomUUID();
      const connectionId = randomUUID();
      const webhookKey = `djay_social_${createOpaqueToken()}`;
      await sql`
        INSERT INTO tenancy.ai_deployments (
          id, tenant_id, agent_id, name, channel, created_by_membership_id
        ) VALUES (
          ${deploymentId}::uuid, ${context.tenantId}::uuid, ${input.agentId}::uuid,
          ${input.name}, 'line', ${context.membershipId}::uuid
        )
      `;
      await sql`
        INSERT INTO tenancy.ai_social_connections (
          id, tenant_id, agent_id, deployment_id, channel, name, external_account_ref,
          credential_ciphertext, webhook_key_hash, created_by_membership_id
        ) VALUES (
          ${connectionId}::uuid, ${context.tenantId}::uuid, ${input.agentId}::uuid,
          ${deploymentId}::uuid, 'line', ${input.name}, ${input.externalAccountRef},
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
          ${context.requestId}, 'succeeded', ${sql.json({ channel: "line" })}
        )
      `;
      return { status: "created" as const, connectionId, webhookKey };
    });
  }

  async revoke(context: TenantContext, connectionId: string) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ deploymentId: string }[]>`
        UPDATE tenancy.ai_social_connections
        SET status = 'revoked', revoked_at = now(), updated_at = now(),
            credential_ciphertext = 'revoked.' || encode(gen_random_bytes(24), 'base64'),
            safe_error_code = NULL
        WHERE tenant_id = ${context.tenantId}::uuid AND id = ${connectionId}::uuid
          AND status <> 'revoked'
        RETURNING deployment_id AS "deploymentId"
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
          ${context.requestId}, 'succeeded', ${sql.json({ channel: "line" })}
        )
      `;
      return { status: "revoked" as const };
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
