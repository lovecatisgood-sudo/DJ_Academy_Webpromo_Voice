export type CheckoutReturnState =
  | "processing"
  | "active"
  | "action_required"
  | "expired"
  | "unavailable";

export type CheckoutReturnSubscription = Readonly<{
  productKey: string;
  planKey: string;
  status: string;
  accessMode: "none" | "read_only" | "active";
}>;

export type CheckoutReturnPlan = Readonly<{
  planKey: string;
  sellable: boolean;
}>;

/**
 * EXP-008 — resolve merchant-facing checkout return state from authoritative
 * local subscription/catalog data. Never treats the return URL as provisioning.
 */
export function resolveCheckoutReturnState(input: Readonly<{
  subscriptions: readonly CheckoutReturnSubscription[];
  catalogPlans: readonly CheckoutReturnPlan[];
  focusPlanKey?: string;
}>): CheckoutReturnState {
  const focus = input.focusPlanKey ?? "flowbot_basic";
  const plan = input.catalogPlans.find((item) => item.planKey === focus);
  const subscription = input.subscriptions.find((item) => item.planKey === focus)
    ?? input.subscriptions.find((item) => item.productKey === "flowbot");

  if (subscription?.accessMode === "active") return "active";

  if (subscription && ["past_due", "grace_period", "restricted", "unpaid"].includes(subscription.status)) {
    return "action_required";
  }

  if (subscription && ["cancelled", "canceled", "expired", "incomplete_expired"].includes(subscription.status)) {
    return "expired";
  }

  if (subscription && ["pending", "incomplete", "trialing"].includes(subscription.status)) {
    return "processing";
  }

  if (plan && !plan.sellable) return "unavailable";
  if (!subscription && plan?.sellable) return "processing";
  if (!subscription) return "unavailable";
  return "processing";
}
