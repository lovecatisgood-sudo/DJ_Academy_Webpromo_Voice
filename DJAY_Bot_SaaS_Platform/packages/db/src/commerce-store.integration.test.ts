import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createPlatformContext, createTenantContext } from "@djay/tenancy";
import type { VerifiedWebhook } from "@djay/usage-billing";
import { afterAll, describe, expect, it } from "vitest";
import { BillingWebhookStore } from "./billing-webhook-store";
import { createDatabaseClient } from "./client";
import {
  PlatformCommerceStore, PostgresCatalogStore, TenantCommerceStore,
  UsageAlertWorkerStore, UsagePeriodWorkerStore,
} from "./commerce-store";

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
    expect(catalog).toHaveLength(0);
    const marketCatalog = await new PostgresCatalogStore(tenantClient!).listPublic(new Date("2026-07-18T12:00:00Z"));
    expect(marketCatalog).toHaveLength(6);
    expect(marketCatalog.find((plan) => plan.planKey === "flowbot_basic")).toMatchObject({
      publicName: "Flow Bot Starter", firstTermAmountMinor: 249_900,
      renewalAmountMinor: 499_900, firstTermDiscountMinor: 250_000,
      sellable: false, stripeMappingState: "missing",
    });
    await expect(new PostgresCatalogStore(tenantClient!).quote("flowbot_basic", new Date("2026-07-18T12:00:00Z")))
      .resolves.toEqual({ status: "checkout_unavailable", reason: "stripe_mapping_missing" });
    expect(JSON.stringify(marketCatalog)).not.toMatch(/provider|model|adapter/i);

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
    const contractId = randomUUID();
    const acceptedAt = new Date("2026-07-18T12:30:00Z");
    const contract = await commerce.createContractSnapshot(contextA, {
      subscriptionId: subscriptionA, contractId, acceptedAt,
    });
    expect(contract).toMatchObject({
      status: "created", contractId,
      contract: {
        catalogVersion: "djay-bots-th-2026-01", planKey: "ai_chat_basic",
        firstTermAmountMinor: 595_000, renewalAmountMinor: 1_190_000,
        firstTermDiscountMinor: 595_000, thirdPartyFeesIncluded: false,
        taxTreatment: "calculated_at_checkout",
        promotion: { key: "first-year-launch-2026-01", applicationMethod: "server_side", termCount: 1 },
        allowancePolicy: { interval: "month", timezone: "Asia/Bangkok", rollover: false },
      },
    });
    expect(contract.contractSha256).toMatch(/^[a-f0-9]{64}$/);
    await expect(commerce.createContractSnapshot(contextA, {
      subscriptionId: subscriptionA, contractId: randomUUID(), acceptedAt,
    })).resolves.toMatchObject({ status: "exists", contractId, contractSha256: contract.contractSha256 });
    await expect(commerce.createContractSnapshot(contextB, {
      subscriptionId: subscriptionA, contractId: randomUUID(), acceptedAt,
    })).resolves.toEqual({ status: "subscription_not_found" });
    await expect(adminClient!`
      UPDATE tenancy.subscription_contract_snapshots SET accepted_at = now()
      WHERE id = ${contractId}::uuid
    `).rejects.toThrow(/subscription contract snapshots are immutable/);
    await expect(adminClient!`
      UPDATE catalog.plan_commercial_terms SET first_term_amount_minor = 1
      WHERE catalog_version_id = '63000000-0000-4000-8000-000000000001'::uuid
        AND plan_version_id = '62000000-0000-4000-8000-000000000103'::uuid
    `).rejects.toThrow(/locked catalog content is immutable/);
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
    expect(await platform.catalogLifecycle(platformContext)).toEqual([
      expect.objectContaining({
        versionKey: "djay-bots-th-2026-01", status: "active", planCount: 6,
        sellablePlanCount: 0, liveMappingCount: 0,
      }),
    ]);
    const operatorContext = createPlatformContext({
      platformUserId, sessionId: randomUUID(), role: "platform_finance",
      requestId: "commerce-catalog-operator", reauthenticatedAt: now,
    });
    await expect(platform.approveCatalogVersion(operatorContext, {
      catalogVersionId: "63000000-0000-4000-8000-000000000001",
      expectedContentSha256: "00".repeat(32), now,
    })).rejects.toThrow(/platform_owner_required/);
    await expect(adminClient!`
      INSERT INTO catalog.promotions (
        catalog_version_id, promotion_key, public_name, eligibility,
        application_method, term_count, effective_from
      ) VALUES (
        '63000000-0000-4000-8000-000000000001', 'late-mutation', 'Late Mutation',
        'new_annual_subscription', 'server_side', 1, now()
      )
    `).rejects.toThrow(/locked catalog content is immutable/);
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
    await expect(adminClient!`
      UPDATE tenancy.usage_reservations
      SET funding_json = '{"included":0,"packs":0,"overage":1}'::jsonb
      WHERE tenant_id = ${contextA.tenantId}::uuid AND id = ${reserved.reservationId}::uuid
    `).rejects.toThrow(/usage_reservation_authority_is_immutable/);

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
      recurringAmountMinor: 1_190_000, billingInterval: "year", overageRateMinor: 35,
    });
    const usageB = await commerce.usageOverview(contextB, now);
    expect(usageB.subscriptions).toHaveLength(1);
    expect(usageB.subscriptions.every((item) => item.productKey === "voice")).toBe(true);
    expect(JSON.stringify({ usageA, usageB })).not.toMatch(/provider|model|adapter|nativeUsage|cost/i);

    const exhaustionRequest = {
      ...reservationRequest,
      operationId: "conversation-a-exhaustion",
      idempotencyKey: `reserve-exhaustion-${randomUUID()}`,
      requestedQuantity: 100,
    };
    await expect(commerce.reserve(contextA, exhaustionRequest)).resolves.toMatchObject({
      status: "rejected", reason: "allowance_exhausted",
    });
    const packLotId = randomUUID();
    await adminClient!`
      INSERT INTO tenancy.usage_pack_lots (
        id, tenant_id, subscription_id, customer_unit, pack_key,
        purchased_quantity, effective_from, expires_at, status
      ) VALUES (${packLotId}::uuid, ${contextA.tenantId}::uuid, ${subscriptionA}::uuid,
        'ai_response', 'ai_starter_1000', 10, now() - interval '1 minute',
        now() + interval '30 days', 'active')
    `;
    const packFunded = await commerce.reserve(contextA, {
      ...exhaustionRequest, idempotencyKey: `reserve-pack-${randomUUID()}`,
    });
    expect(packFunded).toMatchObject({ status: "reserved", reservedQuantity: 100 });
    if (!("reservationId" in packFunded)) throw new Error("Expected pack-funded reservation.");
    await expect(commerce.release(contextA, {
      reservationId: packFunded.reservationId,
      idempotencyKey: `release-pack-${randomUUID()}`, now,
    })).resolves.toMatchObject({ status: "released", replayed: false });
    const packBalance = await adminClient!<{ consumed: string }[]>`
      SELECT COALESCE(sum(CASE event_type WHEN 'allocated' THEN quantity ELSE -quantity END), 0) AS consumed
      FROM tenancy.usage_pack_consumptions WHERE pack_lot_id = ${packLotId}::uuid
    `;
    expect(Number(packBalance[0]!.consumed)).toBe(0);
    const usageAlerts = new UsageAlertWorkerStore(workerClient!);
    const alertTime = new Date(now.getTime() + 60_000);
    expect(await usageAlerts.generate(alertTime)).toBeGreaterThanOrEqual(1);
    expect(await usageAlerts.generate(alertTime)).toBe(0);
    const alertEvidence = await adminClient!<{ alerts: number; outbox: number }[]>`
      SELECT
        (SELECT count(*)::int FROM tenancy.usage_alert_deliveries
          WHERE tenant_id = ${contextA.tenantId}::uuid) AS alerts,
        (SELECT count(*)::int FROM tenancy.outbox WHERE tenant_id = ${contextA.tenantId}::uuid
          AND topic = 'usage.alert.created') AS outbox
    `;
    expect(alertEvidence[0]!.alerts).toBeGreaterThanOrEqual(1);
    expect(alertEvidence[0]!.outbox).toBe(alertEvidence[0]!.alerts);

    const healthyReconciliation = await platform.reconciliationOverview(platformContext, now);
    expect(healthyReconciliation).toMatchObject({
      status: "healthy",
      summary: {
        attentionAccounts: 0, activeWithoutCurrentAccount: 0,
        orphanUsageEvents: 0, expiredOpenReservations: 0,
      },
    });
    expect(healthyReconciliation.accounts.find((item) => item.tenantId === contextA.tenantId
      && item.productKey === "ai_chat")).toMatchObject({
      accountReserved: 0, reservationReserved: 0, accountSettled: 1,
      reservationSettled: 1, settledEvents: 1, netSettledEvents: 1,
      reservedVariance: 0, settledVariance: 0, eventVariance: 0, status: "healthy",
    });
    expect(JSON.stringify(healthyReconciliation.accounts)).not.toMatch(/provider|model|adapter|nativeUsage|cost|margin/i);
    expect(healthyReconciliation.providerResults).toEqual([]);

    await adminClient!`
      UPDATE tenancy.quota_accounts SET settled_quantity = settled_quantity + 1
      WHERE tenant_id = ${contextA.tenantId}::uuid AND subscription_id = ${subscriptionA}::uuid
    `;
    const mismatchedReconciliation = await platform.reconciliationOverview(platformContext, now);
    expect(mismatchedReconciliation).toMatchObject({ status: "attention" });
    expect(mismatchedReconciliation.summary.attentionAccounts).toBe(1);
    expect(mismatchedReconciliation.accounts.find((item) => item.tenantId === contextA.tenantId
      && item.productKey === "ai_chat")).toMatchObject({
      accountSettled: 2, netSettledEvents: 1, settledVariance: 1, status: "attention",
    });
    await adminClient!`
      UPDATE tenancy.quota_accounts SET settled_quantity = settled_quantity - 1
      WHERE tenant_id = ${contextA.tenantId}::uuid AND subscription_id = ${subscriptionA}::uuid
    `;

    const expiringReservation = await commerce.reserve(contextA, {
      ...reservationRequest, operationId: "conversation-before-period-expiry",
      idempotencyKey: `reserve-before-expiry-${randomUUID()}`,
    });
    expect(expiringReservation).toMatchObject({ status: "reserved" });
    if (!("reservationId" in expiringReservation)) throw new Error("Expected expiring reservation.");
    const rolloverAt = new Date(now.getTime() + 2 * 60 * 60 * 1_000);
    await adminClient!`
      UPDATE tenancy.quota_accounts
      SET period_start = ${new Date(rolloverAt.getTime() - 31 * 24 * 60 * 60 * 1_000)},
          period_end = ${new Date(rolloverAt.getTime() - 60_000)}
      WHERE tenant_id = ${contextA.tenantId}::uuid AND subscription_id = ${subscriptionA}::uuid
    `;
    await adminClient!`
      UPDATE tenancy.product_subscriptions
      SET period_end = ${new Date(rolloverAt.getTime() - 60_000)}
      WHERE tenant_id = ${contextA.tenantId}::uuid AND id = ${subscriptionA}::uuid
    `;
    const periodWorker = new UsagePeriodWorkerStore(workerClient!);
    await expect(periodWorker.roll(rolloverAt)).resolves.toEqual({
      periodsCreated: 1, reservationsReleased: 1,
    });
    await expect(periodWorker.roll(rolloverAt)).resolves.toEqual({
      periodsCreated: 0, reservationsReleased: 0,
    });
    const rolloverEvidence = await adminClient!<{
      periods: number; reservationStatus: string; periodEvents: number;
    }[]>`
      SELECT
        (SELECT count(*)::int FROM tenancy.quota_accounts
          WHERE tenant_id = ${contextA.tenantId}::uuid
            AND subscription_id = ${subscriptionA}::uuid) AS periods,
        (SELECT status FROM tenancy.usage_reservations
          WHERE tenant_id = ${contextA.tenantId}::uuid
            AND id = ${expiringReservation.reservationId}::uuid) AS "reservationStatus",
        (SELECT count(*)::int FROM tenancy.outbox
          WHERE tenant_id = ${contextA.tenantId}::uuid
            AND topic = 'usage.period.started') AS "periodEvents"
    `;
    expect(rolloverEvidence[0]).toEqual({ periods: 2, reservationStatus: "released", periodEvents: 1 });

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
