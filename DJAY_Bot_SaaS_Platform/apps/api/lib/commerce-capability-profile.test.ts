import { describe, expect, it } from "vitest";
import {
  assertCommerceCapabilityProfile,
  commerceEnabled,
} from "./commerce-capability-profile";

describe("commerce capability profile", () => {
  it("treats missing billing database as commerce-off", () => {
    expect(commerceEnabled({})).toBe(false);
    expect(() => assertCommerceCapabilityProfile({})).not.toThrow();
    expect(() => assertCommerceCapabilityProfile({
      STRIPE_SECRET_KEY: "sk_test_placeholder_value_12345",
    })).not.toThrow();
  });

  it("requires complete Stripe configuration when commerce is on", () => {
    expect(commerceEnabled({ BILLING_DATABASE_URL: "postgres://billing" })).toBe(true);
    expect(() => assertCommerceCapabilityProfile({
      BILLING_DATABASE_URL: "postgres://billing",
    })).toThrow(/Stripe billing configuration is incomplete/);
    expect(() => assertCommerceCapabilityProfile({
      BILLING_DATABASE_URL: "postgres://billing",
      STRIPE_SECRET_KEY: "sk_test_placeholder_value_12345",
      BILLING_CHECKOUT_ENVELOPE_KEY: "x".repeat(40),
      STRIPE_WEBHOOK_SECRET: "whsec_placeholder_value",
      BILLING_WEBHOOK_ENVELOPE_KEY: "y".repeat(40),
    })).not.toThrow();
  });
});
