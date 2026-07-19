import { describe, expect, it } from "vitest";
import { flowbotSessionStorageKey, normalizeApiBaseUrl } from "./index";

describe("SaaS FlowBot widget", () => {
  it("normalizes API URLs and scopes persisted sessions by deployment prefix", () => {
    expect(normalizeApiBaseUrl("https://api.example///")).toBe("https://api.example");
    expect(() => normalizeApiBaseUrl("https://api.example/public")).toThrow("widget_api_origin_invalid");
    expect(flowbotSessionStorageKey("djay_flow_abcdefghijklmnopqrstuvwxyz")).toBe("djay:flowbot:djay_flow_abcdefghijklmn:session");
  });

  it("contains no model or provider controls in its public source", async () => {
    const source = await import("./index");
    expect(Object.keys(source).join(" ")).not.toMatch(/provider|model/i);
  });

  it("ships native media, carousel, card, and typed-action renderers", async () => {
    const source = await import("node:fs/promises").then(({ readFile }) => readFile(new URL("./index.ts", import.meta.url), "utf8"));
    expect(source).toContain('message.type === "carousel"');
    expect(source).toContain('document.createElement("video")');
    expect(source).toContain('link.rel = "noopener noreferrer"');
    expect(source).not.toContain("innerHTML");
  });
});
