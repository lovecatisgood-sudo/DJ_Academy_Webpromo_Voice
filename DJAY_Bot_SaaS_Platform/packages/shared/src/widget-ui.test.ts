import { afterEach, describe, expect, it, vi } from "vitest";
import { djayWidgetBaseStyles, normalizeWidgetApiOrigin, widgetFetch } from "./widget-ui";

afterEach(() => vi.unstubAllGlobals());

describe("shared customer widget foundation", () => {
  it("uses the canonical DJAY tokens and accessibility media contracts", () => {
    expect(djayWidgetBaseStyles).toContain("--djay-widget-green: #126149");
    expect(djayWidgetBaseStyles).toContain("--djay-widget-accent: #f2c14e");
    expect(djayWidgetBaseStyles).toContain(":focus-visible");
    expect(djayWidgetBaseStyles).toContain("prefers-reduced-motion");
    expect(djayWidgetBaseStyles).toContain("forced-colors");
    expect(djayWidgetBaseStyles).toContain("env(safe-area-inset-bottom)");
  });

  it("accepts only an exact HTTP(S) API origin", () => {
    expect(normalizeWidgetApiOrigin("https://api.example.test///")).toBe("https://api.example.test");
    expect(normalizeWidgetApiOrigin("http://127.0.0.1:3103")).toBe("http://127.0.0.1:3103");
    expect(() => normalizeWidgetApiOrigin("https://api.example.test/public")).toThrow("widget_api_origin_invalid");
    expect(() => normalizeWidgetApiOrigin("javascript:alert(1)")).toThrow("widget_api_origin_invalid");
  });

  it("adds a bounded abort signal while preserving request options", async () => {
    const request = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return Response.json({ status: "ok" });
    });
    vi.stubGlobal("fetch", request);
    const response = await widgetFetch("https://api.example.test/public/status", { method: "POST" });
    expect(response.ok).toBe(true);
    expect(request).toHaveBeenCalledOnce();
  });
});
