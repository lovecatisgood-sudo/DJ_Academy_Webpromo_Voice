import { randomUUID } from "node:crypto";
import { sealJson } from "@djay/auth";
import type { FlowbotMerchantEmailStore } from "@djay/notifications";
import type { TenantContext } from "@djay/tenancy";
import { z } from "zod";
import type { DatabaseClient } from "./client";
import { withTenantTransaction } from "./scoped-transaction";

const claimSchema = z.object({
  outbox_id: z.uuid(),
  recipient_ciphertext: z.string().nullable(),
  payload: z.unknown(),
  attempt_count: z.number().int().positive(),
  delivery_allowed: z.boolean(),
}).strict();

export class TenantFlowbotNotificationStore {
  constructor(private readonly client: DatabaseClient) {}

  async list(context: TenantContext) {
    return withTenantTransaction(this.client, context, async ({ sql }) => sql<{
      id: string; name: string; allowedTemplateKeys: string[]; status: "active" | "disabled";
      createdAt: Date; updatedAt: Date;
    }[]>`
      SELECT id, name, allowed_template_keys AS "allowedTemplateKeys", status,
             created_at AS "createdAt", updated_at AS "updatedAt"
      FROM tenancy.notification_profiles
      WHERE tenant_id = ${context.tenantId}::uuid
      ORDER BY created_at DESC, id DESC
    `);
  }

  async create(context: TenantContext, input: Readonly<{ name: string; recipientEmail: string; envelopeKey: Buffer }>) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const authority = await sql<{ entitled: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM tenancy.entitlement_snapshots snapshot
          JOIN tenancy.product_subscriptions subscription
            ON subscription.tenant_id = snapshot.tenant_id AND subscription.id = snapshot.subscription_id
          WHERE snapshot.tenant_id = ${context.tenantId}::uuid
            AND snapshot.product_key = 'flowbot' AND snapshot.access_mode = 'active'
            AND subscription.status IN ('active', 'trialing', 'scheduled_change')
            AND snapshot.resolved_json->'entitlements'->>'flow.email_notification' = 'true'
        ) AS entitled
      `;
      if (!authority[0]?.entitled) return { status: "not_entitled" as const };
      const count = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM tenancy.notification_profiles
        WHERE tenant_id = ${context.tenantId}::uuid AND status = 'active'
      `;
      if ((count[0]?.count ?? 0) >= 5) return { status: "limit_exceeded" as const };
      const profileId = randomUUID();
      await sql`
        INSERT INTO tenancy.notification_profiles (
          id, tenant_id, name, recipient_ciphertext, allowed_template_keys, created_by_membership_id
        ) VALUES (
          ${profileId}::uuid, ${context.tenantId}::uuid, ${input.name},
          ${sealJson({ email: input.recipientEmail }, input.envelopeKey)},
          ARRAY['flowbot.lead_captured'], ${context.membershipId}::uuid
        )
      `;
      await sql`
        INSERT INTO tenancy.audit_logs (
          tenant_id, actor_user_id, actor_membership_id, action, target_type,
          target_id, request_id, result, metadata
        ) VALUES (
          ${context.tenantId}::uuid, ${context.userId}::uuid, ${context.membershipId}::uuid,
          'flowbot.notification_profile_created', 'notification_profile', ${profileId},
          ${context.requestId}, 'succeeded', ${sql.json({ templateKey: "flowbot.lead_captured" })}
        )
      `;
      return { status: "created" as const, profileId };
    });
  }
}

export class TenantAiNotificationStore {
  constructor(private readonly client: DatabaseClient) {}

  async list(context: TenantContext) {
    return withTenantTransaction(this.client, context, async ({ sql }) => sql<{
      id: string; name: string; allowedTemplateKeys: string[]; status: "active" | "disabled";
      createdAt: Date; updatedAt: Date;
    }[]>`
      SELECT id, name, allowed_template_keys AS "allowedTemplateKeys", status,
             created_at AS "createdAt", updated_at AS "updatedAt"
      FROM tenancy.notification_profiles
      WHERE tenant_id = ${context.tenantId}::uuid
        AND 'ai_chat.lead_qualified' = ANY(allowed_template_keys)
      ORDER BY created_at DESC, id DESC
    `);
  }

  async create(context: TenantContext, input: Readonly<{ name: string; recipientEmail: string; envelopeKey: Buffer }>) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const authority = await sql<{ entitled: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM tenancy.entitlement_snapshots snapshot
          JOIN tenancy.product_subscriptions subscription
            ON subscription.tenant_id = snapshot.tenant_id AND subscription.id = snapshot.subscription_id
          WHERE snapshot.tenant_id = ${context.tenantId}::uuid
            AND snapshot.product_key = 'ai_chat' AND snapshot.access_mode = 'active'
            AND subscription.status IN ('active', 'trialing', 'scheduled_change')
            AND snapshot.resolved_json->'entitlements'->>'sales_email_action.enabled' = 'true'
        ) AS entitled
      `;
      if (!authority[0]?.entitled) return { status: "not_entitled" as const };
      const count = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM tenancy.notification_profiles
        WHERE tenant_id = ${context.tenantId}::uuid AND status = 'active'
      `;
      if ((count[0]?.count ?? 0) >= 5) return { status: "limit_exceeded" as const };
      const profileId = randomUUID();
      await sql`
        INSERT INTO tenancy.notification_profiles (
          id, tenant_id, name, recipient_ciphertext, allowed_template_keys, created_by_membership_id
        ) VALUES (
          ${profileId}::uuid, ${context.tenantId}::uuid, ${input.name},
          ${sealJson({ email: input.recipientEmail }, input.envelopeKey)},
          ARRAY['ai_chat.lead_qualified'], ${context.membershipId}::uuid
        )
      `;
      await sql`
        INSERT INTO tenancy.audit_logs (
          tenant_id, actor_user_id, actor_membership_id, action, target_type,
          target_id, request_id, result, metadata
        ) VALUES (
          ${context.tenantId}::uuid, ${context.userId}::uuid, ${context.membershipId}::uuid,
          'ai_chat.notification_profile_created', 'notification_profile', ${profileId},
          ${context.requestId}, 'succeeded', ${sql.json({ templateKey: "ai_chat.lead_qualified" })}
        )
      `;
      return { status: "created" as const, profileId };
    });
  }
}

export class FlowbotNotificationWorkerStore implements FlowbotMerchantEmailStore {
  constructor(private readonly client: DatabaseClient) {}

  async claim(now: Date, staleBefore: Date) {
    return this.client.begin(async (sql) => {
      await sql`
        SELECT set_config('app.service', 'flowbot_notification_worker', true),
               set_config('app.request_id', ${crypto.randomUUID()}, true)
      `;
      const rows = await sql<Record<string, unknown>[]>`
        SELECT * FROM tenancy.claim_flowbot_notification(${now}, ${staleBefore})
      `;
      const row = rows[0] ? claimSchema.parse(rows[0]) : null;
      return row ? {
        id: row.outbox_id,
        recipientCiphertext: row.recipient_ciphertext,
        payload: row.payload,
        attemptCount: row.attempt_count,
        deliveryAllowed: row.delivery_allowed,
      } : null;
    });
  }

  async finish(id: string, delivered: boolean, errorCode: string | null, deadLetter: boolean) {
    await this.client.begin(async (sql) => {
      await sql`
        SELECT set_config('app.service', 'flowbot_notification_worker', true),
               set_config('app.request_id', ${crypto.randomUUID()}, true)
      `;
      const rows = await sql<{ finished: boolean }[]>`
        SELECT tenancy.finish_flowbot_notification(
          ${id}::uuid, ${delivered}, ${errorCode}, ${deadLetter}
        ) AS finished
      `;
      if (!rows[0]?.finished) throw new Error("flowbot_notification_finish_conflict");
    });
  }
}

export class AiChatNotificationWorkerStore implements FlowbotMerchantEmailStore {
  constructor(private readonly client: DatabaseClient) {}

  async claim(now: Date, staleBefore: Date) {
    return this.client.begin(async (sql) => {
      await sql`
        SELECT set_config('app.service', 'ai_chat_notification_worker', true),
               set_config('app.request_id', ${crypto.randomUUID()}, true)
      `;
      const rows = await sql<Record<string, unknown>[]>`
        SELECT * FROM tenancy.claim_ai_chat_notification(${now}, ${staleBefore})
      `;
      const row = rows[0] ? claimSchema.parse(rows[0]) : null;
      return row ? {
        id: row.outbox_id,
        recipientCiphertext: row.recipient_ciphertext,
        payload: row.payload,
        attemptCount: row.attempt_count,
        deliveryAllowed: row.delivery_allowed,
      } : null;
    });
  }

  async finish(id: string, delivered: boolean, errorCode: string | null, deadLetter: boolean) {
    await this.client.begin(async (sql) => {
      await sql`
        SELECT set_config('app.service', 'ai_chat_notification_worker', true),
               set_config('app.request_id', ${crypto.randomUUID()}, true)
      `;
      const rows = await sql<{ finished: boolean }[]>`
        SELECT tenancy.finish_ai_chat_notification(
          ${id}::uuid, ${delivered}, ${errorCode}, ${deadLetter}
        ) AS finished
      `;
      if (!rows[0]?.finished) throw new Error("ai_chat_notification_finish_conflict");
    });
  }
}
