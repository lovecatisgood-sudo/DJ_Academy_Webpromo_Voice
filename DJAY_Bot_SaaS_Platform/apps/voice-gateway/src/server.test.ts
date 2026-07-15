import { describe, expect, it, vi } from "vitest";
import { createVoiceGatewayHandler } from "./server";

const sessionId = "10000000-0000-4000-8000-000000000001";
const connectionId = "10000000-0000-4000-8000-000000000002";
const grant = `djay_voice_grant_${"a".repeat(48)}`;

function request(body: unknown, authorization = `Bearer ${grant}`) {
  return new Request("https://voice.example.test/v1/sessions/connect", {
    method: "POST", headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("voice gateway boundary", () => {
  it("exposes provider-neutral health and aggregate capacity", async () => {
    const handler = createVoiceGatewayHandler({ authorizer: { authorize: vi.fn() }, ready: () => true,
      capacity: () => ({ acceptingNewSessions: true, activeSessions: 2, maxSessions: 10 }) });
    expect(await (await handler(new Request("https://voice.example.test/health/live"))).json()).toEqual({ status: "live" });
    expect(await (await handler(new Request("https://voice.example.test/v1/capacity"))).json()).toEqual({ status: "available", acceptingNewSessions: true, activeSessions: 2, maxSessions: 10 });
  });

  it("authorizes an opaque grant without returning internal routing data", async () => {
    const authorize = vi.fn().mockResolvedValue({ sessionId, capabilityProfile: "voice_gen1", locale: "en", maxCallSeconds: 900, resumeWindowSeconds: 30, replayed: false });
    const handler = createVoiceGatewayHandler({ authorizer: { authorize }, ready: () => true,
      capacity: () => ({ acceptingNewSessions: true, activeSessions: 0, maxSessions: 10 }) });
    const response = await handler(request({ sessionId, origin: "https://merchant.example", protocolVersion: "djay.voice.v1", connectionId }));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({ status: "authorized", sessionId, capabilityProfile: "voice_gen1", resumed: false });
    expect(JSON.stringify(payload)).not.toMatch(/provider|model|vendor|credential|cost/i);
    expect(authorize).toHaveBeenCalledWith(expect.objectContaining({ sessionGrant: grant, sessionId, connectionId }));
  });

  it("fails closed for capacity, invalid grants and unsupported protocol", async () => {
    const unavailable = createVoiceGatewayHandler({ authorizer: { authorize: vi.fn() }, ready: () => true,
      capacity: () => ({ acceptingNewSessions: false, activeSessions: 10, maxSessions: 10 }) });
    expect((await unavailable(request({ sessionId, origin: "https://merchant.example", protocolVersion: "djay.voice.v1", connectionId }))).status).toBe(503);
    const available = createVoiceGatewayHandler({ authorizer: { authorize: vi.fn() }, ready: () => true,
      capacity: () => ({ acceptingNewSessions: true, activeSessions: 0, maxSessions: 10 }) });
    expect((await available(request({ sessionId, origin: "https://merchant.example", protocolVersion: "djay.voice.v1", connectionId }, "Bearer invalid"))).status).toBe(401);
    expect((await available(request({ sessionId, origin: "https://merchant.example", protocolVersion: "djay.voice.v2", connectionId }))).status).toBe(400);
  });
});
