import { createHmac, timingSafeEqual } from "node:crypto";
import type { ProductKey, PublicPlanKey } from "@djay/shared";
import { z } from "zod";

export const customerUnits = ["flow_execution", "ai_response", "voice_minute"] as const;
export const customerUnitSchema = z.enum(customerUnits);
export type CustomerUnit = z.infer<typeof customerUnitSchema>;

export const subscriptionTransitions: Readonly<Record<string, readonly string[]>> = Object.freeze({
  pending: ["trialing", "active", "incomplete", "cancelled"],
  trialing: ["active", "past_due", "cancelled"],
  active: ["past_due", "paused", "scheduled_change", "cancelled"],
  past_due: ["active", "grace_period", "restricted", "cancelled"],
  grace_period: ["active", "restricted", "cancelled"],
  restricted: ["active", "cancelled"],
  paused: ["active", "cancelled"],
  scheduled_change: ["active", "cancelled"],
  incomplete: ["pending", "active", "cancelled"],
  cancelled: [],
});

export function canTransitionSubscription(from: string, to: string): boolean {
  return subscriptionTransitions[from]?.includes(to) ?? false;
}

export type CheckoutRequest = Readonly<{
  tenantId: string;
  publicPlanKey: PublicPlanKey;
  checkoutIntentId: string;
  contractSha256: string;
  externalPriceRef: string;
  returnUrl: string;
  idempotencyKey: string;
}>;

export type CheckoutSession = Readonly<{
  externalSessionRef: string;
  externalCustomerRef: string | null;
  externalSubscriptionRef: string | null;
  checkoutUrl: string;
  expiresAt: Date;
}>;

export type PortalSession = Readonly<{ portalUrl: string; expiresAt: Date }>;
export type TrialCardSetupRequest = Readonly<{
  tenantId: string;
  purchaseIntentId: string;
  idempotencyKey: string;
}>;
export type TrialCardSetupSession = Readonly<{
  externalCustomerRef: string;
  externalSetupIntentRef: string;
  clientSecret: string;
}>;
export type TrialCardSetupEvidence = Readonly<{
  externalCustomerRef: string;
  externalSetupIntentRef: string;
  externalPaymentMethodRef: string;
  status: "succeeded";
  cardFingerprint: string;
}>;
export type SubscriptionCancellationResult = Readonly<{
  cancelAtPeriodEnd: boolean;
  effectiveAt: Date | null;
  providerStatus: string;
}>;
export type ProviderWebhookEventEvidence = Readonly<{
  externalEventId: string; eventType: string; occurredAt: Date; payload: unknown; raw: unknown;
}>;
export type ProviderInvoiceEvidence = Readonly<{
  externalInvoiceRef: string;
  status: string;
  currency: string;
  totalMinor: number;
  amountPaidMinor: number;
  amountRemainingMinor: number;
  raw: unknown;
}>;
export type ProviderFinancialEventEvidence = Readonly<{
  evidenceKind: "payment" | "refund" | "credit_note";
  externalRef: string; relatedRef: string | null; status: string; currency: string;
  totalMinor: number; refundMinor: number | null; creditMinor: number | null; raw: unknown;
}>;

export interface PaymentProvider {
  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;
  createPortal(externalCustomerRef: string, returnUrl: string, idempotencyKey: string): Promise<PortalSession>;
  setSubscriptionCancellation(
    externalSubscriptionRef: string, cancelAtPeriodEnd: boolean, idempotencyKey: string,
  ): Promise<SubscriptionCancellationResult>;
  cancelSubscription(externalSubscriptionRef: string, idempotencyKey: string): Promise<void>;
  retrieveInvoice(externalInvoiceRef: string): Promise<ProviderInvoiceEvidence>;
  retrieveWebhookEvent(externalEventId: string): Promise<ProviderWebhookEventEvidence>;
  retrieveFinancialEvent(kind: ProviderFinancialEventEvidence["evidenceKind"], externalRef: string): Promise<ProviderFinancialEventEvidence>;
  createTrialCardSetup(request: TrialCardSetupRequest): Promise<TrialCardSetupSession>;
  retrieveTrialCardSetup(request: Readonly<{
    externalSetupIntentRef: string;
    expectedCustomerRef: string;
    tenantId: string;
    purchaseIntentId: string;
  }>): Promise<TrialCardSetupEvidence>;
}

export type AccountingDocument = Readonly<{
  schemaVersion: 1;
  kind: "invoice" | "credit_note";
  localDocumentId: string;
  documentNumber: string;
  currency: "THB";
  status: string;
  totalMinor: number;
} & Record<string, unknown>>;

export type AccountingSyncResult =
  | Readonly<{ outcome: "succeeded"; externalRecordRef: string; externalDocumentRef: string | null; raw: unknown }>
  | Readonly<{ outcome: "rejected"; safeErrorCode: string; raw: unknown }>
  | Readonly<{ outcome: "unknown" | "rate_limited"; safeErrorCode: string; retryAfterMs: number; raw: unknown }>;

export type AccountingProviderEvidence = Readonly<{
  found: boolean; externalRecordRef: string | null; externalDocumentRef: string | null;
  idempotencyReference: string | null; providerStatus: string | null;
  currency: string | null; totalMinor: number | null; raw: unknown;
}>;

export interface AccountingAdapter {
  syncDocument(document: AccountingDocument, idempotencyReference: string): Promise<AccountingSyncResult>;
  retrieveDocument(documentType: string, externalRecordRef: string): Promise<AccountingProviderEvidence>;
}

export function createAccountingTestAdapter(adapter: AccountingAdapter): AccountingAdapter {
  return Object.freeze(adapter);
}

export { createFlowAccountAdapter } from "./flowaccount";
export type { FlowAccountMappingContract } from "./flowaccount";

export type QuotaReservationRequest = Readonly<{
  tenantId: string;
  subscriptionId: string;
  entitlementSnapshotId: string;
  productKey: ProductKey;
  unit: CustomerUnit;
  operationId: string;
  idempotencyKey: string;
  requestedQuantity: number;
}>;

export type QuotaReservation = Readonly<{
  id: string;
  status: "reserved" | "settled" | "released" | "rejected";
  reservedQuantity: number;
}>;

export interface UsageLedger {
  reserve(request: QuotaReservationRequest): Promise<QuotaReservation>;
  settle(reservationId: string, actualQuantity: number, idempotencyKey: string): Promise<void>;
  release(reservationId: string, idempotencyKey: string): Promise<void>;
}

export const usageAlertThresholds = [50, 75, 90, 100] as const;
export type UsageForecastConfidence = "low" | "medium" | "high";

export type UsageForecast = Readonly<{
  committedQuantity: number;
  elapsedFraction: number;
  projectedQuantity: number;
  projectedOverageQuantity: number | null;
  estimatedOverageMinor: number | null;
  includedUsagePercent: number | null;
  crossedThresholds: readonly (typeof usageAlertThresholds)[number][];
  projectedExhaustionAt: Date | null;
  confidence: UsageForecastConfidence;
}>;

export function calculateUsageForecast(input: Readonly<{
  periodStart: Date;
  periodEnd: Date;
  asOf: Date;
  settledQuantity: number;
  reservedQuantity: number;
  includedQuantity: number | null;
  overageRateMinor: number | null;
}>): UsageForecast {
  const totalMs = input.periodEnd.getTime() - input.periodStart.getTime();
  if (totalMs <= 0) throw new Error("usage_period_invalid");
  const elapsedMs = Math.min(totalMs, Math.max(0, input.asOf.getTime() - input.periodStart.getTime()));
  const elapsedFraction = elapsedMs / totalMs;
  const committedQuantity = Math.max(0, input.settledQuantity) + Math.max(0, input.reservedQuantity);
  const projectedQuantity = elapsedFraction <= 0 ? committedQuantity
    : Math.max(committedQuantity, committedQuantity / elapsedFraction);
  const includedUsagePercent = input.includedQuantity === null || input.includedQuantity <= 0
    ? null : (committedQuantity / input.includedQuantity) * 100;
  const crossedThresholds = includedUsagePercent === null ? []
    : usageAlertThresholds.filter((threshold) => includedUsagePercent >= threshold);
  const projectedOverageQuantity = input.includedQuantity === null
    ? null : Math.max(0, projectedQuantity - input.includedQuantity);
  const estimatedOverageMinor = projectedOverageQuantity === null || input.overageRateMinor === null
    ? null : Math.ceil(projectedOverageQuantity * input.overageRateMinor);
  const ratePerMs = elapsedMs > 0 ? committedQuantity / elapsedMs : 0;
  const exhaustionMs = input.includedQuantity !== null && input.includedQuantity > committedQuantity && ratePerMs > 0
    ? input.periodStart.getTime() + input.includedQuantity / ratePerMs : null;
  const projectedExhaustionAt = exhaustionMs !== null && exhaustionMs <= input.periodEnd.getTime()
    ? new Date(exhaustionMs) : null;
  const elapsedDays = elapsedMs / 86_400_000;
  const confidence: UsageForecastConfidence = elapsedDays >= 7 ? "high" : elapsedDays >= 3 ? "medium" : "low";
  return Object.freeze({
    committedQuantity, elapsedFraction, projectedQuantity, projectedOverageQuantity,
    estimatedOverageMinor, includedUsagePercent,
    crossedThresholds: Object.freeze(crossedThresholds), projectedExhaustionAt, confidence,
  });
}

export type VerifiedWebhook = Readonly<{
  externalEventId: string;
  eventType: string;
  occurredAt: Date;
  payload: unknown;
}>;

const webhookEnvelopeSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.string().min(1).max(200),
  occurredAt: z.iso.datetime(),
  data: z.unknown(),
}).strict();

export function signWebhook(rawBody: string, timestampSeconds: number, secret: Buffer): string {
  return createHmac("sha256", secret).update(`${timestampSeconds}.${rawBody}`).digest("hex");
}

export function verifySignedWebhook(input: Readonly<{
  rawBody: string;
  timestampHeader: string | null;
  signatureHeader: string | null;
  secret: Buffer;
  now: Date;
  toleranceSeconds?: number;
}>): VerifiedWebhook {
  const timestamp = Number(input.timestampHeader);
  const tolerance = input.toleranceSeconds ?? 300;
  if (!Number.isInteger(timestamp) || Math.abs(Math.floor(input.now.getTime() / 1000) - timestamp) > tolerance) {
    throw new WebhookVerificationError();
  }
  const supplied = input.signatureHeader;
  const expected = signWebhook(input.rawBody, timestamp, input.secret);
  if (!supplied || supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    throw new WebhookVerificationError();
  }
  const parsed = webhookEnvelopeSchema.parse(JSON.parse(input.rawBody));
  return Object.freeze({
    externalEventId: parsed.id,
    eventType: parsed.type,
    occurredAt: new Date(parsed.occurredAt),
    payload: parsed.data,
  });
}

export class WebhookVerificationError extends Error {
  readonly code = "invalid_webhook_signature";
  constructor() {
    super("Webhook verification failed.");
    this.name = "WebhookVerificationError";
  }
}

const stripeEventSchema = z.object({
  id: z.string().regex(/^evt_[A-Za-z0-9]+$/),
  type: z.string().min(1).max(200),
  created: z.number().int().nonnegative(),
  livemode: z.boolean(),
  data: z.object({ object: z.unknown() }).passthrough(),
}).passthrough();

export function signStripeWebhook(rawBody: string, timestampSeconds: number, secret: string): string {
  return createHmac("sha256", secret).update(`${timestampSeconds}.${rawBody}`).digest("hex");
}

export function verifyStripeWebhook(input: Readonly<{
  rawBody: string;
  signatureHeader: string | null;
  secret: string;
  now: Date;
  toleranceSeconds?: number;
  requireLiveMode?: boolean;
}>): VerifiedWebhook {
  const fields = new Map<string, string[]>();
  for (const part of input.signatureHeader?.split(",") ?? []) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    fields.set(key, [...(fields.get(key) ?? []), value]);
  }
  const timestamp = Number(fields.get("t")?.[0]);
  const tolerance = input.toleranceSeconds ?? 300;
  if (!Number.isInteger(timestamp)
    || Math.abs(Math.floor(input.now.getTime() / 1000) - timestamp) > tolerance) {
    throw new WebhookVerificationError();
  }
  const expected = signStripeWebhook(input.rawBody, timestamp, input.secret);
  const valid = (fields.get("v1") ?? []).some((signature) => signature.length === expected.length
    && timingSafeEqual(Buffer.from(signature), Buffer.from(expected)));
  if (!valid) throw new WebhookVerificationError();
  try {
    const event = stripeEventSchema.parse(JSON.parse(input.rawBody));
    if (input.requireLiveMode !== undefined && event.livemode !== input.requireLiveMode) {
      throw new WebhookVerificationError();
    }
    return Object.freeze({
      externalEventId: event.id,
      eventType: event.type,
      occurredAt: new Date(event.created * 1000),
      payload: event.data.object,
    });
  } catch (error) {
    if (error instanceof WebhookVerificationError) throw error;
    throw new WebhookVerificationError();
  }
}

const stripeCheckoutSchema = z.object({
  id: z.string().regex(/^cs_[A-Za-z0-9_]+$/),
  url: z.string().url(),
  expires_at: z.number().int().positive(),
  customer: z.string().nullable().optional(),
  subscription: z.string().nullable().optional(),
}).passthrough();
const stripePortalSchema = z.object({
  url: z.string().url(), expires_at: z.number().int().positive(),
}).passthrough();
const stripeCustomerSchema = z.object({ id: z.string().regex(/^cus_[A-Za-z0-9_]+$/) }).passthrough();
const stripeSetupIntentSchema = z.object({
  id: z.string().regex(/^seti_[A-Za-z0-9_]+$/),
  client_secret: z.string().min(20),
  customer: z.string().regex(/^cus_[A-Za-z0-9_]+$/),
  payment_method: z.string().regex(/^pm_[A-Za-z0-9_]+$/).nullable().optional(),
  status: z.enum(["requires_payment_method", "requires_confirmation", "requires_action", "processing", "canceled", "succeeded"]),
  usage: z.literal("off_session"),
  metadata: z.record(z.string(), z.string()),
}).passthrough();
const stripeCardPaymentMethodSchema = z.object({
  id: z.string().regex(/^pm_[A-Za-z0-9_]+$/),
  customer: z.string().regex(/^cus_[A-Za-z0-9_]+$/),
  type: z.literal("card"),
  card: z.object({ fingerprint: z.string().min(8).max(200) }).passthrough(),
}).passthrough();
const stripeSubscriptionSchema = z.object({
  id: z.string().regex(/^sub_[A-Za-z0-9_]+$/),
  status: z.string().min(1).max(100),
  cancel_at_period_end: z.boolean(),
  cancel_at: z.number().int().positive().nullable().optional(),
  current_period_end: z.number().int().positive(),
}).passthrough();
const stripeRetrievedEventSchema = z.object({
  id: z.string().regex(/^evt_[A-Za-z0-9_]+$/), type: z.string().min(1).max(200),
  created: z.number().int().positive(), data: z.object({ object: z.unknown() }),
}).passthrough();
const stripeInvoiceEvidenceSchema = z.object({
  id: z.string().regex(/^in_[A-Za-z0-9_]+$/),
  status: z.string().min(1).max(100),
  currency: z.string().min(3).max(3),
  total: z.number().int().nonnegative(),
  amount_paid: z.number().int().nonnegative(),
  amount_remaining: z.number().int().nonnegative(),
}).passthrough();
const stripePaymentIntentEvidenceSchema = z.object({
  id: z.string().regex(/^pi_[A-Za-z0-9_]+$/), status: z.string().min(1).max(100),
  currency: z.string().length(3), amount_received: z.number().int().nonnegative(),
}).passthrough();
const stripeChargeEvidenceSchema = z.object({
  id: z.string().regex(/^ch_[A-Za-z0-9_]+$/), paid: z.boolean(),
  currency: z.string().length(3), amount: z.number().int().nonnegative(),
}).passthrough();
const stripeRefundEvidenceSchema = z.object({
  id: z.string().regex(/^re_[A-Za-z0-9_]+$/), status: z.string().min(1).max(100),
  currency: z.string().length(3), amount: z.number().int().nonnegative(),
  payment_intent: z.string().nullable().optional(), charge: z.string().nullable().optional(),
}).passthrough();
const stripeCreditNoteEvidenceSchema = z.object({
  id: z.string().regex(/^cn_[A-Za-z0-9_]+$/), status: z.string().min(1).max(100),
  currency: z.string().length(3), total: z.number().int().nonnegative(), invoice: z.string().min(1),
  refund_amount: z.number().int().nonnegative(), credit_amount: z.number().int().nonnegative(),
}).passthrough();

function assertReturnUrl(value: string, allowedOrigins: ReadonlySet<string>) {
  const url = new URL(value);
  if (url.protocol !== "https:" || !allowedOrigins.has(url.origin)) {
    throw new Error("stripe_return_url_not_allowed");
  }
  return url.toString();
}

function stripeForm(entries: ReadonlyArray<readonly [string, string]>) {
  const form = new URLSearchParams();
  for (const [key, value] of entries) form.append(key, value);
  return form;
}

export function createStripePaymentProvider(config: Readonly<{
  secretKey: string;
  allowedReturnOrigins: readonly string[];
  endpoint?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}>): PaymentProvider {
  if (!config.secretKey.startsWith("sk_") || config.secretKey.length < 20) {
    throw new Error("Stripe routing configuration is incomplete.");
  }
  const endpoint = new URL(config.endpoint ?? "https://api.stripe.com/v1/");
  if (endpoint.protocol !== "https:") throw new Error("Stripe routing must use HTTPS.");
  const allowedOrigins = new Set(config.allowedReturnOrigins.map((value) => new URL(value).origin));
  const fetchImpl = config.fetchImpl ?? fetch;
  const call = async (path: string, method: "GET" | "POST" | "DELETE", form: URLSearchParams | null, idempotencyKey?: string) => {
    const response = await fetchImpl(new URL(path, endpoint), {
      method,
      headers: {
        Authorization: `Bearer ${config.secretKey}`,
        ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      ...(form ? { body: form } : {}),
      signal: AbortSignal.timeout(config.timeoutMs ?? 30_000),
    });
    if (!response.ok) throw new Error("payment_provider_unavailable");
    return response.json() as Promise<unknown>;
  };
  return {
    async createTrialCardSetup(request) {
      const customer = stripeCustomerSchema.parse(await call("customers", "POST", stripeForm([
        ["metadata[tenant_id]", request.tenantId],
        ["metadata[purchase_intent_id]", request.purchaseIntentId],
      ]), `${request.idempotencyKey}:customer`));
      const setupIntent = stripeSetupIntentSchema.parse(await call("setup_intents", "POST", stripeForm([
        ["customer", customer.id],
        ["usage", "off_session"],
        ["payment_method_types[]", "card"],
        ["metadata[tenant_id]", request.tenantId],
        ["metadata[purchase_intent_id]", request.purchaseIntentId],
      ]), `${request.idempotencyKey}:setup`));
      if (setupIntent.customer !== customer.id) throw new Error("stripe_setup_customer_mismatch");
      return Object.freeze({
        externalCustomerRef: customer.id,
        externalSetupIntentRef: setupIntent.id,
        clientSecret: setupIntent.client_secret,
      });
    },
    async retrieveTrialCardSetup(request) {
      if (!/^seti_[A-Za-z0-9_]+$/.test(request.externalSetupIntentRef)) throw new Error("stripe_setup_intent_ref_invalid");
      if (!/^cus_[A-Za-z0-9_]+$/.test(request.expectedCustomerRef)) throw new Error("stripe_customer_ref_invalid");
      const setupIntent = stripeSetupIntentSchema.parse(await call(
        `setup_intents/${request.externalSetupIntentRef}`, "GET", null,
      ));
      if (setupIntent.status !== "succeeded" || !setupIntent.payment_method) throw new Error("stripe_setup_not_succeeded");
      if (setupIntent.customer !== request.expectedCustomerRef
        || setupIntent.metadata.tenant_id !== request.tenantId
        || setupIntent.metadata.purchase_intent_id !== request.purchaseIntentId) {
        throw new Error("stripe_setup_authority_mismatch");
      }
      const paymentMethod = stripeCardPaymentMethodSchema.parse(await call(
        `customers/${request.expectedCustomerRef}/payment_methods/${setupIntent.payment_method}`, "GET", null,
      ));
      if (paymentMethod.customer !== request.expectedCustomerRef || paymentMethod.id !== setupIntent.payment_method) {
        throw new Error("stripe_payment_method_authority_mismatch");
      }
      return Object.freeze({
        externalCustomerRef: request.expectedCustomerRef,
        externalSetupIntentRef: setupIntent.id,
        externalPaymentMethodRef: paymentMethod.id,
        status: "succeeded" as const,
        cardFingerprint: paymentMethod.card.fingerprint,
      });
    },
    async createCheckout(request) {
      if (!/^price_[A-Za-z0-9_]+$/.test(request.externalPriceRef)) throw new Error("stripe_price_not_configured");
      if (!/^[a-f0-9]{64}$/.test(request.contractSha256)) throw new Error("stripe_contract_hash_invalid");
      const returnUrl = assertReturnUrl(request.returnUrl, allowedOrigins);
      const result = stripeCheckoutSchema.parse(await call("checkout/sessions", "POST", stripeForm([
        ["mode", "subscription"],
        ["line_items[0][price]", request.externalPriceRef],
        ["line_items[0][quantity]", "1"],
        ["client_reference_id", request.checkoutIntentId],
        ["metadata[checkout_intent_id]", request.checkoutIntentId],
        ["metadata[contract_sha256]", request.contractSha256],
        ["metadata[public_plan_key]", request.publicPlanKey],
        ["subscription_data[metadata][checkout_intent_id]", request.checkoutIntentId],
        ["subscription_data[metadata][contract_sha256]", request.contractSha256],
        ["subscription_data[metadata][public_plan_key]", request.publicPlanKey],
        ["success_url", returnUrl],
        ["cancel_url", returnUrl],
      ]), request.idempotencyKey));
      return Object.freeze({
        externalSessionRef: result.id,
        externalCustomerRef: result.customer ?? null,
        externalSubscriptionRef: result.subscription ?? null,
        checkoutUrl: result.url,
        expiresAt: new Date(result.expires_at * 1000),
      });
    },
    async createPortal(externalCustomerRef, returnUrl, idempotencyKey) {
      if (!/^cus_[A-Za-z0-9]+$/.test(externalCustomerRef)) throw new Error("stripe_customer_ref_invalid");
      const result = stripePortalSchema.parse(await call("billing_portal/sessions", "POST", stripeForm([
        ["customer", externalCustomerRef],
        ["return_url", assertReturnUrl(returnUrl, allowedOrigins)],
      ]), idempotencyKey));
      return Object.freeze({ portalUrl: result.url, expiresAt: new Date(result.expires_at * 1000) });
    },
    async setSubscriptionCancellation(externalSubscriptionRef, cancelAtPeriodEnd, idempotencyKey) {
      if (!/^sub_[A-Za-z0-9_]+$/.test(externalSubscriptionRef)) throw new Error("stripe_subscription_ref_invalid");
      const result = stripeSubscriptionSchema.parse(await call(
        `subscriptions/${externalSubscriptionRef}`, "POST",
        stripeForm([["cancel_at_period_end", cancelAtPeriodEnd ? "true" : "false"]]), idempotencyKey,
      ));
      return Object.freeze({
        cancelAtPeriodEnd: result.cancel_at_period_end,
        effectiveAt: result.cancel_at_period_end
          ? new Date((result.cancel_at ?? result.current_period_end) * 1000) : null,
        providerStatus: result.status,
      });
    },
    async cancelSubscription(externalSubscriptionRef, idempotencyKey) {
      if (!/^sub_[A-Za-z0-9]+$/.test(externalSubscriptionRef)) throw new Error("stripe_subscription_ref_invalid");
      await call(`subscriptions/${externalSubscriptionRef}`, "DELETE", stripeForm([]), idempotencyKey);
    },
    async retrieveInvoice(externalInvoiceRef) {
      if (!/^in_[A-Za-z0-9_]+$/.test(externalInvoiceRef)) throw new Error("stripe_invoice_ref_invalid");
      const raw = await call(`invoices/${externalInvoiceRef}`, "GET", null);
      const invoice = stripeInvoiceEvidenceSchema.parse(raw);
      return Object.freeze({
        externalInvoiceRef: invoice.id, status: invoice.status,
        currency: invoice.currency.toUpperCase(), totalMinor: invoice.total,
        amountPaidMinor: invoice.amount_paid, amountRemainingMinor: invoice.amount_remaining,
        raw,
      });
    },
    async retrieveWebhookEvent(externalEventId) {
      if (!/^evt_[A-Za-z0-9_]+$/.test(externalEventId)) throw new Error("stripe_event_ref_invalid");
      const raw = await call(`events/${externalEventId}`, "GET", null);
      const event = stripeRetrievedEventSchema.parse(raw);
      return Object.freeze({ externalEventId: event.id, eventType: event.type,
        occurredAt: new Date(event.created * 1000), payload: event.data.object, raw });
    },
    async retrieveFinancialEvent(kind, externalRef) {
      if (kind === "payment") {
        if (/^in_[A-Za-z0-9_]+$/.test(externalRef)) {
          const raw = await call(`invoices/${externalRef}`, "GET", null);
          const value = stripeInvoiceEvidenceSchema.parse(raw);
          return Object.freeze({ evidenceKind: kind, externalRef: value.id, relatedRef: null,
            status: value.status === "paid" ? "succeeded" : value.status,
            currency: value.currency.toUpperCase(), totalMinor: value.amount_paid,
            refundMinor: null, creditMinor: null, raw });
        }
        if (/^pi_[A-Za-z0-9_]+$/.test(externalRef)) {
          const raw = await call(`payment_intents/${externalRef}`, "GET", null);
          const value = stripePaymentIntentEvidenceSchema.parse(raw);
          return Object.freeze({ evidenceKind: kind, externalRef: value.id, relatedRef: null,
            status: value.status, currency: value.currency.toUpperCase(), totalMinor: value.amount_received,
            refundMinor: null, creditMinor: null, raw });
        }
        if (/^ch_[A-Za-z0-9_]+$/.test(externalRef)) {
          const raw = await call(`charges/${externalRef}`, "GET", null);
          const value = stripeChargeEvidenceSchema.parse(raw);
          return Object.freeze({ evidenceKind: kind, externalRef: value.id, relatedRef: null,
            status: value.paid ? "succeeded" : "failed", currency: value.currency.toUpperCase(),
            totalMinor: value.amount, refundMinor: null, creditMinor: null, raw });
        }
        throw new Error("stripe_payment_ref_invalid");
      }
      if (kind === "refund") {
        if (!/^re_[A-Za-z0-9_]+$/.test(externalRef)) throw new Error("stripe_refund_ref_invalid");
        const raw = await call(`refunds/${externalRef}`, "GET", null);
        const value = stripeRefundEvidenceSchema.parse(raw);
        return Object.freeze({ evidenceKind: kind, externalRef: value.id,
          relatedRef: value.payment_intent ?? value.charge ?? null, status: value.status,
          currency: value.currency.toUpperCase(), totalMinor: value.amount,
          refundMinor: null, creditMinor: null, raw });
      }
      if (!/^cn_[A-Za-z0-9_]+$/.test(externalRef)) throw new Error("stripe_credit_note_ref_invalid");
      const raw = await call(`credit_notes/${externalRef}`, "GET", null);
      const value = stripeCreditNoteEvidenceSchema.parse(raw);
      return Object.freeze({ evidenceKind: kind, externalRef: value.id, relatedRef: value.invoice,
        status: value.status, currency: value.currency.toUpperCase(), totalMinor: value.total,
        refundMinor: value.refund_amount, creditMinor: value.credit_amount, raw });
    },
  };
}
