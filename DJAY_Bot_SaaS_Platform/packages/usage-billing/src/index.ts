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
  returnUrl: string;
  idempotencyKey: string;
}>;

export type CheckoutSession = Readonly<{
  externalCustomerRef: string;
  externalSubscriptionRef: string;
  checkoutUrl: string;
  expiresAt: Date;
}>;

export interface PaymentProvider {
  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;
  cancelSubscription(externalSubscriptionRef: string, idempotencyKey: string): Promise<void>;
}

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
