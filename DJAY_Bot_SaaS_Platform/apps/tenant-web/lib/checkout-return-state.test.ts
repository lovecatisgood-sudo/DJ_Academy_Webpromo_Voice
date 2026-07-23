import { describe, expect, it } from "vitest";
import { resolveCheckoutReturnState } from "./checkout-return-state";

describe("resolveCheckoutReturnState", () => {
  const sellable = [{ planKey: "flowbot_basic", sellable: true }];
  const notSellable = [{ planKey: "flowbot_basic", sellable: false }];

  it("returns active when accessMode is active", () => {
    expect(resolveCheckoutReturnState({
      subscriptions: [{ productKey: "flowbot", planKey: "flowbot_basic", status: "active", accessMode: "active" }],
      catalogPlans: sellable,
    })).toBe("active");
  });

  it("returns action_required for past_due", () => {
    expect(resolveCheckoutReturnState({
      subscriptions: [{ productKey: "flowbot", planKey: "flowbot_basic", status: "past_due", accessMode: "read_only" }],
      catalogPlans: sellable,
    })).toBe("action_required");
  });

  it("returns expired for cancelled", () => {
    expect(resolveCheckoutReturnState({
      subscriptions: [{ productKey: "flowbot", planKey: "flowbot_basic", status: "cancelled", accessMode: "none" }],
      catalogPlans: sellable,
    })).toBe("expired");
  });

  it("returns processing while pending", () => {
    expect(resolveCheckoutReturnState({
      subscriptions: [{ productKey: "flowbot", planKey: "flowbot_basic", status: "pending", accessMode: "none" }],
      catalogPlans: sellable,
    })).toBe("processing");
  });

  it("returns unavailable when plan is not sellable and no subscription", () => {
    expect(resolveCheckoutReturnState({
      subscriptions: [],
      catalogPlans: notSellable,
    })).toBe("unavailable");
  });
});
