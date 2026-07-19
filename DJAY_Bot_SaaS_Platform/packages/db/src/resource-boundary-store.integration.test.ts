import { randomUUID } from "node:crypto";
import { createTenantContext } from "@djay/tenancy";
import { afterAll, describe, expect, it } from "vitest";
import { createDatabaseClient } from "./client";
import { EntitlementChangeWorkerStore, TenantResourceBoundaryStore } from "./resource-boundary-store";

const tenantUrl = process.env.TENANT_DATABASE_URL;
const adminUrl = process.env.ADMIN_DATABASE_URL;
const workerUrl = process.env.WORKER_DATABASE_URL;
const enabled = Boolean(tenantUrl && adminUrl && workerUrl);
const client = enabled ? createDatabaseClient(tenantUrl!) : null;
const adminClient = enabled ? createDatabaseClient(adminUrl!) : null;
const workerClient = enabled ? createDatabaseClient(workerUrl!) : null;
afterAll(async () => { await client?.end(); await adminClient?.end(); await workerClient?.end(); });

describe.runIf(enabled)("COM-02 resource boundary overview", () => {
  it("derives tenant-isolated gauges from the latest active snapshots", async () => {
    const tenantA = createTenantContext({
      tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10",
      userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      membershipId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11",
      sessionId: randomUUID(), role: "tenant_master_admin", requestId: "resource-boundary-a",
    });
    const tenantB = createTenantContext({
      tenantId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10",
      userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
      membershipId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb11",
      sessionId: randomUUID(), role: "tenant_master_admin", requestId: "resource-boundary-b",
    });
    const store = new TenantResourceBoundaryStore(client!);
    const [overviewA, overviewB] = await Promise.all([store.overview(tenantA), store.overview(tenantB)]);
    expect(overviewA.products).toEqual(expect.arrayContaining([
      expect.objectContaining({
        productKey: "ai_chat", planKey: "ai_chat_basic",
        boundaries: expect.arrayContaining([
          expect.objectContaining({ key: "active_bots", limit: 1 }),
          expect.objectContaining({ key: "social_channels", limit: 0 }),
        ]),
      }),
    ]));
    expect(overviewA.seatCapacity.limit).toBeGreaterThanOrEqual(1);
    expect(overviewA.products.every((product) => product.subscriptionId
      !== overviewB.products[0]?.subscriptionId)).toBe(true);
    expect(overviewB.resourceStates).toEqual([]);

    const aiSubscription = overviewA.products.find((product) => product.productKey === "ai_chat")!;
    const premiumSnapshotId = randomUUID();
    await adminClient!`
      UPDATE tenancy.product_subscriptions SET plan_version_id = '62000000-0000-4000-8000-000000000104'
      WHERE tenant_id = ${tenantA.tenantId}::uuid AND id = ${aiSubscription.subscriptionId}::uuid
    `;
    await adminClient!`
      INSERT INTO tenancy.entitlement_snapshots (
        id, tenant_id, subscription_id, product_key, plan_version_id,
        subscription_status, access_mode, resolved_json, resolution_hash
      ) SELECT ${premiumSnapshotId}::uuid, ${tenantA.tenantId}::uuid,
        ${aiSubscription.subscriptionId}::uuid, 'ai_chat', version.id, 'active', 'active',
        jsonb_build_object('entitlements', version.entitlements, 'limits', version.limits,
          'allowances', version.allowances, 'overageRatesMinor', version.overage_rates_minor),
        digest(${premiumSnapshotId}, 'sha256')
      FROM catalog.plan_versions version
      WHERE version.id = '62000000-0000-4000-8000-000000000104'
    `;
    const agentIds = [randomUUID(), randomUUID()];
    const retainedAgentId = agentIds[0]!;
    const excessAgentId = agentIds[1]!;
    for (const [index, agentId] of agentIds.entries()) await adminClient!`
      INSERT INTO tenancy.ai_agents (id, tenant_id, name, status, default_language, created_by_membership_id)
      VALUES (${agentId}::uuid, ${tenantA.tenantId}::uuid, ${`Boundary Agent ${index + 1}`},
        'active', 'en', ${tenantA.membershipId}::uuid)
    `;
    const preflight = await store.downgradePreflight(tenantA, {
      subscriptionId: aiSubscription.subscriptionId, destinationPlanKey: "ai_chat_basic",
    });
    expect(preflight).toMatchObject({
      status: "evaluated", allowed: false, productKey: "ai_chat",
      blockers: expect.arrayContaining([
        expect.objectContaining({ code: "resource_limit_exceeded", resourceKey: "active_bots", excess: 1 }),
      ]),
    });
    await expect(adminClient!`
      UPDATE tenancy.downgrade_preflight_evidence SET blockers = '[]'::jsonb
      WHERE id = ${preflight.status === "evaluated" ? preflight.evidenceId : randomUUID()}::uuid
    `).rejects.toThrow(/immutable/);
    if (preflight.status !== "evaluated") throw new Error("Expected evaluated preflight.");
    const invalidSelection = await store.scheduleDowngrade(tenantA, {
      evidenceId: preflight.evidenceId, retainedActiveBotIds: [], retainedSocialChannelIds: [],
    });
    expect(invalidSelection).toMatchObject({ status: "invalid_selection", requiredCount: 1, availableCount: 2 });
    const scheduled = await store.scheduleDowngrade(tenantA, {
      evidenceId: preflight.evidenceId,
      retainedActiveBotIds: [retainedAgentId], retainedSocialChannelIds: [],
    });
    expect(scheduled).toMatchObject({
      status: "scheduled",
      retainedResourceSelection: {
        retainedActiveBotIds: [retainedAgentId],
        excessResources: [expect.objectContaining({
          resourceId: excessAgentId, resourceKind: "bot", state: "read_only_excess",
        })],
      },
    });
    if (scheduled.status !== "scheduled") throw new Error("Expected scheduled downgrade.");
    const worker = new EntitlementChangeWorkerStore(workerClient!);
    expect(await worker.applyNext(new Date(scheduled.effectiveAt.getTime() - 1))).toBeNull();
    expect(await worker.applyNext(new Date(scheduled.effectiveAt.getTime() + 1))).toMatchObject({
      changeId: scheduled.changeId, subscriptionId: aiSubscription.subscriptionId, result: "applied",
    });
    const applied = await adminClient!<{ plan_key: string; status: string; snapshots: number; excess: number; audits: number }[]>`
      SELECT plan.plan_key, subscription.status,
        (SELECT count(*)::int FROM tenancy.entitlement_snapshots snapshot
          WHERE snapshot.subscription_id = subscription.id
            AND snapshot.plan_version_id = '62000000-0000-4000-8000-000000000103') AS snapshots,
        (SELECT count(*)::int FROM tenancy.entitlement_resource_states state
          WHERE state.tenant_id = subscription.tenant_id AND state.product_key = 'ai_chat'
            AND state.resource_id = ${excessAgentId}::uuid AND state.state = 'read_only_excess') AS excess,
        (SELECT count(*)::int FROM tenancy.audit_logs audit
          WHERE audit.tenant_id = subscription.tenant_id
            AND audit.action = 'subscription.plan_change_applied'
            AND audit.target_id = subscription.id::text) AS audits
      FROM tenancy.product_subscriptions subscription
      JOIN catalog.plan_versions version ON version.id = subscription.plan_version_id
      JOIN catalog.plans plan ON plan.id = version.plan_id
      WHERE subscription.id = ${aiSubscription.subscriptionId}::uuid
    `;
    expect(applied[0]).toMatchObject({
      plan_key: "ai_chat_basic", status: "active", excess: 1, audits: 1,
    });
    expect(applied[0]!.snapshots).toBeGreaterThanOrEqual(1);
    await adminClient!`
      UPDATE tenancy.ai_agents SET status = 'archived'
      WHERE tenant_id = ${tenantA.tenantId}::uuid AND id = ANY(${agentIds}::uuid[])
    `;
  });
});
