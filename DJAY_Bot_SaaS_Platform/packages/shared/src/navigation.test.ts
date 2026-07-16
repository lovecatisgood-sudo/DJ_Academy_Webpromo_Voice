import { describe, expect, it } from "vitest";
import { resolveApplicationOrigin, safeSameOriginPath } from "./navigation";

describe("safe browser navigation", () => {
  it.each([
    ["/workspace", "/workspace"],
    ["/ownership/accept?transferId=one&token=two", "/ownership/accept?transferId=one&token=two"],
    ["/workspace#usage", "/workspace#usage"],
  ])("accepts the same-origin path %s", (value, expected) => {
    expect(safeSameOriginPath(value, "/workspace")).toBe(expected);
  });

  it.each([
    null, undefined, "", "workspace", "https://evil.test", "//evil.test", "///evil.test",
    "/\\evil.test", "/%5C%5Cevil.test", "/%2f%2fevil.test", "/workspace%0aLocation:evil",
    "/workspace\u0000", " /workspace",
  ])("rejects the ambiguous continuation %s", (value) => {
    const path = safeSameOriginPath(value, "/workspace");
    expect(path).toBe("/workspace");
    expect(new URL(path, "https://app.djaybot.com").origin).toBe("https://app.djaybot.com");
  });

  it("accepts exact HTTPS application origins and local HTTP only in development", () => {
    expect(resolveApplicationOrigin({ name: "TENANT_APP_URL", configured: "https://app.djaybot.com", fallback: "https://fallback.test", production: true })).toBe("https://app.djaybot.com");
    expect(resolveApplicationOrigin({ name: "PUBLIC_APP_URL", configured: "http://127.0.0.1:3100", fallback: "https://fallback.test", production: false })).toBe("http://127.0.0.1:3100");
    expect(resolveApplicationOrigin({ name: "PUBLIC_APP_URL", configured: "http://[::1]:3100", fallback: "https://fallback.test", production: false })).toBe("http://[::1]:3100");
  });

  it.each([
    "http://app.djaybot.com", "https://app.djaybot.com/path", "https://app.djaybot.com/",
    "https://user@app.djaybot.com", "https://app.djaybot.com?next=x", "javascript:alert(1)",
  ])("rejects unsafe production application origin %s", (configured) => {
    expect(() => resolveApplicationOrigin({ name: "TENANT_APP_URL", configured, fallback: "https://fallback.test", production: true }))
      .toThrow("TENANT_APP_URL_invalid");
  });
});
