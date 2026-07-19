import { randomUUID } from "node:crypto";
import { createPlatformContext, createTenantContext } from "@djay/tenancy";
import { afterAll, describe, expect, it } from "vitest";
import { createDatabaseClient } from "./client";
import { PlatformSharedSaasOperationsStore, TenantSharedSaasOperationsStore } from "./shared-saas-operations-store";

const tenantUrl = process.env.TENANT_DATABASE_URL;
const platformUrl = process.env.PLATFORM_DATABASE_URL;
const adminUrl = process.env.ADMIN_DATABASE_URL;
const enabled = Boolean(tenantUrl && platformUrl && adminUrl);
const tenantClient = enabled ? createDatabaseClient(tenantUrl!) : null;
const platformClient = enabled ? createDatabaseClient(platformUrl!) : null;
const adminClient = enabled ? createDatabaseClient(adminUrl!) : null;

afterAll(async () => {
  await tenantClient?.end();
  await platformClient?.end();
  await adminClient?.end();
});

describe.runIf(enabled)("shared SaaS request and fulfillment operations", () => {
  it("keeps requests non-entitling until platform fulfillment and isolates the tenant queue", async () => {
    const tenantA = createTenantContext({
      tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10",
      userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      membershipId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11",
      sessionId: randomUUID(), role: "tenant_master_admin", requestId: "shared-ops-tenant-a",
    });
    const tenantB = createTenantContext({
      tenantId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10",
      userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
      membershipId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb11",
      sessionId: randomUUID(), role: "tenant_master_admin", requestId: "shared-ops-tenant-b",
    });
    const owners = await adminClient!<{ id: string }[]>`
      SELECT app_user.id FROM platform.users app_user
      JOIN platform.role_assignments assignment ON assignment.platform_user_id = app_user.id
      WHERE assignment.role = 'platform_owner' AND assignment.revoked_at IS NULL LIMIT 1
    `;
    const platform = createPlatformContext({
      platformUserId: owners[0]!.id, sessionId: randomUUID(), role: "platform_owner",
      requestId: "shared-ops-platform", reauthenticatedAt: new Date(),
    });
    const tenantStore = new TenantSharedSaasOperationsStore(tenantClient!);
    const platformStore = new PlatformSharedSaasOperationsStore(platformClient!);
    const subscriptions = await adminClient!<{ id: string }[]>`
      SELECT id FROM tenancy.product_subscriptions
      WHERE tenant_id = ${tenantA.tenantId}::uuid AND status IN ('active','trialing','scheduled_change')
      ORDER BY created_at LIMIT 1
    `;
    const subscriptionId = subscriptions[0]!.id;
    const workspaceOwners = await adminClient!<{ userId: string }[]>`
      SELECT user_id AS "userId" FROM tenancy.memberships
      WHERE tenant_id = ${tenantA.tenantId}::uuid AND role = 'tenant_master_admin' AND status = 'active'
    `;
    const workspaceOwnerUserId = workspaceOwners[0]!.userId;
    let addOnRequestId = "";
    let serviceRequestId = "";
    let engagementId = "";
    try {
      const before = await tenantStore.overview(tenantA);
      const addOnIdempotencyKey = randomUUID();
      const requested = await tenantStore.requestAddOn(tenantA, {
        subscriptionId, addOnKey: "additional_administrator", quantity: 2, requestedScope: {}, idempotencyKey: addOnIdempotencyKey,
      });
      expect(requested.status).toBe("requested");
      if (requested.status !== "requested") throw new Error("Expected an add-on request.");
      addOnRequestId = requested.requestId;
      await expect(tenantStore.requestAddOn(tenantA, {
        subscriptionId, addOnKey: "additional_administrator", quantity: 2, requestedScope: {}, idempotencyKey: addOnIdempotencyKey,
      })).resolves.toEqual({ status: "requested", requestId: addOnRequestId, replayed: true });
      await expect(tenantStore.requestAddOn(tenantA, {
        subscriptionId, addOnKey: "additional_administrator", quantity: 3, requestedScope: {}, idempotencyKey: addOnIdempotencyKey,
      })).resolves.toEqual({ status: "idempotency_conflict" });
      await expect(tenantStore.requestAddOn(tenantA, {
        addOnKey: "additional_workspace", quantity: 2, requestedScope: {}, idempotencyKey: randomUUID(),
      })).resolves.toEqual({ status: "invalid_quantity" });
      const serviceIdempotencyKey = randomUUID();
      const service = await tenantStore.requestService(tenantA, {
        serviceKind: "knowledge_base_setup", productKey: "ai_chat",
        brief: "Prepare and validate the merchant knowledge base for production launch.",
        idempotencyKey: serviceIdempotencyKey,
      });
      expect(service.status).toBe("requested");
      if (service.status !== "requested") throw new Error("Expected a service request.");
      serviceRequestId = service.serviceRequestId;
      await expect(tenantStore.requestService(tenantA, {
        serviceKind: "knowledge_base_setup", productKey: "ai_chat",
        brief: "Prepare and validate the merchant knowledge base for production launch.", idempotencyKey: serviceIdempotencyKey,
      })).resolves.toEqual({ status: "requested", serviceRequestId, replayed: true });

      const requestedOverview = await tenantStore.overview(tenantA);
      expect(requestedOverview.activeAddOns).toEqual(before.activeAddOns);
      expect(requestedOverview.addOns).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: addOnRequestId, status: "requested" }),
      ]));
      expect((await tenantStore.overview(tenantB)).addOns.some((item) => item.id === addOnRequestId)).toBe(false);

      const queue = await platformStore.queue(platform);
      expect(queue.addOns).toEqual(expect.arrayContaining([expect.objectContaining({ id: addOnRequestId })]));
      expect(queue.services).toEqual(expect.arrayContaining([expect.objectContaining({ id: serviceRequestId })]));
      await expect(platformStore.provisionAddOn(platform, addOnRequestId)).resolves.toEqual({ status: "provisioned" });
      const fulfilled = await tenantStore.overview(tenantA);
      expect(fulfilled.activeAddOns).toEqual(expect.arrayContaining([
        expect.objectContaining({ addOnKey: "additional_administrator", quantity: 2, status: "active" }),
      ]));
      const incrementRequest = await tenantStore.requestAddOn(tenantA, {
        subscriptionId, addOnKey: "additional_administrator", quantity: 1, requestedScope: {}, idempotencyKey: randomUUID(),
      });
      expect(incrementRequest.status).toBe("requested");
      if (incrementRequest.status !== "requested") throw new Error("Expected an additive add-on request.");
      await expect(platformStore.provisionAddOn(platform, incrementRequest.requestId)).resolves.toEqual({ status: "provisioned" });
      expect((await tenantStore.overview(tenantA)).activeAddOns).toEqual(expect.arrayContaining([
        expect.objectContaining({ addOnKey: "additional_administrator", quantity: 3, status: "active" }),
      ]));

      const engagement = await platformStore.createEngagement(platform, {
        serviceRequestId, title: "Knowledge base launch setup",
        scope: "Prepare, validate, and hand over the production knowledge collection.",
        nextActionOwner: "djai",
      });
      expect(engagement.status).toBe("created");
      if (engagement.status !== "created") throw new Error("Expected a service engagement.");
      engagementId = engagement.engagementId;
      expect((await tenantStore.overview(tenantA)).engagements).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: engagementId, serviceRequestId, title: "Knowledge base launch setup", status: "awaiting_customer" }),
      ]));
      const customerUpdateKey = randomUUID();
      const customerUpdate = await tenantStore.addEngagementUpdate(tenantA, {
        engagementId, body: "The approved catalogue files are ready for the delivery team.", idempotencyKey: customerUpdateKey,
      });
      expect(customerUpdate.status).toBe("updated");
      await expect(tenantStore.addEngagementUpdate(tenantA, {
        engagementId, body: "The approved catalogue files are ready for the delivery team.", idempotencyKey: customerUpdateKey,
      })).resolves.toEqual({ status: "updated", updateId: customerUpdate.status === "updated" ? customerUpdate.updateId : "", replayed: true });
      await expect(platformStore.updateEngagement(platform, {
        engagementId, status: "completed", nextActionOwner: "customer", body: "Attempted invalid direct completion.", idempotencyKey: randomUUID(),
      })).resolves.toEqual({ status: "invalid_transition" });
      const deliveryUpdateKey = randomUUID();
      const deliveryUpdate = await platformStore.updateEngagement(platform, {
        engagementId, status: "in_progress", nextActionOwner: "djai", body: "Catalogue validation has started.", idempotencyKey: deliveryUpdateKey,
      });
      expect(deliveryUpdate.status).toBe("updated");
      await expect(platformStore.updateEngagement(platform, {
        engagementId, status: "in_progress", nextActionOwner: "djai", body: "Catalogue validation has started.", idempotencyKey: deliveryUpdateKey,
      })).resolves.toEqual({ status: "updated", updateId: deliveryUpdate.status === "updated" ? deliveryUpdate.updateId : "", replayed: true });
      const lifecycleOverview = await tenantStore.overview(tenantA);
      expect(lifecycleOverview.engagements).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: engagementId, status: "in_progress", nextActionOwner: "djai" }),
      ]));
      expect(lifecycleOverview.engagementUpdates.filter((item) => item.engagementId === engagementId)).toHaveLength(2);

      const workspaceSlug = `shared-ops-${randomUUID().slice(0, 8)}`;
      const workspaceRequest = await tenantStore.requestAddOn(tenantA, {
        addOnKey: "additional_workspace", quantity: 1,
        requestedScope: { businessName: "Shared Operations Second Workspace", slug: workspaceSlug }, idempotencyKey: randomUUID(),
      });
      expect(workspaceRequest.status).toBe("requested");
      if (workspaceRequest.status !== "requested") throw new Error("Expected a workspace request.");
      const workspaceProvision = await platformStore.provisionAddOn(platform, workspaceRequest.requestId);
      expect(workspaceProvision.status).toBe("provisioned");
      if (workspaceProvision.status !== "provisioned" || !("provisionedTenantId" in workspaceProvision)) {
        throw new Error("Expected an atomically provisioned workspace.");
      }
      const provisioned = await adminClient!<{ owners: number; onboarding: number }[]>`
        SELECT
          (SELECT count(*)::int FROM tenancy.memberships WHERE tenant_id = ${workspaceProvision.provisionedTenantId}::uuid
            AND user_id = ${workspaceOwnerUserId}::uuid AND role = 'tenant_master_admin' AND status = 'active') AS owners,
          (SELECT count(*)::int FROM tenancy.tenant_onboarding WHERE tenant_id = ${workspaceProvision.provisionedTenantId}::uuid) AS onboarding
      `;
      expect(provisioned[0]).toEqual({ owners: 1, onboarding: 1 });
    } finally {
      await adminClient!`DELETE FROM tenancy.subscription_add_ons WHERE tenant_id = ${tenantA.tenantId}::uuid
        AND subscription_id = ${subscriptionId}::uuid AND add_on_key = 'additional_administrator'`;
      await adminClient!`DELETE FROM tenancy.add_on_requests WHERE id = ${addOnRequestId || null}::uuid`;
    }
  });
});
