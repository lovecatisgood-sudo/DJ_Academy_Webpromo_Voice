import { describe, expect, it } from "vitest";
import { createVoiceGatewayHandler } from "./server";

describe("voice gateway HTTP boundary", () => {
  it("exposes provider-neutral liveness and aggregate capacity", async () => {
    const handler = createVoiceGatewayHandler({
      ready: () => true,
      capacity: () => ({ acceptingNewSessions: true, activeSessions: 2, maxSessions: 10 }),
    });
    expect(await (await handler(new Request("https://voice.example.test/health/live"))).json()).toEqual({ status: "live" });
    expect(await (await handler(new Request("https://voice.example.test/health/ready"))).json()).toEqual({ status: "ready" });
    expect(await (await handler(new Request("https://voice.example.test/v1/capacity"))).json()).toEqual({
      status: "available", acceptingNewSessions: true, activeSessions: 2, maxSessions: 10,
    });
  });

  it("reports not-ready and does not authorize sessions over HTTP", async () => {
    const handler = createVoiceGatewayHandler({
      ready: () => false,
      capacity: () => ({ acceptingNewSessions: false, activeSessions: 0, maxSessions: 10 }),
    });
    expect((await handler(new Request("https://voice.example.test/health/ready"))).status).toBe(503);
    expect((await handler(new Request("https://voice.example.test/v1/sessions/connect", { method: "POST" }))).status).toBe(404);
  });
});
