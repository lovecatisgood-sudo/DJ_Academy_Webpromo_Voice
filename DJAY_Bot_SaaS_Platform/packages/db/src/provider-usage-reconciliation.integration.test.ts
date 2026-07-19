import { randomUUID } from "node:crypto";
import { createPlatformContext } from "@djay/tenancy";
import { afterAll, describe, expect, it } from "vitest";
import { createDatabaseClient } from "./client";
import { PlatformCommerceStore, ProviderUsageReconciliationWorkerStore } from "./commerce-store";

const workerUrl = process.env.WORKER_DATABASE_URL;
const platformUrl = process.env.PLATFORM_DATABASE_URL;
const adminUrl = process.env.ADMIN_DATABASE_URL;
const enabled = Boolean(workerUrl && platformUrl && adminUrl);
const workerClient = enabled ? createDatabaseClient(workerUrl!) : null;
const platformClient = enabled ? createDatabaseClient(platformUrl!) : null;
const adminClient = enabled ? createDatabaseClient(adminUrl!) : null;

afterAll(async () => { await workerClient?.end(); await platformClient?.end(); await adminClient?.end(); });

describe.runIf(enabled)("COM-03 provider usage reconciliation", () => {
  it("requires exact correlation and two-person append-only remediation evidence", async () => {
    const tenantId = randomUUID();
    const tenantUserId = randomUUID();
    const tenantMembershipId = randomUUID();
    const subscriptionId = randomUUID();
    const snapshotId = randomUUID();
    const customerEventId = randomUUID();
    const matchedProviderEventId = randomUUID();
    const missingProviderEventId = randomUUID();
    const requesterId = randomUUID();
    const reviewerId = randomUUID();
    const now = new Date();

    await adminClient!.begin(async (sql) => {
      await sql`INSERT INTO identity.users (id, display_name, status)
        VALUES (${tenantUserId}::uuid, 'Reconciliation Owner', 'active')`;
      await sql`INSERT INTO tenancy.tenants (id, slug, business_name)
        VALUES (${tenantId}::uuid, ${`reconcile-${tenantId.slice(0, 8)}`}, 'Reconciliation Test')`;
      await sql`INSERT INTO tenancy.memberships (id, tenant_id, user_id, role, status, accepted_at)
        VALUES (${tenantMembershipId}::uuid, ${tenantId}::uuid, ${tenantUserId}::uuid,
          'tenant_master_admin', 'active', ${now})`;
      await sql`
        INSERT INTO tenancy.product_subscriptions (id, tenant_id, product_key, plan_version_id, status)
        SELECT ${subscriptionId}::uuid, ${tenantId}::uuid, 'ai_chat', version.id, 'active'
        FROM catalog.plan_versions version JOIN catalog.plans plan ON plan.id = version.plan_id
        WHERE plan.plan_key = 'ai_chat_basic' ORDER BY version.version DESC LIMIT 1
      `;
      await sql`
        INSERT INTO tenancy.entitlement_snapshots (
          id, tenant_id, subscription_id, product_key, plan_version_id,
          subscription_status, access_mode, resolved_json, resolution_hash
        ) SELECT ${snapshotId}::uuid, ${tenantId}::uuid, ${subscriptionId}::uuid,
          'ai_chat', subscription.plan_version_id, 'active', 'active', '{}'::jsonb,
          digest('provider-reconciliation-test', 'sha256')
        FROM tenancy.product_subscriptions subscription WHERE subscription.id = ${subscriptionId}::uuid
      `;
      await sql`
        INSERT INTO tenancy.usage_events (
          id, tenant_id, subscription_id, entitlement_snapshot_id, product_key,
          operation_id, event_type, customer_unit, customer_quantity,
          idempotency_key, occurred_at
        ) VALUES (
          ${customerEventId}::uuid, ${tenantId}::uuid, ${subscriptionId}::uuid,
          ${snapshotId}::uuid, 'ai_chat', 'customer-response', 'settled',
          'ai_response', 1, ${`customer-event-${customerEventId}`}, ${now}
        )
      `;
      await sql`
        INSERT INTO tenancy.provider_usage_events (
          id, tenant_id, subscription_id, provider_key, provider_meter_key,
          source_event_id, native_quantity, native_unit, estimated_cost_minor,
          occurred_at, metadata
        ) VALUES
          (${matchedProviderEventId}::uuid, ${tenantId}::uuid, ${subscriptionId}::uuid,
            'provider_test', 'token_usage', ${`provider-${matchedProviderEventId}`},
            245, 'token', 12.5, ${now}, ${sql.json({ customerUsageEventId: customerEventId })}),
          (${missingProviderEventId}::uuid, ${tenantId}::uuid, ${subscriptionId}::uuid,
            'provider_test', 'token_usage', ${`provider-${missingProviderEventId}`},
            120, 'token', 6.25, ${now}, '{}'::jsonb)
      `;
      await sql`
        INSERT INTO platform.users (id, email_normalized, display_name, password_hash, status)
        VALUES
          (${requesterId}::uuid, ${`requester-${requesterId}@example.test`}, 'Finance Requester', 'unused', 'active'),
          (${reviewerId}::uuid, ${`reviewer-${reviewerId}@example.test`}, 'Finance Reviewer', 'unused', 'active')
      `;
    });

    const worker = new ProviderUsageReconciliationWorkerStore(workerClient!);
    await expect(worker.reconcile(now)).resolves.toEqual({ matched: 1, attention: 1 });
    await expect(worker.reconcile(now)).resolves.toEqual({ matched: 0, attention: 0 });

    const platform = new PlatformCommerceStore(platformClient!);
    const requester = createPlatformContext({ platformUserId: requesterId, sessionId: randomUUID(),
      role: "platform_finance", requestId: "reconciliation-request", reauthenticatedAt: now });
    const reviewer = createPlatformContext({ platformUserId: reviewerId, sessionId: randomUUID(),
      role: "platform_owner", requestId: "reconciliation-review", reauthenticatedAt: now });
    const overview = await platform.reconciliationOverview(requester, now);
    expect(overview).toMatchObject({ status: "attention", summary: {
      unreconciledProviderEvents: 0, providerAttentionResults: 1,
    }});
    const attention = overview.providerResults.find((result) => result.tenantId === tenantId);
    expect(attention).toMatchObject({ resultId: expect.any(String), status: "missing_correlation",
      nativeQuantity: 120, nativeUnit: "token", caseId: null });

    const requested = await platform.requestUsageReconciliationCase(requester, {
      tenantId, resultId: attention!.resultId, action: "investigate",
      reason: "Investigate missing exact customer usage correlation", now,
    });
    expect(requested).toMatchObject({ status: "requested", caseId: expect.any(String) });
    await expect(platform.reviewUsageReconciliationCase(requester, {
      caseId: requested.caseId, approve: true, note: "Self review must fail", now,
    })).rejects.toThrow(/different_reviewer_required/);
    await expect(platform.reviewUsageReconciliationCase(reviewer, {
      caseId: requested.caseId, approve: true, note: "Independent review approved", now,
    })).resolves.toEqual({ status: "approved" });

    const evidence = await adminClient!<{ results: number; caseEvents: number }[]>`
      SELECT
        (SELECT count(*)::int FROM tenancy.provider_usage_reconciliation_results
          WHERE tenant_id = ${tenantId}::uuid) AS results,
        (SELECT count(*)::int FROM platform.usage_reconciliation_case_events
          WHERE tenant_id = ${tenantId}::uuid) AS "caseEvents"
    `;
    expect(evidence[0]).toEqual({ results: 2, caseEvents: 2 });
    await expect(adminClient!`
      UPDATE tenancy.provider_usage_reconciliation_results SET status = 'matched'
      WHERE tenant_id = ${tenantId}::uuid AND provider_usage_event_id = ${missingProviderEventId}::uuid
    `).rejects.toThrow(/immutable/);
  });
});
