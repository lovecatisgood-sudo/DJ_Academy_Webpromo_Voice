import { randomBytes, randomUUID } from "node:crypto";
import { sealJson } from "@djay/auth";
import { runUsageAlertEmail } from "@djay/notifications";
import { afterAll, describe, expect, it } from "vitest";
import { createDatabaseClient } from "./client";
import { UsageAlertNotificationWorkerStore, UsageAlertWorkerStore } from "./commerce-store";

const workerUrl = process.env.WORKER_DATABASE_URL;
const adminUrl = process.env.ADMIN_DATABASE_URL;
const enabled = Boolean(workerUrl && adminUrl);
const workerClient = enabled ? createDatabaseClient(workerUrl!) : null;
const adminClient = enabled ? createDatabaseClient(adminUrl!) : null;

afterAll(async () => { await workerClient?.end(); await adminClient?.end(); });

describe.runIf(enabled)("COM-03 usage alert operations", () => {
  it("detects a customer-usage anomaly once and records encrypted email delivery append-only", async () => {
    const tenantId = randomUUID();
    const userId = randomUUID();
    const membershipId = randomUUID();
    const subscriptionId = randomUUID();
    const snapshotId = randomUUID();
    const accountId = randomUUID();
    const profileId = randomUUID();
    const evaluatedAt = new Date("2026-07-18T12:00:00.000Z");
    const envelopeKey = randomBytes(32);

    await adminClient!.begin(async (sql) => {
      await sql`INSERT INTO identity.users (id, display_name, status)
        VALUES (${userId}::uuid, 'Usage Owner', 'active')`;
      await sql`INSERT INTO tenancy.tenants (id, slug, business_name)
        VALUES (${tenantId}::uuid, ${`usage-${tenantId.slice(0, 8)}`}, 'Usage Alert Test')`;
      await sql`INSERT INTO tenancy.memberships (id, tenant_id, user_id, role, status, accepted_at)
        VALUES (${membershipId}::uuid, ${tenantId}::uuid, ${userId}::uuid,
          'tenant_master_admin', 'active', ${evaluatedAt})`;
      await sql`
        INSERT INTO tenancy.product_subscriptions (
          id, tenant_id, product_key, plan_version_id, status, period_start, period_end
        ) SELECT ${subscriptionId}::uuid, ${tenantId}::uuid, 'ai_chat', version.id,
          'active', ${new Date(evaluatedAt.getTime() - 30 * 86_400_000)},
          ${new Date(evaluatedAt.getTime() + 86_400_000)}
        FROM catalog.plan_versions version
        JOIN catalog.plans plan ON plan.id = version.plan_id
        WHERE plan.plan_key = 'ai_chat_basic' ORDER BY version.version DESC LIMIT 1
      `;
      await sql`
        INSERT INTO tenancy.entitlement_snapshots (
          id, tenant_id, subscription_id, product_key, plan_version_id,
          subscription_status, access_mode, resolved_json, resolution_hash
        ) SELECT ${snapshotId}::uuid, ${tenantId}::uuid, ${subscriptionId}::uuid,
          'ai_chat', subscription.plan_version_id, 'active', 'active', '{}'::jsonb,
          digest('usage-alert-test', 'sha256')
        FROM tenancy.product_subscriptions subscription WHERE subscription.id = ${subscriptionId}::uuid
      `;
      await sql`
        INSERT INTO tenancy.quota_accounts (
          id, tenant_id, subscription_id, product_key, customer_unit,
          period_start, period_end, included_quantity, safety_cap_quantity
        ) VALUES (
          ${accountId}::uuid, ${tenantId}::uuid, ${subscriptionId}::uuid,
          'ai_chat', 'ai_response', ${new Date(evaluatedAt.getTime() - 30 * 86_400_000)},
          ${new Date(evaluatedAt.getTime() + 86_400_000)}, 1000, 1000
        )
      `;
      await sql`
        INSERT INTO tenancy.notification_profiles (
          id, tenant_id, name, recipient_ciphertext, allowed_template_keys,
          created_by_membership_id
        ) VALUES (
          ${profileId}::uuid, ${tenantId}::uuid, 'Usage alerts',
          ${sealJson({ email: "billing@example.test" }, envelopeKey)},
          ARRAY['usage.allowance_alert'], ${membershipId}::uuid
        )
      `;
      await sql`
        INSERT INTO tenancy.usage_alert_preferences (
          tenant_id, quota_account_id, thresholds, exhaustion_alert, anomaly_alert,
          cooldown_hours, notification_profile_id, updated_by_user_id
        ) VALUES (
          ${tenantId}::uuid, ${accountId}::uuid, ARRAY[]::smallint[], false, true,
          24, ${profileId}::uuid, ${userId}::uuid
        )
      `;
      for (let hour = 2; hour <= 25; hour += 1) {
        await sql`
          INSERT INTO tenancy.usage_events (
            tenant_id, subscription_id, entitlement_snapshot_id, product_key,
            operation_id, event_type, customer_unit, customer_quantity,
            idempotency_key, occurred_at
          ) VALUES (
            ${tenantId}::uuid, ${subscriptionId}::uuid, ${snapshotId}::uuid,
            'ai_chat', ${`baseline-${hour}`}, 'settled', 'ai_response', 1,
            ${`usage-alert-baseline-${tenantId}-${hour}`},
            ${new Date(evaluatedAt.getTime() - hour * 3_600_000)}
          )
        `;
      }
      await sql`
        INSERT INTO tenancy.usage_events (
          tenant_id, subscription_id, entitlement_snapshot_id, product_key,
          operation_id, event_type, customer_unit, customer_quantity,
          idempotency_key, occurred_at
        ) VALUES (
          ${tenantId}::uuid, ${subscriptionId}::uuid, ${snapshotId}::uuid,
          'ai_chat', 'recent-spike', 'settled', 'ai_response', 10,
          ${`usage-alert-spike-${tenantId}`}, ${new Date(evaluatedAt.getTime() - 30 * 60_000)}
        )
      `;
    });

    const generator = new UsageAlertWorkerStore(workerClient!);
    await expect(generator.generate(evaluatedAt)).resolves.toBe(1);
    await expect(generator.generate(new Date(evaluatedAt.getTime() + 60_000))).resolves.toBe(0);

    const sent: Array<{ to: string; subject: string; key: string }> = [];
    const notificationStore = new UsageAlertNotificationWorkerStore(workerClient!);
    const deliveryAt = new Date();
    await expect(runUsageAlertEmail(notificationStore, {
      async send(message, key) { sent.push({ to: message.to, subject: message.subject, key }); },
    }, envelopeKey, { now: deliveryAt })).resolves.toMatchObject({ status: "sent" });
    expect(sent).toEqual([expect.objectContaining({
      to: "billing@example.test", subject: expect.stringContaining("การใช้งานเพิ่มขึ้นผิดปกติ"),
    })]);

    const evidence = await adminClient!<{
      alerts: number; emailOutbox: number; attempts: number; outcome: string;
      providerLeak: boolean;
    }[]>`
      SELECT
        (SELECT count(*)::int FROM tenancy.usage_alert_deliveries
          WHERE tenant_id = ${tenantId}::uuid AND alert_key = 'usage_anomaly') AS alerts,
        (SELECT count(*)::int FROM tenancy.outbox
          WHERE tenant_id = ${tenantId}::uuid AND topic = 'usage.alert.email.requested') AS "emailOutbox",
        (SELECT count(*)::int FROM tenancy.usage_alert_delivery_attempts
          WHERE tenant_id = ${tenantId}::uuid) AS attempts,
        (SELECT outcome FROM tenancy.usage_alert_delivery_attempts
          WHERE tenant_id = ${tenantId}::uuid LIMIT 1) AS outcome,
        EXISTS (SELECT 1 FROM tenancy.usage_alert_deliveries
          WHERE tenant_id = ${tenantId}::uuid
            AND forecast_json::text ~* '(provider|model|native|cost)') AS "providerLeak"
    `;
    expect(evidence[0]).toEqual({ alerts: 1, emailOutbox: 1, attempts: 1, outcome: "sent", providerLeak: false });
    await expect(adminClient!`
      UPDATE tenancy.usage_alert_delivery_attempts SET outcome = 'failed'
      WHERE tenant_id = ${tenantId}::uuid
    `).rejects.toThrow(/immutable/);
  });
});
