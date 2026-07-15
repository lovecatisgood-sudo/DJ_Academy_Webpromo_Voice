import type { EntitlementValue, PlanVersionDefinition } from "@djay/catalog";
import type { ProductKey, PublicPlanKey } from "@djay/shared";
import { z } from "zod";

export const subscriptionStates = [
  "pending", "trialing", "active", "past_due", "grace_period", "restricted",
  "paused", "scheduled_change", "incomplete", "cancelled",
] as const;
export const subscriptionStateSchema = z.enum(subscriptionStates);
export type SubscriptionState = z.infer<typeof subscriptionStateSchema>;

export type ProductAccessMode = "none" | "read_only" | "active";
export const productAccessForState: Readonly<Record<SubscriptionState, ProductAccessMode>> = Object.freeze({
  pending: "none",
  trialing: "active",
  active: "active",
  past_due: "read_only",
  grace_period: "read_only",
  restricted: "read_only",
  paused: "read_only",
  scheduled_change: "active",
  incomplete: "none",
  cancelled: "read_only",
});

export type EntitlementOverride = Readonly<{
  key: string;
  value: EntitlementValue;
  effectiveFrom: Date;
  expiresAt: Date | null;
}>;

export type ResolveEntitlementInput = Readonly<{
  tenantId: string;
  subscriptionId: string;
  planVersionId: string;
  state: SubscriptionState;
  plan: PlanVersionDefinition;
  overrides?: readonly EntitlementOverride[];
  now: Date;
}>;

export type ResolvedEntitlementSnapshot = Readonly<{
  tenantId: string;
  subscriptionId: string;
  productKey: ProductKey;
  publicPlanKey: PublicPlanKey;
  planVersionId: string;
  accessMode: ProductAccessMode;
  entitlements: Readonly<Record<string, EntitlementValue>>;
  allowances: Readonly<Record<string, number | null>>;
  overageRatesMinor: Readonly<Record<string, number | null>>;
  limits: Readonly<Record<string, number | null>>;
  resolvedAt: string;
}>;

export function resolveEntitlements(input: ResolveEntitlementInput): ResolvedEntitlementSnapshot {
  const state = subscriptionStateSchema.parse(input.state);
  const entitlements: Record<string, EntitlementValue> = { ...input.plan.entitlements };
  for (const override of input.overrides ?? []) {
    if (override.effectiveFrom > input.now) continue;
    if (override.expiresAt && override.expiresAt <= input.now) continue;
    entitlements[override.key] = override.value;
  }
  return Object.freeze({
    tenantId: input.tenantId,
    subscriptionId: input.subscriptionId,
    productKey: input.plan.productKey,
    publicPlanKey: input.plan.planKey,
    planVersionId: input.planVersionId,
    accessMode: productAccessForState[state],
    entitlements: Object.freeze(entitlements),
    allowances: Object.freeze({ ...input.plan.allowances }),
    overageRatesMinor: Object.freeze({ ...input.plan.overageRatesMinor }),
    limits: Object.freeze({ ...input.plan.limits }),
    resolvedAt: input.now.toISOString(),
  });
}

export function permits(snapshot: ResolvedEntitlementSnapshot, key: string): boolean {
  return snapshot.accessMode === "active" && snapshot.entitlements[key] === true;
}

export function entitlementValue(snapshot: ResolvedEntitlementSnapshot, key: string): EntitlementValue | undefined {
  return snapshot.entitlements[key];
}

export function requireEntitlement(snapshot: ResolvedEntitlementSnapshot, key: string): void {
  if (!permits(snapshot, key)) throw new EntitlementDeniedError(key);
}

export class EntitlementDeniedError extends Error {
  readonly code = "entitlement_denied";
  constructor(readonly entitlementKey: string) {
    super("The subscription does not permit this capability.");
    this.name = "EntitlementDeniedError";
  }
}
