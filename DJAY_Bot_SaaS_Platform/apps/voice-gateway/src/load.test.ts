import { once } from "node:events";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { createVoiceGatewayHandler } from "./server";
import {
  attachVoiceWebSocketGateway,
  VoiceGatewayRegistry,
  type VoiceMediaFactory,
  type VoiceSessionAuthority,
} from "./transport";

const servers = new Set<ReturnType<typeof createServer>>();

afterEach(async () => {
  await Promise.all([...servers].map((server) => new Promise<void>((resolve) => {
    if (!server.listening) { resolve(); return; }
    server.close(() => resolve());
  })));
  servers.clear();
});

function boundedInteger(name: string, fallback: number, minimum: number, maximum: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`${name}_invalid`);
  return value;
}

async function waitFor(predicate: () => boolean, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("voice_load_wait_timeout");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe("Voice gateway production-like local capacity drill", () => {
  it("saturates, rejects safely, recovers, fails media closed, and drains shutdown", { timeout: 30_000 }, async () => {
    const capacity = boundedInteger("P8_VOICE_LOAD_CAPACITY", 40, 4, 200);
    const attempts = boundedInteger("P8_VOICE_LOAD_ATTEMPTS", 120, capacity * 2, 1_000);
    const registry = new VoiceGatewayRegistry(capacity);
    const finished: string[] = []; const disconnected: string[] = [];
    let mediaFailure = false; let mediaOpened = 0; let mediaClosed = 0;
    const authority: VoiceSessionAuthority = {
      async authorize(input) {
        await new Promise((resolve) => setTimeout(resolve, 8));
        return {
          sessionId: input.sessionId, capabilityProfile: "voice_gen2", locale: "en",
          maxCallSeconds: 900, resumeWindowSeconds: 30, replayed: false,
          route: {
            providerKey: "restricted_load_provider", modelKey: "restricted_load_model",
            regionKey: "restricted_load_region",
          },
        };
      },
      async heartbeat() { return { alive: true, runtimeMode: "running" }; },
      async disconnect(input) { disconnected.push(input.sessionId); return true; },
      async finish(input) { finished.push(`${input.sessionId}:${input.terminalReason}`); return { status: "ended" }; },
    };
    const mediaFactory: VoiceMediaFactory = {
      async open() {
        mediaOpened += 1;
        if (mediaFailure) throw new Error("injected_media_failure");
        let closed = false;
        return {
          async accept() {},
          async close() { if (!closed) { closed = true; mediaClosed += 1; } },
        };
      },
    };
    const server = createServer((_request, response) => { response.writeHead(404); response.end(); });
    servers.add(server);
    const gateway = attachVoiceWebSocketGateway({
      server, authority, mediaFactory, registry,
      heartbeatIntervalMs: 60_000, silenceWarningAfterMs: 60_000, idleTimeoutMs: 120_000,
    });
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("voice_load_server_unavailable");
    const url = `ws://127.0.0.1:${address.port}/v1/connect`;
    const browserMessages: string[] = [];

    async function openAttempt(index: number) {
      const websocket = new WebSocket(url, "djay.voice.v1", { origin: "https://load-merchant.example" });
      const closed = once(websocket, "close"); const startedAt = performance.now();
      await once(websocket, "open");
      const sessionId = randomUUID(); const connectionId = randomUUID();
      const message = once(websocket, "message");
      websocket.send(JSON.stringify({
        type: "session.connect", messageId: randomUUID(), sessionId,
        sessionGrant: `djay_voice_grant_${index.toString(36).padStart(48, "a")}`,
        connectionId, protocolVersion: "djay.voice.v1",
        inputAudioEncoding: "pcm_s16le_16000", reconnectAttempt: 0,
      }));
      const [raw] = await message; const serialized = raw.toString(); browserMessages.push(serialized);
      return {
        websocket, closed, sessionId, connectedMs: performance.now() - startedAt,
        message: JSON.parse(serialized) as { type: string; code?: string },
      };
    }

    const heapBefore = process.memoryUsage().heapUsed;
    const firstWave = await Promise.all(Array.from({ length: attempts }, (_, index) => openAttempt(index)));
    const admitted = firstWave.filter((item) => item.message.type === "session.connected");
    const rejected = firstWave.filter((item) => item.message.type === "error");
    expect(admitted).toHaveLength(capacity);
    expect(rejected).toHaveLength(attempts - capacity);
    expect(rejected.every((item) => item.message.code === "capacity_unavailable")).toBe(true);
    expect(registry.snapshot()).toEqual({ acceptingNewSessions: true, activeSessions: capacity, maxSessions: capacity });
    const capacityResponse = await createVoiceGatewayHandler({
      ready: () => true, capacity: () => registry.snapshot(),
    })(new Request("https://voice.example.test/v1/capacity"));
    expect(await capacityResponse.json()).toEqual({
      status: "available", acceptingNewSessions: true, activeSessions: capacity, maxSessions: capacity,
    });
    await Promise.all(rejected.map((item) => item.closed));
    for (const item of admitted) {
      const ended = once(item.websocket, "message");
      item.websocket.send(JSON.stringify({ type: "session.end", messageId: randomUUID(), reason: "customer_ended" }));
      const [raw] = await ended; browserMessages.push(raw.toString());
    }
    await Promise.all(admitted.map((item) => item.closed));
    await waitFor(() => registry.snapshot().activeSessions === 0);
    expect(finished.filter((item) => item.endsWith(":customer_ended"))).toHaveLength(capacity);
    expect(disconnected).toHaveLength(0);

    const recoveryWave = await Promise.all(Array.from({ length: capacity }, (_, index) => openAttempt(attempts + index)));
    expect(recoveryWave.every((item) => item.message.type === "session.connected")).toBe(true);
    for (const item of recoveryWave) {
      const ended = once(item.websocket, "message");
      item.websocket.send(JSON.stringify({ type: "session.end", messageId: randomUUID(), reason: "customer_ended" }));
      const [raw] = await ended; browserMessages.push(raw.toString());
    }
    await Promise.all(recoveryWave.map((item) => item.closed));
    await waitFor(() => registry.snapshot().activeSessions === 0);

    mediaFailure = true;
    const failureWave = await Promise.all(Array.from({ length: capacity }, (_, index) => openAttempt(attempts + capacity + index)));
    expect(failureWave.every((item) => item.message.type === "error" && item.message.code === "media_unavailable")).toBe(true);
    await Promise.all(failureWave.map((item) => item.closed));
    await waitFor(() => registry.snapshot().activeSessions === 0);
    expect(finished.filter((item) => item.endsWith(":unavailable"))).toHaveLength(capacity);

    mediaFailure = false;
    const drainCount = Math.min(10, capacity);
    const drainWave = await Promise.all(Array.from({ length: drainCount }, (_, index) => openAttempt(attempts + capacity * 2 + index)));
    expect(drainWave.every((item) => item.message.type === "session.connected")).toBe(true);
    gateway.close();
    await Promise.all(drainWave.map((item) => item.closed));
    await waitFor(() => registry.snapshot().activeSessions === 0 && disconnected.length === drainCount);
    expect(registry.snapshot()).toEqual({ acceptingNewSessions: false, activeSessions: 0, maxSessions: capacity });
    expect(browserMessages.join("\n")).not.toMatch(/restricted_load_|provider|model|region|route/i);
    expect(mediaClosed).toBe(capacity * 2 + drainCount);

    const connectionTimes = admitted.map((item) => item.connectedMs).sort((a, b) => a - b);
    const p95ConnectedMs = connectionTimes[Math.min(connectionTimes.length - 1, Math.ceil(connectionTimes.length * 0.95) - 1)]!;
    expect(p95ConnectedMs).toBeLessThan(5_000);
    console.info(JSON.stringify({
      status: "passed", attempts, capacity, admitted: admitted.length,
      safelyRejected: rejected.length, recovered: recoveryWave.length,
      mediaFailuresSettled: failureWave.length, shutdownDrained: drainCount,
      peakActiveSessions: capacity, finalActiveSessions: registry.snapshot().activeSessions,
      p95ConnectedMs: Math.round(p95ConnectedMs),
      heapDeltaBytes: process.memoryUsage().heapUsed - heapBefore,
    }));
  });
});
