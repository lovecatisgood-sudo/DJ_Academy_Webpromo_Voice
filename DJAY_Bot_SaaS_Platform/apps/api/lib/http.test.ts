import { describe, expect, it } from "vitest";
import { expectedBrowserMutationOrigin, isTrustedBrowserMutationOrigin } from "./http";

const urls = {
  publicAppUrl: "https://www.djaybot.test/registration",
  tenantAppUrl: "https://app.djaybot.test/login",
  platformAppUrl: "https://platform.djaybot.test/admin",
};

describe("browser mutation origin isolation", () => {
  it.each([
    ["/tenant/contacts", "https://app.djaybot.test"],
    ["/tenant/security/sessions/abc", "https://app.djaybot.test"],
    ["/platform/auth/login", "https://platform.djaybot.test"],
    ["/platform/voice/runtime-control", "https://platform.djaybot.test"],
    ["/public/auth/register", "https://www.djaybot.test"],
    ["/public/auth/verify-email", "https://www.djaybot.test"],
    ["/public/invitations/accept", "https://www.djaybot.test"],
    ["/public/builder/ai-test", "https://www.djaybot.test"],
    ["/public/auth/login", "https://app.djaybot.test"],
    ["/public/auth/mfa/challenge", "https://app.djaybot.test"],
    ["/public/auth/recovery/request", "https://app.djaybot.test"],
    ["/public/auth/recovery/complete", "https://app.djaybot.test"],
    ["/public/builder/claim", "https://app.djaybot.test"],
  ])("maps %s to only %s", (pathname, origin) => {
    expect(expectedBrowserMutationOrigin(pathname, urls)).toBe(origin);
    expect(isTrustedBrowserMutationOrigin(origin, pathname, urls)).toBe(true);

    for (const candidate of [
      "https://www.djaybot.test",
      "https://app.djaybot.test",
      "https://platform.djaybot.test",
      "https://api.djaybot.test",
      "https://attacker.test",
      null,
    ]) {
      if (candidate !== origin) expect(isTrustedBrowserMutationOrigin(candidate, pathname, urls)).toBe(false);
    }
  });

  it.each([
    "/internal/operations/status",
    "/public/ai-chat/message",
    "/public/billing/webhooks/pilot",
    "/public/flowbot/session",
    "/public/voice/session",
    "/unknown",
  ])("fails closed for the non-browser mutation path %s", (pathname) => {
    expect(expectedBrowserMutationOrigin(pathname, urls)).toBeNull();
    expect(isTrustedBrowserMutationOrigin("https://www.djaybot.test", pathname, urls)).toBe(false);
  });

  it("does not normalize a malformed or path-bearing Origin header into trust", () => {
    expect(isTrustedBrowserMutationOrigin("https://app.djaybot.test/tenant", "/tenant/contacts", urls)).toBe(false);
    expect(isTrustedBrowserMutationOrigin("not-a-url", "/tenant/contacts", urls)).toBe(false);
  });
});
