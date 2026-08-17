import { describe, expect, it } from "vitest";
import {
  canTransitionSubscription,
  calculateUsageForecast,
  createFlowAccountAdapter,
  createStripePaymentProvider,
  signStripeWebhook,
  signWebhook,
  verifySignedWebhook,
  verifyStripeWebhook,
} from "./index";

describe("billing primitives", () => {
  it("enforces explicit subscription transitions", () => {
    expect(canTransitionSubscription("pending", "active")).toBe(true);
    expect(canTransitionSubscription("cancelled", "active")).toBe(false);
    expect(canTransitionSubscription("active", "pending")).toBe(false);
  });

  it("verifies a timestamped webhook and rejects tampering and stale delivery", () => {
    const secret = Buffer.from("01234567890123456789012345678901");
    const now = new Date("2026-07-14T12:00:00Z");
    const timestamp = Math.floor(now.getTime() / 1000);
    const rawBody = JSON.stringify({ id: "event-1", type: "subscription.active", occurredAt: now.toISOString(), data: { ref: "sub-1" } });
    const signature = signWebhook(rawBody, timestamp, secret);
    expect(verifySignedWebhook({ rawBody, timestampHeader: String(timestamp), signatureHeader: signature, secret, now }).externalEventId).toBe("event-1");
    expect(() => verifySignedWebhook({ rawBody: `${rawBody} `, timestampHeader: String(timestamp), signatureHeader: signature, secret, now })).toThrow();
    expect(() => verifySignedWebhook({ rawBody, timestampHeader: String(timestamp - 301), signatureHeader: signature, secret, now })).toThrow();
  });
});

describe("FlowAccount transport", () => {
  it("reuses client-credential tokens and delegates approved document mapping", async () => {
    const calls: string[] = [];
    const responses = [
      new Response(JSON.stringify({ access_token: "flow-token", expires_in: 86400 }), { status: 200 }),
      new Response(JSON.stringify({ data: { recordId: 123, documentSerial: "FA-TI-1" } }), { status: 201 }),
      new Response(JSON.stringify({ data: { recordId: 123, documentSerial: "FA-TI-1", externalDocumentId: "job-1",
        currency: "THB", totalMinor: 249900, status: "approved" } }), { status: 200 }),
    ];
    const fetchImpl: typeof fetch = async (input) => {
      calls.push(String(input));
      return responses.shift()!;
    };
    const adapter = createFlowAccountAdapter({ mode: "test", clientId: "client", clientSecret: "secret",
      fetchImpl, now: () => 1_000,
      mapping: {
        version: "accountant-approved-test-v1",
        mapDocument: (_document, idempotencyReference) => ({ documentType: "tax-invoices",
          payload: { externalDocumentId: idempotencyReference } }),
        parseCreated: (_type, raw) => ({
          externalRecordRef: String((raw as { data: { recordId: number } }).data.recordId),
          externalDocumentRef: (raw as { data: { documentSerial: string } }).data.documentSerial,
        }),
        parseRetrieved: (_type, raw) => {
          const data = (raw as { data: Record<string, unknown> }).data;
          return { found: true, externalRecordRef: String(data.recordId),
            externalDocumentRef: String(data.documentSerial), idempotencyReference: String(data.externalDocumentId),
            providerStatus: String(data.status), currency: String(data.currency),
            totalMinor: Number(data.totalMinor), raw };
        },
      },
    });
    const document = { schemaVersion: 1 as const, kind: "invoice" as const,
      localDocumentId: "local-1", documentNumber: "in_1", currency: "THB" as const,
      status: "paid", totalMinor: 249900 };
    await expect(adapter.syncDocument(document, "job-1")).resolves.toMatchObject({
      outcome: "succeeded", externalRecordRef: "123", externalDocumentRef: "FA-TI-1",
    });
    await expect(adapter.retrieveDocument("tax-invoices", "123")).resolves.toMatchObject({
      found: true, externalRecordRef: "123", totalMinor: 249900,
    });
    expect(calls.filter((url) => url.endsWith("/token"))).toHaveLength(1);
  });

  it("returns provider-aware backoff for HTTP 429", async () => {
    const responses = [
      new Response(JSON.stringify({ access_token: "flow-token", expires_in: 86400 }), { status: 200 }),
      new Response(JSON.stringify({ status: false, code: 429 }), { status: 429 }),
    ];
    const adapter = createFlowAccountAdapter({ mode: "test", clientId: "client", clientSecret: "secret",
      fetchImpl: async () => responses.shift()!, mapping: {
        version: "test-v1", mapDocument: () => ({ documentType: "tax-invoices", payload: {} }),
        parseCreated: () => ({ externalRecordRef: "unused", externalDocumentRef: null }),
        parseRetrieved: (_type, raw) => ({ found: false, externalRecordRef: null,
          externalDocumentRef: null, idempotencyReference: null, providerStatus: null,
          currency: null, totalMinor: null, raw }),
      },
    });
    await expect(adapter.syncDocument({ schemaVersion: 1, kind: "invoice", localDocumentId: "local-1",
      documentNumber: "in_1", currency: "THB", status: "paid", totalMinor: 1 }, "job-1"))
      .resolves.toMatchObject({ outcome: "rate_limited", retryAfterMs: 60_000 });
  });
});

describe("usage forecasting", () => {
  it("projects period usage without understating committed usage", () => {
    const forecast = calculateUsageForecast({
      periodStart: new Date("2026-07-01T00:00:00Z"),
      periodEnd: new Date("2026-07-31T00:00:00Z"),
      asOf: new Date("2026-07-16T00:00:00Z"),
      settledQuantity: 700, reservedQuantity: 50,
      includedQuantity: 1_000, overageRateMinor: 35,
    });
    expect(forecast.projectedQuantity).toBe(1_500);
    expect(forecast.projectedOverageQuantity).toBe(500);
    expect(forecast.estimatedOverageMinor).toBe(17_500);
    expect(forecast.crossedThresholds).toEqual([50, 75]);
    expect(forecast.confidence).toBe("high");
    expect(forecast.projectedExhaustionAt?.toISOString()).toBe("2026-07-21T00:00:00.000Z");
  });

  it("keeps commercial estimates unavailable when allowance or rate is unconfigured", () => {
    const forecast = calculateUsageForecast({
      periodStart: new Date("2026-07-01T00:00:00Z"),
      periodEnd: new Date("2026-08-01T00:00:00Z"),
      asOf: new Date("2026-07-02T00:00:00Z"),
      settledQuantity: 2, reservedQuantity: 0,
      includedQuantity: null, overageRateMinor: null,
    });
    expect(forecast.projectedOverageQuantity).toBeNull();
    expect(forecast.estimatedOverageMinor).toBeNull();
    expect(forecast.crossedThresholds).toEqual([]);
    expect(forecast.confidence).toBe("low");
  });
});

describe("Stripe production boundary", () => {
  it("creates and independently verifies a no-charge card SetupIntent", async () => {
    const requests: Array<{ url: string; body: string; idempotency: string | null }> = [];
    const tenantId = "10000000-0000-4000-8000-000000000001";
    const purchaseIntentId = "20000000-0000-4000-8000-000000000001";
    const provider = createStripePaymentProvider({
      secretKey: "sk_test_restricted_abcdefghijklmnopqrstuvwxyz", allowedReturnOrigins: ["https://tenant.djaybot.com"],
      fetchImpl: async (input, init) => {
        const url = String(input); const headers = new Headers(init?.headers);
        requests.push({ url, body: String(init?.body ?? ""), idempotency: headers.get("Idempotency-Key") });
        if (url.endsWith("customers")) return Response.json({ id: "cus_trial_123" });
        if (url.endsWith("setup_intents")) return Response.json({ id: "seti_trial_123",
          client_secret: "seti_trial_123_secret_client_value", customer: "cus_trial_123",
          payment_method: null, status: "requires_payment_method", usage: "off_session",
          metadata: { tenant_id: tenantId, purchase_intent_id: purchaseIntentId } });
        if (url.endsWith("setup_intents/seti_trial_123")) return Response.json({ id: "seti_trial_123",
          client_secret: "seti_trial_123_secret_client_value", customer: "cus_trial_123",
          payment_method: "pm_trial_123", status: "succeeded", usage: "off_session",
          metadata: { tenant_id: tenantId, purchase_intent_id: purchaseIntentId } });
        if (url.endsWith("customers/cus_trial_123/payment_methods/pm_trial_123")) {
          return Response.json({ id: "pm_trial_123", customer: "cus_trial_123", type: "card",
            card: { fingerprint: "provider-fingerprint-value" } });
        }
        return new Response(null, { status: 404 });
      },
    });
    await expect(provider.createTrialCardSetup({ tenantId, purchaseIntentId, idempotencyKey: "text-trial-safe-key" }))
      .resolves.toEqual({ externalCustomerRef: "cus_trial_123", externalSetupIntentRef: "seti_trial_123",
        clientSecret: "seti_trial_123_secret_client_value" });
    expect(requests[0]?.idempotency).toBe("text-trial-safe-key:customer");
    expect(requests[1]?.idempotency).toBe("text-trial-safe-key:setup");
    expect(requests[1]?.body).toContain("payment_method_types%5B%5D=card");
    await expect(provider.retrieveTrialCardSetup({ externalSetupIntentRef: "seti_trial_123",
      expectedCustomerRef: "cus_trial_123", tenantId, purchaseIntentId })).resolves.toEqual({
      externalCustomerRef: "cus_trial_123", externalSetupIntentRef: "seti_trial_123",
      externalPaymentMethodRef: "pm_trial_123", status: "succeeded", cardFingerprint: "provider-fingerprint-value",
    });
  });

  it("verifies Stripe's timestamped v1 signature and live-mode boundary", () => {
    const now = new Date("2026-07-18T12:00:00Z");
    const timestamp = Math.floor(now.getTime() / 1000);
    const secret = "whsec_restricted_webhook_secret";
    const rawBody = JSON.stringify({
      id: "evt_123", type: "invoice.paid", created: timestamp, livemode: true,
      data: { object: { id: "in_123", subscription: "sub_123" } },
    });
    const signature = signStripeWebhook(rawBody, timestamp, secret);
    expect(verifyStripeWebhook({
      rawBody, signatureHeader: `t=${timestamp},v1=obsolete,v1=${signature}`,
      secret, now, requireLiveMode: true,
    })).toEqual({
      externalEventId: "evt_123", eventType: "invoice.paid", occurredAt: now,
      payload: { id: "in_123", subscription: "sub_123" },
    });
    expect(() => verifyStripeWebhook({
      rawBody, signatureHeader: `t=${timestamp},v1=${signature}`,
      secret, now, requireLiveMode: false,
    })).toThrow(/Webhook verification failed/);
  });

  it("creates hosted Checkout and Portal sessions with fixed price authority", async () => {
    const requests: Array<{ url: string; body: string; headers: HeadersInit | undefined }> = [];
    const provider = createStripePaymentProvider({
      secretKey: "sk_test_restricted_abcdefghijklmnopqrstuvwxyz",
      allowedReturnOrigins: ["https://tenant.djaybot.com"],
      fetchImpl: async (input, init) => {
        requests.push({ url: String(input), body: String(init?.body), headers: init?.headers });
        if (String(input).endsWith("checkout/sessions")) {
          return new Response(JSON.stringify({
            id: "cs_test_123", url: "https://checkout.stripe.com/c/pay/test",
            expires_at: 1_800_000_000, customer: null, subscription: null,
          }), { status: 200 });
        }
        if (String(input).endsWith("invoices/in_123")) {
          return new Response(JSON.stringify({ id: "in_123", status: "paid", currency: "thb",
            total: 249900, amount_paid: 249900, amount_remaining: 0 }), { status: 200 });
        }
        if (String(input).endsWith("refunds/re_123")) {
          return new Response(JSON.stringify({ id: "re_123", status: "succeeded", currency: "thb",
            amount: 10000, payment_intent: "pi_123", charge: "ch_123" }), { status: 200 });
        }
        if (String(input).endsWith("credit_notes/cn_123")) {
          return new Response(JSON.stringify({ id: "cn_123", status: "issued", currency: "thb",
            total: 10000, invoice: "in_123", refund_amount: 10000, credit_amount: 0 }), { status: 200 });
        }
        if (String(input).endsWith("subscriptions/sub_123")) {
          const scheduled = String(init?.body).includes("cancel_at_period_end=true");
          return new Response(JSON.stringify({
            id: "sub_123", status: "active", cancel_at_period_end: scheduled,
            cancel_at: scheduled ? 1_800_000_600 : null, current_period_end: 1_800_000_600,
          }), { status: 200 });
        }
        if (String(input).endsWith("events/evt_123")) {
          return new Response(JSON.stringify({ id: "evt_123", type: "customer.subscription.updated",
            created: 1_800_000_000, data: { object: { id: "sub_123", status: "active" } } }), { status: 200 });
        }
        return new Response(JSON.stringify({
          url: "https://billing.stripe.com/p/session/test", expires_at: 1_800_000_300,
        }), { status: 200 });
      },
    });
    const checkout = await provider.createCheckout({
      tenantId: "10000000-0000-4000-8000-000000000001",
      publicPlanKey: "flowbot_basic",
      checkoutIntentId: "20000000-0000-4000-8000-000000000001",
      contractSha256: "ab".repeat(32),
      externalPriceRef: "price_flowbot_basic_v1",
      returnUrl: "https://tenant.djaybot.com/workspace/usage",
      idempotencyKey: "checkout-1",
    });
    expect(checkout.externalSessionRef).toBe("cs_test_123");
    expect(requests[0]?.body).toContain("line_items%5B0%5D%5Bprice%5D=price_flowbot_basic_v1");
    expect(requests[0]?.body).toContain("metadata%5Bcheckout_intent_id%5D=20000000-0000-4000-8000-000000000001");
    expect(requests[0]?.body).toContain(`metadata%5Bcontract_sha256%5D=${"ab".repeat(32)}`);
    const portal = await provider.createPortal(
      "cus_123", "https://tenant.djaybot.com/workspace/usage", "portal-1",
    );
    expect(portal.portalUrl).toContain("billing.stripe.com");
    await expect(provider.setSubscriptionCancellation("sub_123", true, "cancel-1"))
      .resolves.toMatchObject({ cancelAtPeriodEnd: true, providerStatus: "active" });
    await expect(provider.setSubscriptionCancellation("sub_123", false, "cancel-2"))
      .resolves.toEqual({ cancelAtPeriodEnd: false, effectiveAt: null, providerStatus: "active" });
    await expect(provider.retrieveWebhookEvent("evt_123")).resolves.toMatchObject({
      externalEventId: "evt_123", eventType: "customer.subscription.updated",
      payload: { id: "sub_123", status: "active" },
    });
    await expect(provider.retrieveInvoice("in_123")).resolves.toMatchObject({
      externalInvoiceRef: "in_123", status: "paid", currency: "THB",
      totalMinor: 249900, amountPaidMinor: 249900, amountRemainingMinor: 0,
    });
    await expect(provider.retrieveFinancialEvent("payment", "in_123")).resolves.toMatchObject({
      evidenceKind: "payment", externalRef: "in_123", status: "succeeded", totalMinor: 249900,
    });
    await expect(provider.retrieveFinancialEvent("refund", "re_123")).resolves.toMatchObject({
      evidenceKind: "refund", externalRef: "re_123", relatedRef: "pi_123", totalMinor: 10000,
    });
    await expect(provider.retrieveFinancialEvent("credit_note", "cn_123")).resolves.toMatchObject({
      evidenceKind: "credit_note", externalRef: "cn_123", relatedRef: "in_123",
      totalMinor: 10000, refundMinor: 10000, creditMinor: 0,
    });
    await expect(provider.createCheckout({
      tenantId: "10000000-0000-4000-8000-000000000001",
      publicPlanKey: "voice_basic_gen1",
      checkoutIntentId: "20000000-0000-4000-8000-000000000002",
      contractSha256: "cd".repeat(32),
      externalPriceRef: "missing",
      returnUrl: "https://tenant.djaybot.com/workspace/usage",
      idempotencyKey: "checkout-2",
    })).rejects.toThrow("stripe_price_not_configured");
  });
});
