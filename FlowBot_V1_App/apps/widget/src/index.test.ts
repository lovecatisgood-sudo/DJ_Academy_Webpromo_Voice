import { describe, expect, it } from "vitest";

describe("widget package", () => {
  it("keeps the public mount function importable", async () => {
    const mod = await import("./index");
    expect(typeof mod.mountFlowBotWidget).toBe("function");
  });

  it("keeps stable storage keys per bot", async () => {
    const mod = await import("./index");
    expect(mod.storageKey("demo")).toBe("flowbot:demo:session");
    expect(mod.configStorageKey("demo")).toBe("flowbot:demo:config");
  });

  it("normalizes API base URLs", async () => {
    const mod = await import("./index");
    expect(mod.normalizeApiBaseUrl("https://example.com///")).toBe("https://example.com");
    expect(mod.normalizeApiBaseUrl("https://example.com/api")).toBe("https://example.com/api");
  });

  it("supports both new color and seeded themeColor widget settings", async () => {
    const mod = await import("./index");
    expect(mod.resolveThemeAccent(null)).toBe("#0E7C6B");
    expect(
      mod.resolveThemeAccent({
        botName: "Demo",
        enabled: true,
        defaultLang: "th",
        langToggle: true,
        theme: { themeColor: "#123456" },
        greeting: { th: "สวัสดี", en: "Hello" },
        contactChannels: [],
        hasPublishedFlow: true,
        widgetBundleVersion: "test"
      })
    ).toBe("#123456");
    expect(
      mod.resolveThemeAccent({
        botName: "Demo",
        enabled: true,
        defaultLang: "th",
        langToggle: true,
        theme: { color: "#abcdef", themeColor: "#123456" },
        greeting: { th: "สวัสดี", en: "Hello" },
        contactChannels: [],
        hasPublishedFlow: true,
        widgetBundleVersion: "test"
      })
    ).toBe("#abcdef");
  });
});
