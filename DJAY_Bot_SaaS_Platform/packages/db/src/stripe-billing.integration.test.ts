import { createHash, randomUUID } from "node:crypto";
import { openJson } from "@djay/auth";
import { createPlatformContext, createTenantContext } from "@djay/tenancy";
import type { VerifiedWebhook } from "@djay/usage-billing";
import { afterAll, describe, expect, it } from "vitest";
import { BillingNotificationWorkerStore, TenantBillingNotificationStore } from "./billing-notification-store";
import { AccountingReconciliationWorkerStore, AccountingSyncWorkerStore, BillingWebhookRecoveryWorkerStore, BillingWebhookStore, FinancialEventReconciliationWorkerStore, FinancialReconciliationWorkerStore, SubscriptionLifecycleWorkerStore } from "./billing-webhook-store";
import { createDatabaseClient } from "./client";
import { PlatformCommerceStore, TenantCommerceStore } from "./commerce-store";

const tenantUrl = process.env.TENANT_DATABASE_URL;
const workerUrl = process.env.WORKER_DATABASE_URL;
const platformUrl = process.env.PLATFORM_DATABASE_URL;
const adminUrl = process.env.ADMIN_DATABASE_URL;
const enabled = Boolean(tenantUrl && workerUrl && platformUrl && adminUrl);
const tenantClient = enabled ? createDatabaseClient(tenantUrl!) : null;
const workerClient = enabled ? createDatabaseClient(workerUrl!) : null;
const platformClient = enabled ? createDatabaseClient(platformUrl!) : null;
const adminClient = enabled ? createDatabaseClient(adminUrl!) : null;

afterAll(async () => {
  await tenantClient?.end(); await workerClient?.end();
  await platformClient?.end(); await adminClient?.end();
});

describe.runIf(enabled)("BILL-01 Stripe billing lifecycle", () => {
  it("binds checkout to the contract and records immutable invoice and credit evidence", async () => {
    const tenantId = randomUUID();
    const userId = randomUUID();
    const membershipId = randomUUID();
    const catalogVersionId = randomUUID();
    const planVersionId = randomUUID();
    const mappingId = randomUUID();
    const subscriptionId = randomUUID();
    const initialSnapshotId = randomUUID();
    const contractId = randomUUID();
    const checkoutIntentId = randomUUID();
    const platformUserId = randomUUID();
    const reviewerPlatformUserId = randomUUID();
    const now = new Date("2026-07-18T14:00:00Z");

    await adminClient!.begin(async (sql) => {
      await sql`INSERT INTO identity.users (id, display_name, status)
        VALUES (${userId}::uuid, 'Billing Tenant Owner', 'active')`;
      await sql`INSERT INTO tenancy.tenants (id, slug, business_name)
        VALUES (${tenantId}::uuid, ${`billing-${tenantId.slice(0, 8)}`}, 'Billing Lifecycle Test')`;
      await sql`INSERT INTO tenancy.memberships (id, tenant_id, user_id, role, status, accepted_at)
        VALUES (${membershipId}::uuid, ${tenantId}::uuid, ${userId}::uuid,
          'tenant_master_admin', 'active', ${now})`;
      await sql`INSERT INTO platform.users (id, email_normalized, display_name, password_hash, status)
        VALUES
          (${platformUserId}::uuid, ${`billing-${platformUserId}@example.test`}, 'Billing Verifier', 'unused', 'active'),
          (${reviewerPlatformUserId}::uuid, ${`billing-${reviewerPlatformUserId}@example.test`}, 'Billing Reviewer', 'unused', 'active')`;
      await sql`INSERT INTO catalog.catalog_versions (
        id, version_key, status, currency, content_sha256, effective_from, created_by_platform_user_id
      ) VALUES (${catalogVersionId}::uuid, ${`billing-test-${catalogVersionId}`}, 'draft', 'THB',
        digest('billing-test-catalog', 'sha256'), ${now}, ${platformUserId}::uuid)`;
      await sql`INSERT INTO catalog.promotions (
        catalog_version_id, promotion_key, public_name, eligibility,
        application_method, term_count, effective_from
      ) VALUES (${catalogVersionId}::uuid, 'billing-test-launch', 'Billing Test Launch',
        'new_annual_subscription', 'server_side', 1, ${now})`;
      await sql`INSERT INTO catalog.plan_versions (
        id, plan_id, version, status, currency, recurring_amount_minor, billing_interval,
        sellable, trial_policy, entitlements, allowances, overage_rates_minor, limits,
        public_copy, effective_from, published_at, created_by_platform_user_id
      ) SELECT ${planVersionId}::uuid, plan.id, 99, 'published', 'THB', 249900, 'year', true,
        '{}'::jsonb, version.entitlements, version.allowances, version.overage_rates_minor,
        version.limits, version.public_copy, ${now}, ${now}, ${platformUserId}::uuid
        FROM catalog.plans plan JOIN catalog.plan_versions version ON version.plan_id = plan.id
        WHERE plan.plan_key = 'flowbot_basic' ORDER BY version.version DESC LIMIT 1`;
      await sql`INSERT INTO catalog.plan_commercial_terms (
        catalog_version_id, plan_version_id, promotion_key, first_term_amount_minor,
        renewal_amount_minor, first_term_discount_minor, billing_interval,
        billing_interval_count, allowance_period_timezone, allowance_period_interval,
        allowance_rollover, sellable
      ) VALUES (${catalogVersionId}::uuid, ${planVersionId}::uuid, 'billing-test-launch',
        249900, 499900, 250000, 'year', 1, 'Asia/Bangkok', 'month', false, true)`;
      await sql`INSERT INTO catalog.provider_price_mappings (
        id, catalog_version_id, item_kind, item_key, provider_key, provider_mode,
        external_product_ref, external_price_ref, verified_amount_minor, verified_currency,
        status, verified_at, verified_by_platform_user_id
      ) VALUES (${mappingId}::uuid, ${catalogVersionId}::uuid, 'plan', 'flowbot_basic',
        'stripe', 'test', 'prod_billingtest', 'price_billingtest', 249900, 'THB',
        'ready', ${now}, ${platformUserId}::uuid)`;
      await sql`INSERT INTO tenancy.product_subscriptions (
        id, tenant_id, product_key, plan_version_id, status
      ) VALUES (${subscriptionId}::uuid, ${tenantId}::uuid, 'flowbot', ${planVersionId}::uuid, 'pending')`;
      const resolved = { subscriptionStatus: "pending", accessMode: "none" };
      await sql`INSERT INTO tenancy.entitlement_snapshots (
        id, tenant_id, subscription_id, product_key, plan_version_id,
        subscription_status, access_mode, resolved_json, resolution_hash, created_at
      ) VALUES (${initialSnapshotId}::uuid, ${tenantId}::uuid, ${subscriptionId}::uuid,
        'flowbot', ${planVersionId}::uuid, 'pending', 'none', ${sql.json(resolved)},
        digest(${JSON.stringify(resolved)}, 'sha256'), ${now})`;
      await sql`INSERT INTO tenancy.subscription_contract_snapshots (
        id, tenant_id, subscription_id, catalog_version_id, plan_version_id,
        contract_json, contract_sha256, accepted_by_user_id, accepted_at
      ) VALUES (${contractId}::uuid, ${tenantId}::uuid, ${subscriptionId}::uuid,
        ${catalogVersionId}::uuid, ${planVersionId}::uuid, '{"schemaVersion":1}'::jsonb,
        digest('{"schemaVersion":1}', 'sha256'), ${userId}::uuid, ${now})`;
    });

    const context = createTenantContext({ tenantId, userId, membershipId, sessionId: randomUUID(),
      role: "tenant_master_admin", requestId: "stripe-billing-checkout" });
    const commerce = new TenantCommerceStore(tenantClient!);
    const billingNotificationKey = Buffer.alloc(32, 31);
    const billingNotifications = new TenantBillingNotificationStore(tenantClient!);
    await expect(billingNotifications.configure(context, {
      emailEnabled: true, recipientEmail: "billing-owner@example.test", locale: "en",
      eventKeys: ["subscription.active", "subscription.past_due", "subscription.grace_period",
        "subscription.restricted", "subscription.cancelled", "cancellation.scheduled",
        "cancellation.revoked", "payment.succeeded", "refund.updated", "credit_note.issued"],
      envelopeKey: billingNotificationKey, now,
    })).resolves.toEqual({ status: "updated" });
    const idempotencyKey = `checkout-${randomUUID()}`;
    const prepared = await commerce.prepareStripeCheckout(context, {
      checkoutIntentId, subscriptionId, contractSnapshotId: contractId,
      idempotencyKey, providerMode: "test", now,
    });
    expect(prepared).toMatchObject({ status: "prepared", checkoutIntentId,
      planKey: "flowbot_basic", externalPriceRef: "price_billingtest",
      firstTermAmountMinor: 249900, replayed: false });
    await expect(commerce.prepareStripeCheckout(context, {
      checkoutIntentId: randomUUID(), subscriptionId, contractSnapshotId: contractId,
      idempotencyKey, providerMode: "test", now,
    })).resolves.toMatchObject({ status: "prepared", checkoutIntentId, replayed: true });
    await expect(commerce.completeStripeCheckout(context, {
      checkoutIntentId, idempotencyKey, externalSessionRef: "cs_test_billing123",
      externalCustomerRef: null, externalSubscriptionRef: null,
      checkoutUrl: "https://checkout.stripe.com/c/pay/billing123",
      expiresAt: new Date(now.getTime() + 30 * 60_000), failureCode: null,
      envelopeKey: Buffer.alloc(32, 7), now,
    })).resolves.toEqual({ status: "ready" });

    const worker = new BillingWebhookStore(workerClient!);
    const submit = async (eventType: string, occurredAt: Date, object: Record<string, unknown>) => {
      const event: VerifiedWebhook = { externalEventId: `evt_${randomUUID().replaceAll("-", "")}`,
        eventType, occurredAt, payload: object };
      const raw = JSON.stringify({ data: { object } });
      await worker.inbox({ providerKey: "stripe", event,
        payloadHash: createHash("sha256").update(raw).digest(), payloadCiphertext: "test-envelope" });
      const claimed = await worker.claim(occurredAt);
      expect(claimed?.eventType).toBe(eventType);
      return worker.apply(claimed!.webhookEventId, object, occurredAt);
    };

    const contractSha256 = prepared.status === "prepared" ? prepared.contractSha256 : "";
    await expect(submit("checkout.session.completed", new Date(now.getTime() + 1_000), {
      id: "cs_test_billing123", mode: "subscription", payment_status: "paid",
      customer: "cus_billing123", subscription: "sub_billing123",
      metadata: { checkout_intent_id: checkoutIntentId, contract_sha256: contractSha256 },
    })).resolves.toEqual({ status: "applied" });
    await expect(submit("invoice.paid", new Date(now.getTime() + 2_000), {
      id: "in_billing123", customer: "cus_billing123", subscription: "sub_billing123",
      payment_intent: "pi_billing123",
      status: "paid", currency: "thb", subtotal: 249900, total: 249900,
      amount_paid: 249900, amount_remaining: 0, created: 1_800_000_000,
      period_start: 1_800_000_000, period_end: 1_831_536_000,
    })).resolves.toEqual({ status: "applied" });
    const notificationWorker = new BillingNotificationWorkerStore(workerClient!);
    const notificationClaimedAt = new Date();
    const claimedNotification = await notificationWorker.claim(
      notificationClaimedAt, new Date(notificationClaimedAt.getTime() - 300_000),
    );
    expect(claimedNotification).toMatchObject({ deliveryAllowed: true, attemptCount: 1 });
    expect(openJson<{ email: string }>(claimedNotification!.recipientCiphertext!, billingNotificationKey))
      .toEqual({ email: "billing-owner@example.test" });
    await notificationWorker.finish(claimedNotification!.id, true, null, false);
    const providerPeriodStart = 1_800_000_000;
    const providerPeriodEnd = 1_831_536_000;
    await expect(submit("customer.subscription.updated", new Date(now.getTime() + 2_500), {
      id: "sub_billing123", status: "active", current_period_start: providerPeriodStart,
      current_period_end: providerPeriodEnd, cancel_at_period_end: false, cancel_at: null,
    })).resolves.toEqual({ status: "replayed_state" });

    const scheduleKey = `cancel-${randomUUID()}`;
    const cancellation = await commerce.prepareSubscriptionCancellation(context, {
      requestId: randomUUID(), subscriptionId, action: "schedule", idempotencyKey: scheduleKey, now,
    });
    expect(cancellation).toMatchObject({ status: "prepared", action: "schedule",
      externalSubscriptionRef: "sub_billing123", replayed: false });
    if (cancellation.status !== "prepared") throw new Error("Expected prepared cancellation.");
    const effectiveAt = new Date(providerPeriodEnd * 1000);
    await expect(commerce.completeSubscriptionCancellation(context, {
      cancellationRequestId: cancellation.cancellationRequestId, idempotencyKey: scheduleKey,
      cancelAtPeriodEnd: true, effectiveAt, failureCode: null, now,
    })).resolves.toEqual({ status: "scheduled" });
    await expect(commerce.listSubscriptions(context)).resolves.toEqual([
      expect.objectContaining({ id: subscriptionId, status: "active", cancelAt: effectiveAt,
        cancellationStatus: "scheduled" }),
    ]);

    const revokeKey = `retain-${randomUUID()}`;
    const revocation = await commerce.prepareSubscriptionCancellation(context, {
      requestId: randomUUID(), subscriptionId, action: "revoke", idempotencyKey: revokeKey, now,
    });
    if (revocation.status !== "prepared") throw new Error("Expected prepared cancellation revocation.");
    await expect(commerce.completeSubscriptionCancellation(context, {
      cancellationRequestId: revocation.cancellationRequestId, idempotencyKey: revokeKey,
      cancelAtPeriodEnd: false, effectiveAt: null, failureCode: null, now,
    })).resolves.toEqual({ status: "revoked" });

    const finalScheduleKey = `cancel-final-${randomUUID()}`;
    const finalCancellation = await commerce.prepareSubscriptionCancellation(context, {
      requestId: randomUUID(), subscriptionId, action: "schedule",
      idempotencyKey: finalScheduleKey, now,
    });
    if (finalCancellation.status !== "prepared") throw new Error("Expected final prepared cancellation.");
    await commerce.completeSubscriptionCancellation(context, {
      cancellationRequestId: finalCancellation.cancellationRequestId,
      idempotencyKey: finalScheduleKey, cancelAtPeriodEnd: true,
      effectiveAt, failureCode: null, now,
    });
    await expect(submit("refund.created", new Date(now.getTime() + 3_500), {
      id: "re_billing123", customer: "cus_billing123", payment_intent: "pi_billing123",
      status: "succeeded", reason: "requested_by_customer", currency: "thb", amount: 10000,
    })).resolves.toEqual({ status: "applied" });
    await expect(submit("credit_note.created", new Date(now.getTime() + 3_000), {
      id: "cn_billing123", invoice: "in_billing123", status: "issued", reason: "order_change",
      currency: "thb", subtotal: 10000, total: 10000, refund_amount: 10000,
      credit_amount: 0, created: 1_800_000_100,
    })).resolves.toEqual({ status: "applied" });

    const portalKey = `portal-${randomUUID()}`;
    const portal = await commerce.prepareStripePortal(context, {
      portalIntentId: randomUUID(), idempotencyKey: portalKey, now: new Date(now.getTime() + 4_000),
    });
    expect(portal).toMatchObject({ status: "prepared", externalCustomerRef: "cus_billing123", replayed: false });
    if (portal.status !== "prepared") throw new Error("Expected prepared portal intent.");
    await expect(commerce.completeStripePortal(context, {
      portalIntentId: portal.portalIntentId, idempotencyKey: portalKey,
      portalUrl: "https://billing.stripe.com/p/session/billing123",
      expiresAt: new Date(now.getTime() + 30 * 60_000), failureCode: null,
      envelopeKey: Buffer.alloc(32, 8), now: new Date(now.getTime() + 4_000),
    })).resolves.toEqual({ status: "ready" });

    await expect(commerce.listFinancialDocuments(context)).resolves.toEqual([
      expect.objectContaining({ documentKind: "credit_note", documentNumber: "cn_billing123",
        status: "issued", currency: "THB", totalMinor: 10000 }),
      expect.objectContaining({ documentKind: "invoice", documentNumber: "in_billing123",
        status: "paid", currency: "THB", totalMinor: 249900,
        amountPaidMinor: 249900, amountRemainingMinor: 0 }),
    ]);
    const customerNoticeOverview = await billingNotifications.overview(context);
    expect(customerNoticeOverview.preference).toMatchObject({ emailEnabled: true, locale: "en" });
    expect(customerNoticeOverview.notifications.length).toBeGreaterThanOrEqual(6);
    const unreadNotice = customerNoticeOverview.notifications[0]!;
    await expect(billingNotifications.markRead(context, unreadNotice.id, now))
      .resolves.toEqual({ status: "read" });

    const reconciliationWorker = new FinancialReconciliationWorkerStore(workerClient!);
    const reconciliationRetrievedAt = new Date();
    const reconciliationJob = await reconciliationWorker.claim(reconciliationRetrievedAt);
    expect(reconciliationJob).toMatchObject({ externalInvoiceRef: "in_billing123", attemptCount: 1 });
    const providerEvidence = JSON.stringify({ id: "in_billing123", status: "paid", currency: "thb",
      total: 249901, amount_paid: 249900, amount_remaining: 1 });
    await expect(reconciliationWorker.record({
      jobId: reconciliationJob!.jobId, externalInvoiceRef: "in_billing123", status: "paid",
      currency: "thb", totalMinor: 249901, amountPaidMinor: 249900, amountRemainingMinor: 1,
      payloadHash: createHash("sha256").update(providerEvidence).digest(),
      payloadCiphertext: "test-financial-envelope", retrievedAt: reconciliationRetrievedAt,
    })).resolves.toEqual({ status: "amount_mismatch" });

    const platform = new PlatformCommerceStore(platformClient!);
    const requester = createPlatformContext({ platformUserId, sessionId: randomUUID(),
      role: "platform_finance", requestId: "financial-reconciliation-request", reauthenticatedAt: now });
    const reviewer = createPlatformContext({ platformUserId: reviewerPlatformUserId, sessionId: randomUUID(),
      role: "platform_owner", requestId: "financial-reconciliation-review", reauthenticatedAt: now });
    const overview = await platform.financialReconciliationOverview(requester);
    expect(overview).toMatchObject({ status: "attention", summary: { total: 1, matched: 0, attention: 1 } });
    expect(overview.results[0]).toMatchObject({ status: "amount_mismatch",
      externalInvoiceRef: "in_billing123", caseId: null });
    const remediation = await platform.requestFinancialReconciliationCase(requester, {
      resultId: overview.results[0]!.resultId, action: "investigate",
      reason: "Investigate immutable invoice amount mismatch", now,
    });
    await expect(platform.reviewFinancialReconciliationCase(requester, {
      caseId: remediation.caseId, approve: true, note: "Self review must fail", now,
    })).rejects.toThrow(/different_reviewer_required/);
    await expect(platform.reviewFinancialReconciliationCase(reviewer, {
      caseId: remediation.caseId, approve: true, note: "Independent finance review approved", now,
    })).resolves.toEqual({ status: "approved" });

    const financialEventWorker = new FinancialEventReconciliationWorkerStore(workerClient!);
    const eventClaims = [await financialEventWorker.claim(new Date()),
      await financialEventWorker.claim(new Date()), await financialEventWorker.claim(new Date())];
    expect(eventClaims.map((claim) => claim?.evidenceKind).sort()).toEqual(["credit_note", "payment", "refund"]);
    for (const claim of eventClaims) {
      const providerEvidence = claim!.evidenceKind === "payment"
        ? { externalRef: "pi_billing123", relatedRef: null, status: "succeeded", currency: "THB",
            totalMinor: 249900, refundMinor: null, creditMinor: null }
        : claim!.evidenceKind === "refund"
          ? { externalRef: "re_billing123", relatedRef: "pi_billing123", status: "succeeded", currency: "THB",
              totalMinor: 10000, refundMinor: null, creditMinor: null }
          : { externalRef: "cn_billing123", relatedRef: "in_billing123", status: "issued", currency: "THB",
              totalMinor: 10001, refundMinor: 10000, creditMinor: 0 };
      const raw = JSON.stringify(providerEvidence);
      await expect(financialEventWorker.record({ jobId: claim!.jobId, ...providerEvidence,
        payloadHash: createHash("sha256").update(raw).digest(),
        payloadCiphertext: "test-financial-event-envelope", retrievedAt: new Date(),
      })).resolves.toEqual({ status: claim!.evidenceKind === "credit_note" ? "amount_mismatch" : "matched" });
    }
    const eventOverview = await platform.financialEventReconciliationOverview(requester);
    expect(eventOverview).toMatchObject({ status: "attention", summary: { total: 3, matched: 2, attention: 1 } });
    const eventAttention = eventOverview.results.find((result) => result.status !== "matched")!;
    const eventRemediation = await platform.requestFinancialEventReconciliationCase(requester, {
      resultId: eventAttention.resultId, action: "investigate",
      reason: "Investigate Stripe credit-note amount mismatch", now,
    });
    await expect(platform.reviewFinancialEventReconciliationCase(requester, {
      caseId: eventRemediation.caseId, approve: true, note: "Self review must fail", now,
    })).rejects.toThrow(/different_reviewer_required/);
    await expect(platform.reviewFinancialEventReconciliationCase(reviewer, {
      caseId: eventRemediation.caseId, approve: true, note: "Independent event review approved", now,
    })).resolves.toEqual({ status: "approved" });

    const accountingWorker = new AccountingSyncWorkerStore(workerClient!);
    const accountingClaims = [await accountingWorker.claim(new Date()), await accountingWorker.claim(new Date())];
    expect(accountingClaims.map((claim) => claim?.documentKind).sort()).toEqual(["credit_note", "invoice"]);
    for (const claim of accountingClaims) {
      expect(claim?.idempotencyReference).toHaveLength(36);
      const request = JSON.stringify(claim!.canonicalDocument);
      const requestHash = createHash("sha256").update(request).digest();
      if (claim!.documentKind === "invoice") {
        await expect(accountingWorker.finish({
          jobId: claim!.jobId, outcome: "succeeded", requestHash,
          requestCiphertext: "test-accounting-request-envelope", responseHash: requestHash,
          responseCiphertext: "test-accounting-response-envelope", externalRecordRef: "fa-record-123",
          externalDocumentRef: "FA-TI-0001", safeErrorCode: null, occurredAt: new Date(),
        })).resolves.toEqual({ status: "synced" });
      } else {
        await expect(accountingWorker.finish({
          jobId: claim!.jobId, outcome: "rejected", requestHash,
          requestCiphertext: "test-accounting-request-envelope", responseHash: requestHash,
          responseCiphertext: "test-accounting-response-envelope", externalRecordRef: null,
          externalDocumentRef: null, safeErrorCode: "tax_mapping_unapproved", occurredAt: new Date(),
        })).resolves.toEqual({ status: "attention" });
      }
    }

    const accountingReconciliationWorker = new AccountingReconciliationWorkerStore(workerClient!);
    const accountingReconciliationJob = await accountingReconciliationWorker.claim(new Date());
    expect(accountingReconciliationJob).toMatchObject({
      externalRecordRef: "fa-record-123", externalDocumentRef: "FA-TI-0001", attemptCount: 1,
    });
    const remoteAccountingEvidence = JSON.stringify({ id: "fa-record-123", documentNo: "FA-TI-0001",
      externalDocumentId: accountingReconciliationJob!.idempotencyReference,
      currency: "THB", totalMinor: 249902, status: "approved" });
    await expect(accountingReconciliationWorker.record({
      jobId: accountingReconciliationJob!.jobId, found: true, externalRecordRef: "fa-record-123",
      externalDocumentRef: "FA-TI-0001",
      idempotencyReference: accountingReconciliationJob!.idempotencyReference,
      providerStatus: "approved", currency: "THB", totalMinor: 249902,
      payloadHash: createHash("sha256").update(remoteAccountingEvidence).digest(),
      payloadCiphertext: "test-accounting-reconciliation-envelope", retrievedAt: new Date(),
    })).resolves.toEqual({ status: "amount_mismatch" });
    const accountingOverview = await platform.accountingReconciliationOverview(requester);
    expect(accountingOverview).toMatchObject({ status: "attention",
      summary: { total: 1, matched: 0, attention: 1 } });
    const accountingRemediation = await platform.requestAccountingReconciliationCase(requester, {
      resultId: accountingOverview.results[0]!.resultId, action: "investigate",
      reason: "Investigate FlowAccount amount mismatch", now,
    });
    await expect(platform.reviewAccountingReconciliationCase(requester, {
      caseId: accountingRemediation.caseId, approve: true, note: "Self review must fail", now,
    })).rejects.toThrow(/different_reviewer_required/);
    await expect(platform.reviewAccountingReconciliationCase(reviewer, {
      caseId: accountingRemediation.caseId, approve: true,
      note: "Independent accounting review approved", now,
    })).resolves.toEqual({ status: "approved" });

    const dunningPolicy = await platform.requestSubscriptionDunningPolicy(requester, {
      gracePeriodHours: 0, restrictAfterHours: 0, customerNoticeOffsetsHours: [0],
      reason: "Integration policy validates independently approved dunning transitions", now,
    });
    await expect(platform.reviewSubscriptionDunningPolicy(requester, {
      policyId: dunningPolicy.policyId, approve: true, note: "Self review must fail", now,
    })).rejects.toThrow(/different_reviewer_required/);
    await expect(platform.reviewSubscriptionDunningPolicy(reviewer, {
      policyId: dunningPolicy.policyId, approve: true,
      note: "Independent dunning policy review approved", now,
    })).resolves.toEqual({ status: "active" });
    await expect(platform.listSubscriptionDunningPolicies(requester)).resolves.toEqual([
      expect.objectContaining({ id: dunningPolicy.policyId, status: "active",
        gracePeriodHours: 0, restrictAfterHours: 0 }),
    ]);

    const paymentFailedAt = new Date(now.getTime() + 8_000);
    await expect(submit("customer.subscription.updated", paymentFailedAt, {
      id: "sub_billing123", status: "past_due", current_period_start: providerPeriodStart,
      current_period_end: providerPeriodEnd, cancel_at_period_end: true, cancel_at: providerPeriodEnd,
    })).resolves.toEqual({ status: "applied" });
    const lifecycleWorker = new SubscriptionLifecycleWorkerStore(workerClient!);
    await expect(lifecycleWorker.applyNext(new Date(paymentFailedAt.getTime() + 1_000)))
      .resolves.toMatchObject({ subscriptionId, previousStatus: "past_due", nextStatus: "grace_period" });
    await expect(lifecycleWorker.applyNext(new Date(paymentFailedAt.getTime() + 2_000)))
      .resolves.toMatchObject({ subscriptionId, previousStatus: "grace_period", nextStatus: "restricted" });

    await expect(submit("customer.subscription.deleted", new Date(now.getTime() + 10_000), {
      id: "sub_billing123", status: "canceled", current_period_start: providerPeriodStart,
      current_period_end: providerPeriodEnd, cancel_at_period_end: true, cancel_at: providerPeriodEnd,
    })).resolves.toEqual({ status: "applied" });

    const recoveryOccurredAt = new Date(now.getTime() + 11_000);
    const recoveryExternalEventId = `evt_${randomUUID().replaceAll("-", "")}`;
    const recoveryObject = { id: "sub_uncorrelated123", status: "active",
      current_period_start: providerPeriodStart, current_period_end: providerPeriodEnd,
      cancel_at_period_end: false, cancel_at: null };
    const recoveryRaw = JSON.stringify({ data: { object: recoveryObject } });
    await worker.inbox({ providerKey: "stripe", event: {
      externalEventId: recoveryExternalEventId, eventType: "customer.subscription.updated",
      occurredAt: recoveryOccurredAt, payload: recoveryObject,
    }, payloadHash: createHash("sha256").update(recoveryRaw).digest(), payloadCiphertext: "test-envelope" });
    const recoveryWebhook = await worker.claim(recoveryOccurredAt);
    await expect(worker.apply(recoveryWebhook!.webhookEventId, recoveryObject, recoveryOccurredAt))
      .resolves.toEqual({ status: "authority_not_found" });
    const recoveryWorker = new BillingWebhookRecoveryWorkerStore(workerClient!);
    const recoveryJob = await recoveryWorker.claim(recoveryOccurredAt);
    expect(recoveryJob).toMatchObject({ externalEventId: recoveryExternalEventId,
      eventType: "customer.subscription.updated", reasonCode: "authority_not_found" });
    const providerRecoveryRaw = JSON.stringify({ id: recoveryExternalEventId,
      type: "customer.subscription.updated", created: recoveryOccurredAt.getTime() / 1000,
      data: { object: recoveryObject } });
    await expect(recoveryWorker.record({ jobId: recoveryJob!.jobId,
      externalEventId: recoveryExternalEventId, eventType: "customer.subscription.updated",
      occurredAt: recoveryOccurredAt,
      payloadHash: createHash("sha256").update(providerRecoveryRaw).digest(),
      payloadCiphertext: "provider-event-envelope", retrievedAt: recoveryOccurredAt,
    })).resolves.toEqual({ status: "provider_confirmed" });
    const recoveryOverview = await platform.webhookRecoveryOverview(requester);
    expect(recoveryOverview).toEqual([expect.objectContaining({ jobId: recoveryJob!.jobId,
      status: "attention", providerEvidenceCount: 1, caseId: null })]);
    const recoveryCase = await platform.requestWebhookRecoveryCase(requester, {
      jobId: recoveryJob!.jobId, action: "retry_application",
      reason: "Retry after the missing subscription correlation is independently corrected", now,
    });
    await expect(platform.reviewWebhookRecoveryCase(requester, {
      caseId: recoveryCase.caseId, approve: true, note: "Self review must fail", now,
    })).rejects.toThrow(/different_reviewer_required/);
    await expect(platform.reviewWebhookRecoveryCase(reviewer, {
      caseId: recoveryCase.caseId, approve: true,
      note: "Independent recovery review approved one ordered replay", now,
    })).resolves.toEqual({ status: "approved" });

    const evidence = await adminClient!<{ status: string; invoices: number; credits: number; payments: number;
      snapshots: number; portals: number; providerSnapshots: number; reconciliationResults: number;
      caseEvents: number; accountingAttempts: number; accountingReferences: number; accountingAttention: number;
      accountingReconciliationResults: number; accountingCaseEvents: number;
      financialEventResults: number; financialEventCaseEvents: number;
      cancellationRequests: number; cancellationEvents: number;
      webhookRecoveryJobs: number; webhookRecoverySnapshots: number; webhookRecoveryCaseEvents: number;
      customerNotifications: number; notificationDeliveryAttempts: number }[]>`
      SELECT (SELECT status FROM tenancy.product_subscriptions WHERE id = ${subscriptionId}::uuid) AS status,
        (SELECT count(*)::int FROM billing.invoice_documents WHERE subscription_id = ${subscriptionId}::uuid) AS invoices,
        (SELECT count(*)::int FROM billing.credit_note_documents WHERE subscription_id = ${subscriptionId}::uuid) AS credits,
        (SELECT count(*)::int FROM billing.payment_events WHERE subscription_id = ${subscriptionId}::uuid) AS payments,
        (SELECT count(*)::int FROM tenancy.entitlement_snapshots WHERE subscription_id = ${subscriptionId}::uuid) AS snapshots,
        (SELECT count(*)::int FROM billing.portal_intents WHERE tenant_id = ${tenantId}::uuid AND status = 'ready') AS portals,
        (SELECT count(*)::int FROM billing.provider_financial_snapshots WHERE tenant_id = ${tenantId}::uuid) AS "providerSnapshots",
        (SELECT count(*)::int FROM billing.financial_reconciliation_results WHERE tenant_id = ${tenantId}::uuid) AS "reconciliationResults",
        (SELECT count(*)::int FROM platform.financial_reconciliation_case_events WHERE tenant_id = ${tenantId}::uuid) AS "caseEvents",
        (SELECT count(*)::int FROM billing.accounting_sync_attempts WHERE tenant_id = ${tenantId}::uuid) AS "accountingAttempts",
        (SELECT count(*)::int FROM billing.accounting_external_references WHERE tenant_id = ${tenantId}::uuid) AS "accountingReferences",
        (SELECT count(*)::int FROM billing.accounting_sync_jobs WHERE tenant_id = ${tenantId}::uuid AND status = 'attention') AS "accountingAttention",
        (SELECT count(*)::int FROM billing.accounting_reconciliation_results WHERE tenant_id = ${tenantId}::uuid) AS "accountingReconciliationResults",
        (SELECT count(*)::int FROM platform.accounting_reconciliation_case_events WHERE tenant_id = ${tenantId}::uuid) AS "accountingCaseEvents"
        ,(SELECT count(*)::int FROM billing.financial_event_reconciliation_results WHERE tenant_id = ${tenantId}::uuid) AS "financialEventResults"
        ,(SELECT count(*)::int FROM platform.financial_event_reconciliation_case_events WHERE tenant_id = ${tenantId}::uuid) AS "financialEventCaseEvents"
        ,(SELECT count(*)::int FROM billing.subscription_cancellation_requests WHERE tenant_id = ${tenantId}::uuid) AS "cancellationRequests"
        ,(SELECT count(*)::int FROM billing.subscription_cancellation_events WHERE tenant_id = ${tenantId}::uuid) AS "cancellationEvents"
        ,(SELECT count(*)::int FROM billing.webhook_recovery_jobs) AS "webhookRecoveryJobs"
        ,(SELECT count(*)::int FROM billing.provider_webhook_event_snapshots) AS "webhookRecoverySnapshots"
        ,(SELECT count(*)::int FROM platform.webhook_recovery_case_events) AS "webhookRecoveryCaseEvents"
        ,(SELECT count(*)::int FROM tenancy.customer_billing_notifications WHERE tenant_id = ${tenantId}::uuid) AS "customerNotifications"
        ,(SELECT count(*)::int FROM tenancy.billing_notification_delivery_attempts WHERE tenant_id = ${tenantId}::uuid) AS "notificationDeliveryAttempts"
    `;
    expect(evidence[0]).toEqual({ status: "cancelled", invoices: 1, credits: 1, payments: 1,
      snapshots: 6, portals: 1, providerSnapshots: 1, reconciliationResults: 1, caseEvents: 2,
      accountingAttempts: 2, accountingReferences: 1, accountingAttention: 1,
      accountingReconciliationResults: 1, accountingCaseEvents: 2,
      financialEventResults: 3, financialEventCaseEvents: 2,
      cancellationRequests: 3, cancellationEvents: 7,
      webhookRecoveryJobs: 1, webhookRecoverySnapshots: 1, webhookRecoveryCaseEvents: 3,
      customerNotifications: 11, notificationDeliveryAttempts: 1 });
    await expect(adminClient!`UPDATE billing.invoice_documents SET total_minor = 1
      WHERE subscription_id = ${subscriptionId}::uuid`).rejects.toThrow(/billing_financial_evidence_is_immutable/);
    await expect(adminClient!`UPDATE billing.accounting_external_references SET external_document_ref = 'changed'
      WHERE tenant_id = ${tenantId}::uuid`).rejects.toThrow(/billing_financial_evidence_is_immutable/);
  });
});
