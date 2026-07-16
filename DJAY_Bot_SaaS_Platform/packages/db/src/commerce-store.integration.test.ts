import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createPlatformContext, createTenantContext } from "@djay/tenancy";
import type { VerifiedWebhook } from "@djay/usage-billing";
import { afterAll, describe, expect, it } from "vitest";
import { BillingWebhookStore } from "./billing-webhook-store";
import { createDatabaseClient } from "./client";
import { PlatformCommerceStore, PostgresCatalogStore, TenantCommerceStore } from "./commerce-store";

const tenantUrl = process.env.TENANT_DATABASE_URL;
const platformUrl = process.env.PLATFORM_DATABASE_URL;
const workerUrl = process.env.WORKER_DATABASE_URL;
const adminUrl = process.env.ADMIN_DATABASE_URL;
const enabled = Boolean(tenantUrl && platformUrl && workerUrl && adminUrl);
const tenantClient = enabled ? createDatabaseClient(tenantUrl!) : null;
const platformClient = enabled ? createDatabaseClient(platformUrl!) : null;
const workerClient = enabled ? createDatabaseClient(workerUrl!) : null;
const adminClient = enabled ? createDatabaseClient(adminUrl!) : null;

afterAll(async () => {
  await tenantClient?.end(); await platformClient?.end(); await workerClient?.end(); await adminClient?.end();
});

describe.runIf(enabled)("P2 commerce repositories", () => {
  it("isolates subscriptions, activates a pilot, reconciles usage, and inboxes webhook replay", async () => {
    const catalog = await new PostgresCatalogStore(tenantClient!).listPublic(new Date("2026-07-14T12:00:00Z"));
    expect(catalog).toHaveLength(6);
    expect(JSON.stringify(catalog)).not.toMatch(/provider|model|adapter/i);

    const contextA = createTenantContext({
      tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10",
      userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      membershipId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11",
      sessionId: randomUUID(), role: "tenant_master_admin", requestId: "commerce-tenant-a",
    });
    const contextB = createTenantContext({
      tenantId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10",
      userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
      membershipId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb11",
      sessionId: randomUUID(), role: "tenant_master_admin", requestId: "commerce-tenant-b",
    });
    const commerce = new TenantCommerceStore(tenantClient!);
    const now = new Date();
    const subscriptionA = randomUUID();
    const pendingA = await commerce.createPendingSubscription(contextA, {
      planKey: "ai_chat_basic", subscriptionId: subscriptionA,
      snapshotId: randomUUID(), quotaAccountId: randomUUID(), now,
    });
    expect(pendingA.status).toBe("created");
    await expect(commerce.createPendingSubscription(contextA, {
      planKey: "ai_chat_premium", subscriptionId: randomUUID(),
      snapshotId: randomUUID(), quotaAccountId: randomUUID(), now,
    })).resolves.toEqual({ status: "product_already_subscribed" });
    await expect(commerce.createPendingSubscription(contextA, {
      planKey: "flowbot_premium", subscriptionId: randomUUID(),
      snapshotId: randomUUID(), quotaAccountId: randomUUID(), now,
    })).resolves.toMatchObject({ status: "created" });
    await expect(commerce.createPendingSubscription(contextB, {
      planKey: "voice_basic_gen1", subscriptionId: randomUUID(),
      snapshotId: randomUUID(), quotaAccountId: randomUUID(), now,
    })).resolves.toMatchObject({ status: "created" });
    expect(await commerce.listSubscriptions(contextA)).toHaveLength(2);
    expect(await commerce.listSubscriptions(contextB)).toHaveLength(1);

    const platformUserId = randomUUID();
    await adminClient!`
      INSERT INTO platform.users (id, email_normalized, display_name, password_hash, status)
      VALUES (${platformUserId}::uuid, ${`commerce-${platformUserId}@example.test`}, 'Commerce Operator', 'not-used', 'active')
    `;
    const platform = new PlatformCommerceStore(platformClient!);
    const platformContext = createPlatformContext({
      platformUserId, sessionId: randomUUID(), role: "platform_owner",
      requestId: "commerce-platform-activation", reauthenticatedAt: now,
    });
    const activeSnapshotId = randomUUID();
    await expect(platform.activatePilot(platformContext, {
      subscriptionId: subscriptionA, snapshotId: activeSnapshotId, now,
    })).resolves.toMatchObject({ status: "activated", tenantId: contextA.tenantId });
    expect((await commerce.listSubscriptions(contextA)).find((item) => item.id === subscriptionA))
      .toMatchObject({ status: "active", accessMode: "active", planKey: "ai_chat_basic" });

    const reservationRequest = {
      tenantId: contextA.tenantId,
      subscriptionId: subscriptionA,
      entitlementSnapshotId: activeSnapshotId,
      productKey: "ai_chat" as const,
      unit: "ai_response" as const,
      operationId: "conversation-a-1",
      idempotencyKey: `reserve-${randomUUID()}`,
      requestedQuantity: 1,
    };
    const reserved = await commerce.reserve(contextA, reservationRequest);
    expect(reserved).toMatchObject({ status: "reserved", reservedQuantity: 1, replayed: false });
    if (!("reservationId" in reserved)) throw new Error("Expected reservation ID.");
    await expect(commerce.reserve(contextA, reservationRequest)).resolves.toMatchObject({
      status: "reserved", reservationId: reserved.reservationId, replayed: true,
    });
    await expect(commerce.reserve(contextB, { ...reservationRequest, tenantId: contextB.tenantId }))
      .resolves.toEqual({ status: "rejected", reason: "not_entitled" });
    const settleKey = `settle-${randomUUID()}`;
    await expect(commerce.settle(contextA, {
      reservationId: reserved.reservationId, actualQuantity: 1, idempotencyKey: settleKey, now: new Date(),
    })).resolves.toEqual({ status: "settled", replayed: false });
    await expect(commerce.settle(contextA, {
      reservationId: reserved.reservationId, actualQuantity: 1, idempotencyKey: settleKey, now: new Date(),
    })).resolves.toEqual({ status: "settled", replayed: true });

    await adminClient!`
      UPDATE tenancy.quota_accounts
      SET included_quantity = 100, safety_cap_quantity = 120
      WHERE tenant_id = ${contextA.tenantId}::uuid AND subscription_id = ${subscriptionA}::uuid
    `;
    const usageA = await commerce.usageOverview(contextA, now);
    expect(usageA).toMatchObject({ billingMode: "pre_release", invoicesAvailable: false });
    expect(usageA.subscriptions.find((item) => item.subscriptionId === subscriptionA)).toMatchObject({
      productKey: "ai_chat", planKey: "ai_chat_basic", customerUnit: "ai_response",
      includedQuantity: 100, safetyCapQuantity: 120, reservedQuantity: 0,
      settledQuantity: 1, committedQuantity: 1, remainingIncludedQuantity: 99,
      remainingSafetyCapQuantity: 119, pricingConfigured: false,
      recurringAmountMinor: null, billingInterval: null, overageRateMinor: null,
    });
    const usageB = await commerce.usageOverview(contextB, now);
    expect(usageB.subscriptions).toHaveLength(1);
    expect(usageB.subscriptions.every((item) => item.productKey === "voice")).toBe(true);
    expect(JSON.stringify({ usageA, usageB })).not.toMatch(/provider|model|adapter|nativeUsage|cost/i);

    const webhookStore = new BillingWebhookStore(workerClient!);
    const event: VerifiedWebhook = {
      externalEventId: `event-${randomUUID()}`, eventType: "subscription.active",
      occurredAt: new Date(), payload: { externalRef: "opaque-subscription-ref" },
    };
    const firstBody = JSON.stringify(event.payload);
    await expect(webhookStore.inbox({
      providerKey: "pilot", event, payloadHash: createHash("sha256").update(firstBody).digest(),
      payloadCiphertext: randomBytes(32).toString("base64"),
    })).resolves.toEqual({ status: "received" });
    await expect(webhookStore.inbox({
      providerKey: "pilot", event, payloadHash: createHash("sha256").update(firstBody).digest(),
      payloadCiphertext: randomBytes(32).toString("base64"),
    })).resolves.toEqual({ status: "replayed" });
    await expect(webhookStore.inbox({
      providerKey: "pilot", event, payloadHash: createHash("sha256").update("different").digest(),
      payloadCiphertext: randomBytes(32).toString("base64"),
    })).resolves.toEqual({ status: "event_id_conflict" });
  });
});
