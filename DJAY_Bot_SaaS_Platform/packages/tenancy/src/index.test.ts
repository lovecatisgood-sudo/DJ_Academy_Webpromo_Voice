import { describe, expect, it } from "vitest";
import { createPlatformContext, createSystemContext, createTenantContext } from "./index";

const ids = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  membershipId: "33333333-3333-4333-8333-333333333333",
  sessionId: "44444444-4444-4444-8444-444444444444",
};

describe("request contexts", () => {
  it("constructs a validated immutable tenant context", () => {
    const context = createTenantContext({
      ...ids,
      role: "tenant_master_admin",
      requestId: "request-1234",
    });
    expect(context.kind).toBe("tenant");
    expect(Object.isFrozen(context)).toBe(true);
  });

  it("does not accept unknown browser authority fields", () => {
    expect(() => createTenantContext({
      ...ids,
      role: "tenant_master_admin",
      requestId: "request-1234",
      plan: "voice_advanced_gen2",
    } as never)).toThrow();
  });

  it("keeps platform and system contexts distinct", () => {
    const platform = createPlatformContext({
      platformUserId: ids.userId,
      sessionId: ids.sessionId,
      role: "platform_owner",
      requestId: "request-5678",
    });
    const system = createSystemContext("auth", "request-9012");
    expect(platform.kind).toBe("platform");
    expect(system.kind).toBe("system");
  });
});

