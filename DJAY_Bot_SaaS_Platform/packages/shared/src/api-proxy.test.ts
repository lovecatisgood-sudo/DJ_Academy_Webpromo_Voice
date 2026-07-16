import { afterEach, describe, expect, it, vi } from "vitest";
import { apiProxyReadiness, proxyApiRequest, resolveApiAppOrigin } from "./api-proxy";

afterEach(() => vi.unstubAllGlobals());

describe("runtime API proxy", () => {
  it("accepts only an exact HTTP(S) origin and limits the fallback to development", () => {
    expect(resolveApiAppOrigin("https://api.djaybot.test", false)).toBe("https://api.djaybot.test");
    expect(resolveApiAppOrigin(undefined, true)).toBe("http://127.0.0.1:3103");
    expect(resolveApiAppOrigin(undefined, false)).toBeNull();
    expect(resolveApiAppOrigin("https://api.djaybot.test/base", false)).toBeNull();
    expect(resolveApiAppOrigin("https://user:secret@api.djaybot.test", false)).toBeNull();
    expect(resolveApiAppOrigin("ws://api.djaybot.test", false)).toBeNull();
  });

  it("forwards method, path, query, cookies, origin, and body without hop-by-hop headers", async () => {
    const upstream = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.internal.test/tenant/contacts/a%2Fb?view=current");
      expect(init?.method).toBe("POST");
      const headers = new Headers(init?.headers);
      expect(headers.get("cookie")).toBe("djay_tenant_session=opaque");
      expect(headers.get("origin")).toBe("https://app.djaybot.test");
      expect(headers.get("accept-encoding")).toBe("identity");
      expect(headers.has("host")).toBe(false);
      expect(headers.has("connection")).toBe(false);
      expect(headers.has("x-remove")).toBe(false);
      expect(init?.cache).toBe("no-store");
      expect(new TextDecoder().decode(init?.body as ArrayBuffer)).toBe('{"name":"Lead"}');
      return new Response(JSON.stringify({ status: "created" }), {
        status: 201,
        headers: {
          "Content-Encoding": "gzip",
          "Content-Length": "999",
          "Content-Type": "application/json",
          "Set-Cookie": "rotation=opaque; Path=/; HttpOnly",
        },
      });
    });
    vi.stubGlobal("fetch", upstream);
    const request = new Request("https://app.djaybot.test/tenant/contacts/a%2Fb?view=current", {
      method: "POST",
      headers: {
        "Connection": "keep-alive, x-remove",
        "Content-Type": "application/json",
        "Cookie": "djay_tenant_session=opaque",
        "Host": "app.djaybot.test",
        "Origin": "https://app.djaybot.test",
        "X-Remove": "connection-nominated",
      },
      body: '{"name":"Lead"}',
    });
    const response = await proxyApiRequest(request, {
      apiAppUrl: "https://api.internal.test",
      allowDevelopmentFallback: false,
      prefix: "tenant",
      path: ["contacts", "a/b"],
    });
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ status: "created" });
    expect(response.headers.get("set-cookie")).toContain("rotation=opaque");
    expect(response.headers.has("content-encoding")).toBe(false);
    expect(response.headers.has("content-length")).toBe(false);
    expect(upstream).toHaveBeenCalledOnce();
  });

  it("fails closed for missing production authority and upstream transport failure", async () => {
    const missing = await proxyApiRequest(new Request("https://djaybot.test/public/status"), {
      allowDevelopmentFallback: false,
      prefix: "public",
      path: ["status"],
    });
    expect(missing.status).toBe(503);
    await expect(missing.json()).resolves.toEqual({ status: "api_route_unavailable" });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    const unavailable = await proxyApiRequest(new Request("https://djaybot.test/public/status"), {
      apiAppUrl: "https://api.internal.test",
      allowDevelopmentFallback: false,
      prefix: "public",
      path: ["status"],
    });
    expect(unavailable.status).toBe(503);
    await expect(unavailable.json()).resolves.toEqual({ status: "api_route_unavailable" });
  });

  it("rejects an oversized browser body before contacting the API", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    const response = await proxyApiRequest(new Request("https://app.djaybot.test/tenant/knowledge", {
      method: "POST",
      headers: { "Content-Length": String(256 * 1024 + 1) },
      body: "small",
    }), {
      apiAppUrl: "https://api.internal.test",
      allowDevelopmentFallback: false,
      prefix: "tenant",
      path: ["knowledge"],
    });
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ status: "request_too_large" });
    expect(upstream).not.toHaveBeenCalled();
  });

  it("reports ready only for a configured, reachable, ready API", async () => {
    const upstream = vi.fn().mockResolvedValue(Response.json({ status: "ready", app: "api" }));
    vi.stubGlobal("fetch", upstream);
    const ready = await apiProxyReadiness("https://api.internal.test", false, "tenant-web");
    expect(ready.status).toBe(200);
    await expect(ready.json()).resolves.toEqual({ status: "ready", app: "tenant-web" });
    expect(upstream).toHaveBeenCalledWith("https://api.internal.test/api/health/ready", expect.objectContaining({ cache: "no-store" }));

    const missing = await apiProxyReadiness(undefined, false, "public-site");
    expect(missing.status).toBe(503);
    await expect(missing.json()).resolves.toEqual({ status: "unavailable", app: "public-site" });

    upstream.mockResolvedValueOnce(Response.json({ status: "unavailable", app: "api" }, { status: 503 }));
    const unavailable = await apiProxyReadiness("https://api.internal.test", false, "platform-master");
    expect(unavailable.status).toBe(503);
  });
});
