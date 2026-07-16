import { afterEach, describe, expect, it, vi } from "vitest";
import { safeMutationFetch } from "./http";

afterEach(() => vi.unstubAllGlobals());

describe("safeMutationFetch", () => {
  it("normalizes a rejected transport without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    const response = await safeMutationFetch("/mutation", { method: "POST" });
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ status: "temporarily_unavailable" });
  });

  it("replaces an HTML gateway failure with safe JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Bad gateway", { status: 502, headers: { "Content-Type": "text/html" } })));
    const response = await safeMutationFetch("/mutation", { method: "POST" });
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ status: "temporarily_unavailable" });
  });

  it("preserves API JSON failures for endpoint-specific messages", async () => {
    const original = new Response(JSON.stringify({ message: "Review required" }), { status: 409, headers: { "Content-Type": "application/json" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(original));
    const response = await safeMutationFetch("/mutation", { method: "POST" });
    expect(response).toBe(original);
    await expect(response.json()).resolves.toEqual({ message: "Review required" });
  });
});
