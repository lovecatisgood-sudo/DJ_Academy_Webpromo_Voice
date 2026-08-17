import { describe, expect, it } from "vitest";
import {
  PUBLIC_BUILDER_TEST_CAP,
  PUBLIC_BUILDER_TEST_COOKIE,
  PUBLIC_BUILDER_TEST_WINDOW_MS,
  publicBuilderTestCookie,
  resolvePublicBuilderTestSession,
} from "./public-builder-test-quota";

const key = Buffer.alloc(32, 7);

describe("public builder test quota identity", () => {
  it("creates and reuses a signed anonymous builder session", () => {
    const created = resolvePublicBuilderTestSession(undefined, key);
    expect(created.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(resolvePublicBuilderTestSession(created.cookieValue, key)).toEqual(created);
  });

  it("rejects a modified session signature", () => {
    const created = resolvePublicBuilderTestSession(undefined, key);
    const changed = resolvePublicBuilderTestSession(`${created.sessionId}.invalid`, key);
    expect(changed.sessionId).not.toBe(created.sessionId);
  });

  it("uses the approved session cap without a minute throttle", () => {
    expect(PUBLIC_BUILDER_TEST_CAP).toBe(50);
    expect(PUBLIC_BUILDER_TEST_WINDOW_MS).toBe(30 * 24 * 60 * 60 * 1_000);
    expect(publicBuilderTestCookie("signed", true)).toContain(`${PUBLIC_BUILDER_TEST_COOKIE}=signed`);
    expect(publicBuilderTestCookie("signed", true)).toContain("Secure");
  });
});
