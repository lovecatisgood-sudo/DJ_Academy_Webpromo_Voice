import { describe, expect, it } from "vitest";
import {
  PUBLIC_BUILDER_TEST_CAP,
  PUBLIC_BUILDER_TEST_COOKIE,
  PUBLIC_BUILDER_TEST_RATE_LIMIT_SCOPE,
  PUBLIC_BUILDER_TEST_WINDOW_MS,
  publicBuilderTestCookie,
  resolvePublicBuilderTestSession,
} from "./public-builder-test-quota";

const key = Buffer.alloc(32, 7);

describe("public builder test quota identity", () => {
  it("creates and reuses a signed anonymous builder session", () => {
    const now = new Date("2026-08-17T00:00:00.000Z");
    const created = resolvePublicBuilderTestSession(undefined, key, now);
    expect(created.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(resolvePublicBuilderTestSession(created.cookieValue, key, now)).toEqual(created);
  });

  it("rejects a modified session signature", () => {
    const now = new Date("2026-08-17T00:00:00.000Z");
    const created = resolvePublicBuilderTestSession(undefined, key, now);
    const changed = resolvePublicBuilderTestSession(`${created.sessionId}.${now.getTime()}.invalid`, key, now);
    expect(changed.sessionId).not.toBe(created.sessionId);
  });

  it("starts a new session after the signed 30-day lifetime", () => {
    const issuedAt = new Date("2026-08-17T00:00:00.000Z");
    const created = resolvePublicBuilderTestSession(undefined, key, issuedAt);
    const expired = resolvePublicBuilderTestSession(
      created.cookieValue,
      key,
      new Date(issuedAt.getTime() + PUBLIC_BUILDER_TEST_WINDOW_MS),
    );
    expect(expired.sessionId).not.toBe(created.sessionId);
  });

  it("uses the approved session cap without a minute throttle", () => {
    expect(PUBLIC_BUILDER_TEST_CAP).toBe(50);
    expect(PUBLIC_BUILDER_TEST_RATE_LIMIT_SCOPE).toBe("public_builder_ai_test_cap");
    expect(PUBLIC_BUILDER_TEST_WINDOW_MS).toBe(30 * 24 * 60 * 60 * 1_000);
    expect(publicBuilderTestCookie("signed", true)).toContain(`${PUBLIC_BUILDER_TEST_COOKIE}=signed`);
    expect(publicBuilderTestCookie("signed", true)).toContain("Secure");
  });
});
