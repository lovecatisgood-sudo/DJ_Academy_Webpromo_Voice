import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { z } from "zod";
import { withTenantMutation } from "./tenant-mutation";

function request(url = "https://api.example.test/tenant/example") {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://tenant.example.test" },
    body: JSON.stringify({ planKey: "flowbot_basic" }),
  });
}

const baseResolved = {
  services: {} as never,
  session: {
    userId: "user-1",
    sessionId: "session-1",
    selectedTenantId: "tenant-1",
    reauthenticatedAt: new Date(),
    mfaVerifiedAt: new Date(),
    workspaces: [],
  } as never,
  context: {
    tenantId: "tenant-1",
    userId: "user-1",
    membershipId: "member-1",
    sessionId: "session-1",
    role: "tenant_master_admin",
    requestId: "req-1",
  } as never,
};

describe("withTenantMutation", () => {
  it("returns 404 when the session cannot be resolved", async () => {
    const response = await withTenantMutation(
      request(),
      {
        permission: "billing.checkout",
        assurance: "recent_auth",
        rateLimit: { scope: "test", limit: 10, windowMs: 60_000 },
        bodySchema: z.object({ planKey: z.string() }),
      },
      async () => new Response("ok"),
      { resolve: async () => null, trustedOrigin: async () => true },
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ status: "not_found" });
  });

  it("returns 404 when Origin is untrusted", async () => {
    const resolve = vi.fn(async () => baseResolved);
    const response = await withTenantMutation(
      request(),
      {
        permission: "billing.checkout",
        assurance: "recent_auth",
        rateLimit: { scope: "test", limit: 10, windowMs: 60_000 },
        bodySchema: z.object({ planKey: z.string() }),
      },
      async () => new Response("ok"),
      {
        resolve,
        trustedOrigin: async () => false,
      },
    );
    expect(response.status).toBe(404);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("returns 403 when recent assurance is missing", async () => {
    const response = await withTenantMutation(
      request(),
      {
        permission: "billing.checkout",
        assurance: "recent_auth",
        rateLimit: { scope: "test", limit: 10, windowMs: 60_000 },
        bodySchema: z.object({ planKey: z.string() }),
      },
      async () => new Response("ok"),
      {
        resolve: async () => baseResolved,
        trustedOrigin: async () => true,
        assurance: () => false,
      },
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ status: "reauthentication_required" });
  });

  it("returns 429 when the rate limit is exceeded", async () => {
    const response = await withTenantMutation(
      request(),
      {
        permission: "billing.checkout",
        assurance: "recent_auth",
        rateLimit: { scope: "tenant-billing-checkout", limit: 10, windowMs: 15 * 60 * 1000 },
        bodySchema: z.object({ planKey: z.string() }),
      },
      async () => new Response("ok"),
      {
        resolve: async () => baseResolved,
        trustedOrigin: async () => true,
        assurance: () => true,
        rateLimit: async () => ({ allowed: false, retryAfterSeconds: 30 }),
      },
    );
    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({ status: "rate_limited" });
  });

  it("returns 400 when the body fails Zod validation", async () => {
    const response = await withTenantMutation(
      request(),
      {
        permission: "billing.checkout",
        assurance: "recent_auth",
        rateLimit: { scope: "test", limit: 10, windowMs: 60_000 },
        bodySchema: z.object({ subscriptionId: z.uuid() }).strict(),
      },
      async () => new Response("ok"),
      {
        resolve: async () => baseResolved,
        trustedOrigin: async () => true,
        assurance: () => true,
        rateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }),
        readBody: async () => ({ planKey: "flowbot_basic" }),
      },
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ status: "validation_failed" });
  });

  it("invokes the handler when all guards pass", async () => {
    const handler = vi.fn(async () => Response.json({ status: "ok" }));
    const response = await withTenantMutation(
      request(),
      {
        permission: "billing.checkout",
        assurance: "recent_auth",
        rateLimit: { scope: "test", limit: 10, windowMs: 60_000 },
        bodySchema: z.object({ planKey: z.string() }),
      },
      handler,
      {
        resolve: async () => baseResolved,
        trustedOrigin: async () => true,
        assurance: () => true,
        rateLimit: async (scope, identifier) => {
          expect(scope).toBe("test");
          expect(identifier).toBe("tenant-1:user-1");
          return { allowed: true, retryAfterSeconds: 0 };
        },
        readBody: async () => ({ planKey: "flowbot_basic" }),
      },
    );
    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
  });
});
