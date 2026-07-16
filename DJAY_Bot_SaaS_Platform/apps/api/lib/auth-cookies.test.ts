import { NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearPlatformChallengeCookie,
  clearPlatformSessionCookie,
  clearTenantChallengeCookie,
  clearTenantSessionCookie,
  setPlatformChallengeCookie,
  setPlatformSessionCookie,
  setTenantChallengeCookie,
  setTenantSessionCookie,
} from "./auth-cookies";

function response() {
  return NextResponse.json({ ok: true });
}

function cookieHeader(value: NextResponse) {
  const headers = value.headers.getSetCookie();
  expect(headers).toHaveLength(1);
  return headers[0]!;
}

function expectBase(header: string, name: string, sameSite: "Lax" | "Strict", path: string) {
  expect(header).toContain(`${name}=`);
  expect(header).toContain("HttpOnly");
  expect(header).toContain("Secure");
  expect(header.toLowerCase()).toContain(`samesite=${sameSite.toLowerCase()}`);
  expect(header).toContain(`Path=${path}`);
  expect(header).not.toContain("Domain=");
}

afterEach(() => vi.useRealTimers());

describe("authentication cookie policy", () => {
  it("issues host-only Tenant session and narrowly scoped MFA cookies", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-16T00:00:00.000Z"));
    const session = response();
    setTenantSessionCookie(session, "session-token", new Date("2026-07-16T00:10:00.000Z"), true);
    const sessionHeader = cookieHeader(session);
    expectBase(sessionHeader, "djay_tenant_session", "Lax", "/");
    expect(sessionHeader).toContain("Max-Age=600");

    const challenge = response();
    setTenantChallengeCookie(challenge, "challenge-token", new Date("2026-07-16T00:05:00.000Z"), true);
    const challengeHeader = cookieHeader(challenge);
    expectBase(challengeHeader, "djay_tenant_mfa_challenge", "Lax", "/public/auth/mfa/challenge");
    expect(challengeHeader).toContain("Max-Age=300");
  });

  it("keeps Platform cookies separate, Strict, and challenge-scoped", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-16T00:00:00.000Z"));
    const session = response();
    setPlatformSessionCookie(session, "session-token", new Date("2026-07-16T00:10:00.000Z"), true);
    expectBase(cookieHeader(session), "djay_platform_session", "Strict", "/");

    const challenge = response();
    setPlatformChallengeCookie(challenge, "challenge-token", new Date("2026-07-16T00:05:00.000Z"), true);
    expectBase(cookieHeader(challenge), "djay_platform_challenge", "Strict", "/platform/auth/mfa/challenge");
  });

  it.each([
    [clearTenantSessionCookie, "djay_tenant_session", "Lax", "/"],
    [clearTenantChallengeCookie, "djay_tenant_mfa_challenge", "Lax", "/public/auth/mfa/challenge"],
    [clearPlatformSessionCookie, "djay_platform_session", "Strict", "/"],
    [clearPlatformChallengeCookie, "djay_platform_challenge", "Strict", "/platform/auth/mfa/challenge"],
  ] as const)("expires %s with the issuance security attributes", (clearCookie, name, sameSite, path) => {
    const value = response();
    clearCookie(value, true);
    const header = cookieHeader(value);
    expectBase(header, name, sameSite, path);
    expect(header).toContain("Max-Age=0");
    expect(header).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
  });

  it("omits Secure only for the explicit non-production policy", () => {
    const value = response();
    setTenantSessionCookie(value, "session-token", new Date(Date.now() + 60_000), false);
    expect(cookieHeader(value)).not.toContain("Secure");
  });
});
