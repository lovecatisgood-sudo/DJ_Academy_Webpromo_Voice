import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const checkoutRoute = readFileSync(
  resolve(import.meta.dirname, "../app/tenant/billing/checkout/route.ts"),
  "utf8",
);
const subscriptionsRoute = readFileSync(
  resolve(import.meta.dirname, "../app/tenant/subscriptions/route.ts"),
  "utf8",
);
const loginRoute = readFileSync(
  resolve(import.meta.dirname, "../app/public/auth/login/route.ts"),
  "utf8",
);
const registerRoute = readFileSync(
  resolve(import.meta.dirname, "../app/public/auth/register/route.ts"),
  "utf8",
);
const securityHeaders = readFileSync(
  resolve(import.meta.dirname, "../../../config/next-security-headers.ts"),
  "utf8",
);

describe("G1b abuse floor invariants", () => {
  it("rate-limits tenant billing checkout per tenant+user", () => {
    expect(checkoutRoute).toContain("withTenantMutation");
    expect(checkoutRoute).toContain('"tenant-billing-checkout"');
    expect(checkoutRoute).toContain("assurance: \"recent_auth\"");
    expect(checkoutRoute).toContain("consumeOpenPurchaseIntentForPlan");
  });

  it("rate-limits subscription selection and creates purchase intents", () => {
    expect(subscriptionsRoute).toContain("withTenantMutation");
    expect(subscriptionsRoute).toContain('"tenant-subscription-select"');
    expect(subscriptionsRoute).toContain("createPurchaseIntent");
    expect(subscriptionsRoute).toContain("assurance: \"recent_auth\"");
  });

  it("keeps durable rate limits on public login and register", () => {
    expect(loginRoute).toContain('enforceRateLimit("login-account"');
    expect(loginRoute).toContain('enforceRateLimit("login-client"');
    expect(registerRoute).toContain('enforceRateLimit("register-account"');
    expect(registerRoute).toContain('enforceRateLimit("register-client"');
  });

  it("ships CSP baseline with documented residual unsafe-inline", () => {
    expect(securityHeaders).toContain("Content-Security-Policy");
    expect(securityHeaders).toContain("'unsafe-inline'");
  });
});
