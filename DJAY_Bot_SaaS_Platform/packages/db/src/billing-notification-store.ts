import { sealJson } from "@djay/auth";
import type { FlowbotMerchantEmailStore } from "@djay/notifications";
import type { TenantContext } from "@djay/tenancy";
import { z } from "zod";
import type { DatabaseClient } from "./client";
import { withTenantTransaction } from "./scoped-transaction";

export const billingNotificationEventKeys = [
  "subscription.active", "subscription.past_due", "subscription.grace_period",
  "subscription.restricted", "subscription.cancelled",
  "cancellation.scheduled", "cancellation.revoked", "cancellation.failed",
  "payment.succeeded", "payment.failed", "refund.updated", "credit_note.issued",
] as const;

export type BillingNotificationEventKey = typeof billingNotificationEventKeys[number];

const claimSchema = z.object({
  outbox_id: z.uuid(),
  recipient_ciphertext: z.string().nullable(),
  payload: z.unknown(),
  attempt_count: z.number().int().positive(),
  delivery_allowed: z.boolean(),
}).strict();

export class TenantBillingNotificationStore {
  constructor(private readonly client: DatabaseClient) {}

  async overview(context: TenantContext) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const preferences = await sql<{
        email_enabled: boolean; locale: "en" | "th"; event_keys: BillingNotificationEventKey[];
        updated_at: Date;
      }[]>`
        SELECT email_enabled, locale, event_keys, updated_at
        FROM tenancy.billing_notification_preferences
        WHERE tenant_id = ${context.tenantId}::uuid
      `;
      const notices = await sql<{
        id: string; subscription_id: string | null; event_key: BillingNotificationEventKey;
        safe_facts: Record<string, unknown>; effective_at: Date; read_at: Date | null;
      }[]>`
        SELECT notice.id, notice.subscription_id, notice.event_key, notice.safe_facts,
          notice.effective_at, receipt.read_at
        FROM tenancy.customer_billing_notifications notice
        LEFT JOIN tenancy.customer_billing_notification_receipts receipt
          ON receipt.tenant_id = notice.tenant_id AND receipt.notification_id = notice.id
         AND receipt.user_id = ${context.userId}::uuid
        WHERE notice.tenant_id = ${context.tenantId}::uuid
        ORDER BY notice.effective_at DESC, notice.id DESC LIMIT 100
      `;
      const preference = preferences[0];
      return Object.freeze({
        preference: preference ? Object.freeze({
          emailEnabled: preference.email_enabled,
          locale: preference.locale,
          eventKeys: Object.freeze(preference.event_keys),
          updatedAt: preference.updated_at,
        }) : null,
        notifications: Object.freeze(notices.map((notice) => Object.freeze({
          id: notice.id, subscriptionId: notice.subscription_id,
          eventKey: notice.event_key, facts: Object.freeze(notice.safe_facts),
          effectiveAt: notice.effective_at, readAt: notice.read_at,
        }))),
      });
    });
  }

  async configure(context: TenantContext, input: Readonly<{
    emailEnabled: boolean; recipientEmail: string | null; locale: "en" | "th";
    eventKeys: readonly BillingNotificationEventKey[]; envelopeKey: Buffer; now?: Date;
  }>) {
    const recipientCiphertext = input.recipientEmail
      ? sealJson({ email: input.recipientEmail }, input.envelopeKey) : null;
    if (input.emailEnabled && !recipientCiphertext) return { status: "recipient_required" as const };
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      await sql`
        INSERT INTO tenancy.billing_notification_preferences (
          tenant_id, recipient_ciphertext, email_enabled, locale, event_keys,
          updated_by_user_id, updated_by_membership_id, created_at, updated_at
        ) VALUES (${context.tenantId}::uuid, ${recipientCiphertext}, ${input.emailEnabled},
          ${input.locale}, ${[...new Set(input.eventKeys)]}, ${context.userId}::uuid,
          ${context.membershipId}::uuid, ${input.now ?? new Date()}, ${input.now ?? new Date()})
        ON CONFLICT (tenant_id) DO UPDATE SET
          recipient_ciphertext = CASE WHEN EXCLUDED.recipient_ciphertext IS NOT NULL
            THEN EXCLUDED.recipient_ciphertext ELSE tenancy.billing_notification_preferences.recipient_ciphertext END,
          email_enabled = EXCLUDED.email_enabled, locale = EXCLUDED.locale,
          event_keys = EXCLUDED.event_keys, updated_by_user_id = EXCLUDED.updated_by_user_id,
          updated_by_membership_id = EXCLUDED.updated_by_membership_id,
          updated_at = EXCLUDED.updated_at
      `;
      await sql`
        INSERT INTO tenancy.audit_logs (
          tenant_id, actor_user_id, actor_membership_id, action, target_type,
          target_id, request_id, result, metadata
        ) VALUES (${context.tenantId}::uuid, ${context.userId}::uuid, ${context.membershipId}::uuid,
          'billing.notification_preferences_updated', 'tenant', ${context.tenantId},
          ${context.requestId}, 'succeeded', ${sql.json({
            emailEnabled: input.emailEnabled, locale: input.locale, eventKeys: [...new Set(input.eventKeys)],
          })})
      `;
      return { status: "updated" as const };
    });
  }

  async markRead(context: TenantContext, notificationId: string, now = new Date()) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ id: string }[]>`
        INSERT INTO tenancy.customer_billing_notification_receipts (
          tenant_id, notification_id, user_id, read_at
        ) SELECT ${context.tenantId}::uuid, notice.id, ${context.userId}::uuid, ${now}
        FROM tenancy.customer_billing_notifications notice
        WHERE notice.tenant_id = ${context.tenantId}::uuid AND notice.id = ${notificationId}::uuid
        ON CONFLICT (tenant_id, notification_id, user_id)
        DO UPDATE SET read_at = EXCLUDED.read_at
        RETURNING notification_id AS id
      `;
      return { status: rows[0] ? "read" as const : "not_found" as const };
    });
  }
}

export class BillingNotificationWorkerStore implements FlowbotMerchantEmailStore {
  constructor(private readonly client: DatabaseClient) {}

  async claim(now: Date, staleBefore: Date) {
    return this.client.begin(async (sql) => {
      await sql`
        SELECT set_config('app.service', 'billing_notification_worker', true),
          set_config('app.request_id', ${crypto.randomUUID()}, true)
      `;
      const rows = await sql<Record<string, unknown>[]>`
        SELECT * FROM tenancy.claim_customer_billing_email(${now}, ${staleBefore})
      `;
      const row = rows[0] ? claimSchema.parse(rows[0]) : null;
      return row ? {
        id: row.outbox_id, recipientCiphertext: row.recipient_ciphertext,
        payload: row.payload, attemptCount: row.attempt_count,
        deliveryAllowed: row.delivery_allowed,
      } : null;
    });
  }

  async finish(id: string, delivered: boolean, errorCode: string | null, deadLetter: boolean) {
    await this.client.begin(async (sql) => {
      await sql`
        SELECT set_config('app.service', 'billing_notification_worker', true),
          set_config('app.request_id', ${crypto.randomUUID()}, true)
      `;
      const rows = await sql<{ finished: boolean }[]>`
        SELECT tenancy.finish_customer_billing_email(
          ${id}::uuid, ${delivered}, ${errorCode}, ${deadLetter}
        ) AS finished
      `;
      if (!rows[0]?.finished) throw new Error("billing_notification_finish_conflict");
    });
  }
}
