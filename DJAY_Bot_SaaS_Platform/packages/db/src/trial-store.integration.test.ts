import { randomUUID } from "node:crypto";
import { createTenantContext } from "@djay/tenancy";
import { afterAll, describe, expect, it } from "vitest";
import { createDatabaseClient } from "./client";
import { TenantCommerceStore } from "./commerce-store";
import { PurchaseIntentStore } from "./purchase-intent-store";
import { TrialLifecycleWorkerStore, TrialStore } from "./trial-store";

const tenantUrl = process.env.TENANT_DATABASE_URL;
const adminUrl = process.env.ADMIN_DATABASE_URL;
const workerUrl = process.env.WORKER_DATABASE_URL;
const enabled = Boolean(tenantUrl && adminUrl && workerUrl);
const tenantClient = enabled ? createDatabaseClient(tenantUrl!) : null;
const adminClient = enabled ? createDatabaseClient(adminUrl!) : null;
const workerClient = enabled ? createDatabaseClient(workerUrl!) : null;

afterAll(async () => { await tenantClient?.end(); await adminClient?.end(); await workerClient?.end(); });

describe.runIf(enabled)("Flow Starter trial activation", () => {
  it("does not start the clock before a published Builder claim exists", async () => {
    const now = new Date("2026-08-17T10:00:00Z");
    const context = createTenantContext({
      tenantId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10",
      userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
      membershipId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb11",
      sessionId: randomUUID(), role: "tenant_master_admin", requestId: "flow-trial-not-published",
    });
    await adminClient!`
      UPDATE tenancy.tenant_onboarding
      SET merchant_onboarding_version = 1, guidelines_version = 'merchant-v1',
          guidelines_accepted_at = ${now}, preferences_completed_at = ${now},
          business_goal = 'answer_questions', industry = 'retail',
          first_product = 'flowbot', launch_channel = 'website'
      WHERE tenant_id = ${context.tenantId}::uuid
    `;
    const subscriptionId = randomUUID();
    await new TenantCommerceStore(tenantClient!).createPendingSubscription(context, {
      planKey: "flowbot_basic", subscriptionId,
      snapshotId: randomUUID(), quotaAccountId: randomUUID(), now,
    });
    const purchase = await new PurchaseIntentStore(tenantClient!).createPurchaseIntent({
      planKey: "flowbot_basic", tenantId: context.tenantId, commerceIntent: "trial", now,
    }, context);
    if (purchase.status !== "created") throw new Error("expected trial purchase intent");
    await expect(new TrialStore(tenantClient!).activateFlowStarter(context, {
      purchaseIntentId: purchase.intentId, trialGrantId: randomUUID(),
      entitlementSnapshotId: randomUUID(), idempotencyKey: `flow-trial-${randomUUID()}`, now,
    })).resolves.toEqual({ status: "not_eligible" });
    const evidence = await adminClient!<{ grants: number; status: string }[]>`
      SELECT (SELECT count(*)::int FROM billing.trial_grants
        WHERE tenant_id = ${context.tenantId}::uuid) AS grants, status
      FROM tenancy.product_subscriptions WHERE id = ${subscriptionId}::uuid
    `;
    expect(evidence[0]).toEqual({ grants: 0, status: "pending" });
  });

  it("activates once for a verified owner email with fixed website-only authority", async () => {
    const now = new Date("2026-08-17T12:00:00Z");
    const context = createTenantContext({
      tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10",
      userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      membershipId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11",
      sessionId: randomUUID(), role: "tenant_master_admin", requestId: "flow-trial-activate",
    });
    await adminClient!`
      UPDATE tenancy.tenant_onboarding
      SET merchant_onboarding_version = 1, guidelines_version = 'merchant-v1',
          guidelines_accepted_at = ${now}, preferences_completed_at = ${now},
          business_goal = 'capture_leads', industry = 'services',
          first_product = 'flowbot', launch_channel = 'website'
      WHERE tenant_id = ${context.tenantId}::uuid
    `;
    const builderSessionId = randomUUID();
    const builderDraftId = randomUUID();
    const publishedState = {
      schemaVersion: 1, locale: "en", access: { product: "flow", plan: "flowbot_basic", intent: "trial" },
      configuration: { flowUi: { configured: true, version: 1 }, flowPublishedDraft: { entryId: "welcome", nodes: [] } },
    };
    await adminClient!`
      INSERT INTO builder.anonymous_sessions (
        id, issued_at, expires_at, last_seen_at, status, claimed_tenant_id, claimed_at
      ) VALUES (
        ${builderSessionId}::uuid, ${now}, ${new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)},
        ${now}, 'claimed', ${context.tenantId}::uuid, ${now}
      )
    `;
    await adminClient!`
      INSERT INTO builder.drafts (
        id, session_id, revision, schema_version, product_family, plan_key,
        state_json, status, expires_at
      ) VALUES (
        ${builderDraftId}::uuid, ${builderSessionId}::uuid, 1, 1, 'flow', 'flowbot_basic',
        ${adminClient!.json(publishedState)}, 'claimed', ${new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)}
      )
    `;
    await adminClient!`
      INSERT INTO tenancy.builder_draft_claims (
        tenant_id, claimed_by_user_id, claimed_by_membership_id, source_session_id,
        source_draft_id, source_revision, schema_version, product_family, plan_key,
        state_json, claimed_at
      ) VALUES (
        ${context.tenantId}::uuid, ${context.userId}::uuid, ${context.membershipId}::uuid,
        ${builderSessionId}::uuid, ${builderDraftId}::uuid, 1, 1, 'flow', 'flowbot_basic',
        ${adminClient!.json(publishedState)}, ${now}
      )
    `;
    const commerce = new TenantCommerceStore(tenantClient!);
    const subscriptionId = randomUUID();
    expect(await commerce.createPendingSubscription(context, {
      planKey: "flowbot_basic", subscriptionId,
      snapshotId: randomUUID(), quotaAccountId: randomUUID(), now,
    })).toMatchObject({ status: "created", subscriptionId });
    const purchase = await new PurchaseIntentStore(tenantClient!).createPurchaseIntent({
      planKey: "flowbot_basic", tenantId: context.tenantId, commerceIntent: "trial", now,
    }, context);
    if (purchase.status !== "created") throw new Error("expected trial purchase intent");

    const store = new TrialStore(tenantClient!);
    const idempotencyKey = `flow-trial-${randomUUID()}`;
    const activated = await store.activateFlowStarter(context, {
      purchaseIntentId: purchase.intentId, trialGrantId: randomUUID(),
      entitlementSnapshotId: randomUUID(), idempotencyKey, now,
    });
    expect(activated).toMatchObject({ status: "activated", replayed: false, startsAt: now });
    if (activated.status !== "activated") throw new Error("expected activated trial");
    expect(activated.expiresAt.toISOString()).toBe("2026-09-16T12:00:00.000Z");
    await expect(store.activateFlowStarter(context, {
      purchaseIntentId: purchase.intentId, trialGrantId: randomUUID(),
      entitlementSnapshotId: randomUUID(), idempotencyKey, now,
    })).resolves.toMatchObject({ status: "activated", trialGrantId: activated.trialGrantId, replayed: true });

    const evidence = await adminClient!<{
      grant_count: number; status: string; period_start: Date; period_end: Date;
      included_quantity: string; safety_cap_quantity: string; purchase_status: string;
      channel_scope: string[]; allowance_unit: string; allowance_quantity: number;
      access_mode: string; resolved_json: Record<string, unknown>;
    }[]>`
      SELECT
        (SELECT count(*)::int FROM billing.trial_grants WHERE subscription_id = ${subscriptionId}::uuid) AS grant_count,
        subscription.status, subscription.period_start, subscription.period_end,
        quota.included_quantity, quota.safety_cap_quantity, intent.status AS purchase_status,
        trial_grant.channel_scope, trial_grant.allowance_unit, trial_grant.allowance_quantity,
        snapshot.access_mode, snapshot.resolved_json
      FROM tenancy.product_subscriptions subscription
      JOIN tenancy.quota_accounts quota ON quota.subscription_id = subscription.id
      JOIN billing.trial_grants trial_grant ON trial_grant.subscription_id = subscription.id
      JOIN billing.purchase_intents intent ON intent.id = trial_grant.purchase_intent_id
      JOIN LATERAL (
        SELECT access_mode, resolved_json FROM tenancy.entitlement_snapshots candidate
        WHERE candidate.subscription_id = subscription.id
        ORDER BY candidate.created_at DESC, candidate.id DESC LIMIT 1
      ) snapshot ON true
      WHERE subscription.id = ${subscriptionId}::uuid
    `;
    expect(evidence[0]).toMatchObject({
      grant_count: 1, status: "trialing", included_quantity: "5000.000000",
      safety_cap_quantity: "5000.000000", purchase_status: "trial_activated",
      channel_scope: ["website"], allowance_unit: "flow_conversation_started",
      allowance_quantity: 5000, access_mode: "active",
    });
    expect(evidence[0]!.period_start.toISOString()).toBe(now.toISOString());
    expect(evidence[0]!.period_end.toISOString()).toBe("2026-09-16T12:00:00.000Z");
    expect(evidence[0]!.resolved_json).toMatchObject({
      accessMode: "active", allowances: { flow_execution: 5000 },
      overageRatesMinor: { flow_execution: null },
      entitlements: { "channel.web": true, "channel.social": false, "flow.nodes.advanced": false },
      trial: { channelScope: ["website"] },
    });

    await expect(new TrialLifecycleWorkerStore(workerClient!).reconcileExpired(
      new Date("2026-09-17T12:00:00Z"),
    )).resolves.toBeGreaterThanOrEqual(1);
    const expired = await adminClient!<{ grant_status: string; subscription_status: string; alerts: number }[]>`
      SELECT trial_grant.status AS grant_status, subscription.status AS subscription_status,
        (SELECT count(*)::int FROM tenancy.usage_alert_deliveries alert
          WHERE alert.tenant_id = ${context.tenantId}::uuid AND alert.alert_key = 'trial_expired') AS alerts
      FROM billing.trial_grants trial_grant
      JOIN tenancy.product_subscriptions subscription ON subscription.id = trial_grant.subscription_id
      WHERE trial_grant.id = ${activated.trialGrantId}::uuid
    `;
    expect(expired[0]).toEqual({ grant_status: "expired", subscription_status: "cancelled", alerts: 1 });
    const secondSubscriptionId = randomUUID();
    expect(await commerce.createPendingSubscription(context, {
      planKey: "flowbot_basic", subscriptionId: secondSubscriptionId,
      snapshotId: randomUUID(), quotaAccountId: randomUUID(), now: new Date("2026-09-18T12:00:00Z"),
    })).toMatchObject({ status: "created" });
    const secondPurchase = await new PurchaseIntentStore(tenantClient!).createPurchaseIntent({
      planKey: "flowbot_basic", tenantId: context.tenantId, commerceIntent: "trial",
      now: new Date("2026-09-18T12:00:00Z"),
    }, context);
    if (secondPurchase.status !== "created") throw new Error("expected second pending intent");
    await expect(store.activateFlowStarter(context, {
      purchaseIntentId: secondPurchase.intentId, trialGrantId: randomUUID(),
      entitlementSnapshotId: randomUUID(), idempotencyKey: `flow-trial-${randomUUID()}`,
      now: new Date("2026-09-18T12:00:00Z"),
    })).resolves.toEqual({ status: "already_used" });
  });
});

describe.runIf(enabled)("AI Text Starter trial activation", () => {
  it("starts only after provider evidence and enforces the 500-reply website-only grant", async () => {
    const now = new Date("2026-08-17T00:00:00Z");
    const context = createTenantContext({ tenantId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10",
      userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1", membershipId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb11",
      sessionId: randomUUID(), role: "tenant_master_admin", requestId: "text-trial-activate" });
    await adminClient!`UPDATE tenancy.tenant_onboarding SET merchant_onboarding_version = 1,
      guidelines_version = 'merchant-v1', guidelines_accepted_at = ${now}, preferences_completed_at = ${now},
      business_goal = 'answer_questions', industry = 'services', first_product = 'ai_chat', launch_channel = 'website'
      WHERE tenant_id = ${context.tenantId}::uuid`;
    const builderSessionId = randomUUID(); const builderDraftId = randomUUID();
    const publishedState = { schemaVersion: 1, locale: "en",
      access: { product: "text", plan: "ai_chat_basic", intent: "trial" },
      configuration: { textUi: { configured: true, version: 1 }, textPublishedDraft: { business: { name: "Tenant B" } } } };
    await adminClient!`INSERT INTO builder.anonymous_sessions (id, issued_at, expires_at, last_seen_at, status,
      claimed_tenant_id, claimed_at) VALUES (${builderSessionId}::uuid, ${now},
      ${new Date(now.getTime() + 30 * 86400000)}, ${now}, 'claimed', ${context.tenantId}::uuid, ${now})`;
    await adminClient!`INSERT INTO builder.drafts (id, session_id, revision, schema_version, product_family,
      plan_key, state_json, status, expires_at) VALUES (${builderDraftId}::uuid, ${builderSessionId}::uuid,
      1, 1, 'text', 'ai_chat_basic', ${adminClient!.json(publishedState)}, 'claimed',
      ${new Date(now.getTime() + 30 * 86400000)})`;
    await adminClient!`INSERT INTO tenancy.builder_draft_claims (tenant_id, claimed_by_user_id,
      claimed_by_membership_id, source_session_id, source_draft_id, source_revision, schema_version,
      product_family, plan_key, state_json, claimed_at) VALUES (${context.tenantId}::uuid,
      ${context.userId}::uuid, ${context.membershipId}::uuid, ${builderSessionId}::uuid,
      ${builderDraftId}::uuid, 1, 1, 'text', 'ai_chat_basic', ${adminClient!.json(publishedState)}, ${now})`;
    const subscriptionId = randomUUID();
    const commerce = new TenantCommerceStore(tenantClient!);
    await commerce.createPendingSubscription(context, { planKey: "ai_chat_basic",
      subscriptionId, snapshotId: randomUUID(), quotaAccountId: randomUUID(), now });
    const purchase = await new PurchaseIntentStore(tenantClient!).createPurchaseIntent({ planKey: "ai_chat_basic",
      tenantId: context.tenantId, commerceIntent: "trial", now }, context);
    if (purchase.status !== "created") throw new Error("expected Text trial purchase intent");
    const store = new TrialStore(tenantClient!); const setupId = randomUUID();
    const prepared = await store.prepareTextStarterCardSetup(context, { purchaseIntentId: purchase.intentId,
      setupId, idempotencyKey: `text-setup-${randomUUID()}`, now });
    expect(prepared).toMatchObject({ status: "prepared", replayed: false, setup: { status: "requested" } });
    expect(await store.getTextStarterCardSetup(context, purchase.intentId)).toBeNull();
    await store.completeTextStarterCardSetup(context, { setupId, externalCustomerRef: "cus_trial_test",
      externalSetupIntentRef: "seti_trial_test", now });
    expect(await store.getTextStarterCardSetup(context, purchase.intentId)).toMatchObject({ id: setupId,
      external_customer_ref: "cus_trial_test", external_setup_intent_ref: "seti_trial_test" });
    const fingerprintHash = Buffer.alloc(32, 7);
    const activated = await store.activateTextStarter(context, { purchaseIntentId: purchase.intentId, setupId,
      externalCustomerRef: "cus_trial_test", externalSetupIntentRef: "seti_trial_test",
      externalPaymentMethodRef: "pm_trial_test", fingerprintHash, trialGrantId: randomUUID(),
      entitlementSnapshotId: randomUUID(), idempotencyKey: `text-activate-${randomUUID()}`,
      notificationProfileId: randomUUID(), ownerRecipientCiphertext: "v1.test.test.test", now });
    expect(activated).toMatchObject({ status: "activated", replayed: false, startsAt: now });
    if (activated.status !== "activated") throw new Error("expected activated Text trial");
    const evidence = await adminClient!<{ status: string; included_quantity: string; safety_cap_quantity: string;
      allowance_unit: string; allowance_quantity: number; channel_scope: string[]; fingerprint_hash: Buffer;
      setup_status: string; external_payment_method_ref: string; quota_account_id: string;
      entitlement_snapshot_id: string }[]>`
      SELECT subscription.status, quota.included_quantity, quota.safety_cap_quantity, trial_grant.allowance_unit,
        trial_grant.allowance_quantity, trial_grant.channel_scope, setup.fingerprint_hash, setup.status AS setup_status,
        setup.external_payment_method_ref, quota.id AS quota_account_id,
        snapshot.id AS entitlement_snapshot_id
      FROM tenancy.product_subscriptions subscription
      JOIN tenancy.quota_accounts quota ON quota.subscription_id = subscription.id
      JOIN billing.trial_grants trial_grant ON trial_grant.subscription_id = subscription.id
      JOIN billing.text_trial_card_setups setup ON setup.purchase_intent_id = trial_grant.purchase_intent_id
      JOIN LATERAL (
        SELECT candidate.id FROM tenancy.entitlement_snapshots candidate
        WHERE candidate.subscription_id = subscription.id AND candidate.access_mode = 'active'
        ORDER BY candidate.created_at DESC, candidate.id DESC LIMIT 1
      ) snapshot ON true
      WHERE subscription.id = ${subscriptionId}::uuid`;
    expect(evidence[0]).toMatchObject({ status: "trialing", included_quantity: "500.000000",
      safety_cap_quantity: "500.000000", allowance_unit: "ai_customer_reply_committed",
      allowance_quantity: 500, channel_scope: ["website"], setup_status: "activated",
      external_payment_method_ref: "pm_trial_test" });
    expect(evidence[0]!.fingerprint_hash).toEqual(fingerprintHash);

    const quotaAccountId = evidence[0]!.quota_account_id;
    await adminClient!`UPDATE tenancy.quota_accounts SET settled_quantity = 400, updated_at = ${now}
      WHERE id = ${quotaAccountId}::uuid`;
    const warning = await adminClient!<{ alerts: number; emails: number; in_app: number; thresholds: number[] }[]>`
      SELECT
        (SELECT count(*)::int FROM tenancy.usage_alert_deliveries
          WHERE quota_account_id = ${quotaAccountId}::uuid AND alert_key = 'trial_100_remaining') AS alerts,
        (SELECT count(*)::int FROM tenancy.outbox
          WHERE tenant_id = ${context.tenantId}::uuid AND topic = 'usage.alert.email.requested') AS emails,
        (SELECT count(*)::int FROM tenancy.tenant_notifications
          WHERE tenant_id = ${context.tenantId}::uuid AND event_kind = 'usage.trial_100_remaining') AS in_app,
        (SELECT thresholds FROM tenancy.usage_alert_preferences
          WHERE quota_account_id = ${quotaAccountId}::uuid) AS thresholds
    `;
    expect(warning[0]).toEqual({ alerts: 1, emails: 1, in_app: 1, thresholds: [80] });
    await adminClient!`UPDATE tenancy.quota_accounts SET settled_quantity = 499, updated_at = ${now}
      WHERE id = ${quotaAccountId}::uuid`;
    const finalReservation = await commerce.reserve(context, {
      tenantId: context.tenantId, subscriptionId,
      entitlementSnapshotId: evidence[0]!.entitlement_snapshot_id,
      productKey: "ai_chat", unit: "ai_response", operationId: `text-trial-final-${randomUUID()}`,
      idempotencyKey: `text-trial-final-${randomUUID()}`, requestedQuantity: 1,
    });
    expect(finalReservation).toMatchObject({ status: "reserved", reservedQuantity: 1 });
    if (!("reservationId" in finalReservation)) throw new Error("expected final Text trial reservation");
    const terminal = await adminClient!<{ grant_status: string; subscription_status: string; alerts: number }[]>`
      SELECT trial_grant.status AS grant_status, subscription.status AS subscription_status,
        (SELECT count(*)::int FROM tenancy.usage_alert_deliveries
          WHERE quota_account_id = ${quotaAccountId}::uuid AND alert_key = 'trial_exhausted') AS alerts
      FROM billing.trial_grants trial_grant
      JOIN tenancy.product_subscriptions subscription ON subscription.id = trial_grant.subscription_id
      WHERE trial_grant.id = ${activated.trialGrantId}::uuid
    `;
    expect(terminal[0]).toEqual({ grant_status: "exhausted", subscription_status: "cancelled", alerts: 1 });
    await expect(commerce.settle(context, { reservationId: finalReservation.reservationId,
      actualQuantity: 1, idempotencyKey: `text-trial-settle-${randomUUID()}`, now }))
      .resolves.toMatchObject({ status: "settled" });
    await expect(commerce.reserve(context, {
      tenantId: context.tenantId, subscriptionId,
      entitlementSnapshotId: evidence[0]!.entitlement_snapshot_id,
      productKey: "ai_chat", unit: "ai_response", operationId: `text-trial-over-${randomUUID()}`,
      idempotencyKey: `text-trial-over-${randomUUID()}`, requestedQuantity: 1,
    })).resolves.toMatchObject({ status: "rejected" });

    const later = new Date("2026-08-18T00:00:00Z");
    await adminClient!`UPDATE tenancy.product_subscriptions SET status = 'cancelled', cancelled_at = ${later}
      WHERE id = ${subscriptionId}::uuid`;
    const secondSubscriptionId = randomUUID();
    await new TenantCommerceStore(tenantClient!).createPendingSubscription(context, { planKey: "ai_chat_basic",
      subscriptionId: secondSubscriptionId, snapshotId: randomUUID(), quotaAccountId: randomUUID(), now: later });
    const secondPurchase = await new PurchaseIntentStore(tenantClient!).createPurchaseIntent({ planKey: "ai_chat_basic",
      tenantId: context.tenantId, commerceIntent: "trial", now: later }, context);
    if (secondPurchase.status !== "created") throw new Error("expected repeated Text trial intent");
    const secondSetupId = randomUUID();
    await store.prepareTextStarterCardSetup(context, { purchaseIntentId: secondPurchase.intentId,
      setupId: secondSetupId, idempotencyKey: `text-setup-${randomUUID()}`, now: later });
    await store.completeTextStarterCardSetup(context, { setupId: secondSetupId,
      externalCustomerRef: "cus_trial_repeat", externalSetupIntentRef: "seti_trial_repeat", now: later });
    await expect(store.activateTextStarter(context, { purchaseIntentId: secondPurchase.intentId,
      setupId: secondSetupId, externalCustomerRef: "cus_trial_repeat",
      externalSetupIntentRef: "seti_trial_repeat", externalPaymentMethodRef: "pm_trial_repeat",
      fingerprintHash, trialGrantId: randomUUID(), entitlementSnapshotId: randomUUID(),
      idempotencyKey: `text-activate-${randomUUID()}`, notificationProfileId: randomUUID(),
      ownerRecipientCiphertext: "v1.test.test.test", now: later })).resolves.toEqual({ status: "already_used" });
  });
});
