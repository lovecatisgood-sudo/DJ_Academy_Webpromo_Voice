import { describe, expect, it } from "vitest";
import { aiChatSessionStorageKey, normalizeAiApiBaseUrl } from "./index";

describe("AI Chat web widget", () => {
  it("normalizes API URLs and scopes persisted sessions", () => {
    expect(normalizeAiApiBaseUrl("https://api.example///")).toBe("https://api.example");
    expect(() => normalizeAiApiBaseUrl("https://api.example/public")).toThrow("widget_api_origin_invalid");
    expect(aiChatSessionStorageKey("djay_ai_abcdefghijklmnopqrstuvwxyz")).toBe("djay:ai-chat:djay_ai_abcdefghijklmnop:session");
  });

  it("exports no routing controls", async () => {
    const source = await import("./index");
    expect(Object.keys(source).join(" ")).not.toMatch(/provider|model/i);
  });
});
