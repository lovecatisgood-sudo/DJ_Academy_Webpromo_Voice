import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import {
  attachVoiceWebSocketGateway,
  VoiceGatewayRegistry,
  type VoiceMediaFactory,
  type VoiceMediaInput,
  type VoiceSessionAuthority,
} from "./transport";

const sessionId = "10000000-0000-4000-8000-000000000001";
const connectionId = "10000000-0000-4000-8000-000000000002";
const grant = `djay_voice_grant_${"a".repeat(48)}`;
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

function authority(): VoiceSessionAuthority & {
  authorize: ReturnType<typeof vi.fn>; heartbeat: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>; finish: ReturnType<typeof vi.fn>;
} {
  return {
    authorize: vi.fn().mockResolvedValue({
      sessionId, capabilityProfile: "voice_gen1", locale: "en", maxCallSeconds: 900,
      resumeWindowSeconds: 30, replayed: false, route: null,
    }),
    heartbeat: vi.fn().mockResolvedValue({ alive: true, runtimeMode: "running" }),
    disconnect: vi.fn().mockResolvedValue(true),
    finish: vi.fn().mockResolvedValue({ status: "ended" }),
  };
}

async function harness(input: {
  authority?: VoiceSessionAuthority; mediaFactory: VoiceMediaFactory; maxSessions?: number;
  heartbeatIntervalMs?: number; silenceWarningAfterMs?: number; idleTimeoutMs?: number;
}) {
  const server = createServer((_request, response) => { response.writeHead(404); response.end(); });
  servers.push(server);
  const registry = new VoiceGatewayRegistry(input.maxSessions ?? 2);
  attachVoiceWebSocketGateway({
    server, authority: input.authority ?? authority(), mediaFactory: input.mediaFactory, registry,
    ...(input.heartbeatIntervalMs ? { heartbeatIntervalMs: input.heartbeatIntervalMs } : {}),
    ...(input.silenceWarningAfterMs ? { silenceWarningAfterMs: input.silenceWarningAfterMs } : {}),
    ...(input.idleTimeoutMs ? { idleTimeoutMs: input.idleTimeoutMs } : {}),
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test_server_unavailable");
  return { registry, url: `ws://127.0.0.1:${address.port}/v1/connect` };
}

async function socket(url: string) {
  const result = new WebSocket(url, "djay.voice.v1", { origin: "https://merchant.example" });
  await once(result, "open");
  return result;
}

function nextMessage(websocket: WebSocket) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    websocket.once("message", (data) => {
      try { resolve(JSON.parse(data.toString()) as Record<string, unknown>); } catch (error) { reject(error); }
    });
  });
}

function connect(websocket: WebSocket, reconnectAttempt = 0) {
  websocket.send(JSON.stringify({
    type: "session.connect", messageId: crypto.randomUUID(), sessionId, sessionGrant: grant,
    connectionId, protocolVersion: "djay.voice.v1", inputAudioEncoding: "pcm_s16le_16000", reconnectAttempt,
  }));
}

describe("voice WebSocket transport", () => {
  it("never admits more than its process capacity", () => {
    const registry = new VoiceGatewayRegistry(1);
    expect(registry.tryAcquire()).toBe(true);
    expect(registry.tryAcquire()).toBe(false);
    expect(registry.snapshot()).toMatchObject({ activeSessions: 1, maxSessions: 1 });
    registry.release(); expect(registry.tryAcquire()).toBe(true);
    registry.pause(); registry.release(); expect(registry.tryAcquire()).toBe(false);
  });

  it("owns authorization, disclosure, interruption, media and terminal settlement", async () => {
    const accepted: VoiceMediaInput[] = [];
    let emit: Parameters<VoiceMediaFactory["open"]>[0]["onEvent"] | null = null;
    const mediaFactory: VoiceMediaFactory = {
      async open(input) {
        emit = input.onEvent;
        return { async accept(message) { accepted.push(message); }, async close() {} };
      },
    };
    const auth = authority();
    const { url, registry } = await harness({ authority: auth, mediaFactory });
    const websocket = await socket(url);
    const connectedMessage = nextMessage(websocket); connect(websocket);
    await expect(connectedMessage).resolves.toMatchObject({
      type: "session.connected", sessionId, resumed: false, outputAudioEncoding: "pcm_s16le_24000",
    });
    expect(registry.snapshot().activeSessions).toBe(1);

    websocket.send(JSON.stringify({ type: "session.ready", messageId: crypto.randomUUID() }));
    await vi.waitFor(() => expect(accepted).toHaveLength(1));
    await emit!({ type: "disclosure.completed" });
    const speaking = nextMessage(websocket);
    await emit!({ type: "assistant.speech.started" });
    await expect(speaking).resolves.toMatchObject({ type: "assistant.speech.started" });

    const interrupted = nextMessage(websocket);
    websocket.send(JSON.stringify({ type: "speech.started", messageId: crypto.randomUUID() }));
    await expect(interrupted).resolves.toMatchObject({ type: "assistant.speech.interrupted" });
    websocket.send(JSON.stringify({
      type: "audio.chunk", messageId: crypto.randomUUID(), sequence: 0, audioBase64: "AQID",
    }));
    await vi.waitFor(() => expect(accepted.some((message) => message.type === "audio.chunk")).toBe(true));

    const ended = nextMessage(websocket);
    websocket.send(JSON.stringify({ type: "session.end", messageId: crypto.randomUUID(), reason: "customer_ended" }));
    await expect(ended).resolves.toMatchObject({ type: "session.ended", reason: "completed" });
    await once(websocket, "close");
    expect(auth.finish).toHaveBeenCalledWith(expect.objectContaining({ sessionId, connectionId, terminalReason: "customer_ended" }));
    expect(auth.disconnect).not.toHaveBeenCalled();
    expect(registry.snapshot().activeSessions).toBe(0);
  });

  it("keeps a restricted Second-Generation route out of every browser message", async () => {
    const auth = authority();
    auth.authorize.mockResolvedValue({
      sessionId, capabilityProfile: "voice_gen2", locale: "en", maxCallSeconds: 900,
      resumeWindowSeconds: 30, replayed: false,
      route: { providerKey: "restricted_provider", modelKey: "restricted_model", regionKey: "restricted_region" },
    });
    const { url } = await harness({
      authority: auth,
      mediaFactory: { async open() { return { async accept() {}, async close() {} }; } },
    });
    const websocket = await socket(url);
    const connected = nextMessage(websocket); connect(websocket);
    const message = await connected;
    expect(message).toMatchObject({ type: "session.connected", sessionId });
    expect(JSON.stringify(message)).not.toMatch(/restricted_provider|restricted_model|restricted_region|route/i);
    const ended = nextMessage(websocket);
    websocket.send(JSON.stringify({ type: "session.end", messageId: crypto.randomUUID(), reason: "customer_ended" }));
    await ended; await once(websocket, "close");
  });

  it("disconnects abnormal transport loss for bounded reconnect", async () => {
    const mediaFactory: VoiceMediaFactory = {
      async open() { return { async accept() {}, async close() {} }; },
    };
    const auth = authority();
    const { url, registry } = await harness({ authority: auth, mediaFactory });
    const websocket = await socket(url);
    const connected = nextMessage(websocket); connect(websocket); await connected;
    websocket.terminate();
    await once(websocket, "close");
    await vi.waitFor(() => expect(auth.disconnect).toHaveBeenCalledWith({ sessionId, connectionId }));
    expect(auth.finish).not.toHaveBeenCalled();
    expect(registry.snapshot().activeSessions).toBe(0);
  });

  it("fails closed and releases authority when media cannot open", async () => {
    const auth = authority();
    const { url, registry } = await harness({
      authority: auth,
      mediaFactory: { async open() { throw new Error("unavailable"); } },
    });
    const websocket = await socket(url);
    const closed = once(websocket, "close");
    const error = nextMessage(websocket); connect(websocket);
    await expect(error).resolves.toMatchObject({ type: "error", code: "media_unavailable", retryable: true });
    await closed;
    expect(auth.finish).toHaveBeenCalledWith(expect.objectContaining({ terminalReason: "unavailable" }));
    expect(registry.snapshot().activeSessions).toBe(0);
  });

  it("ends an active session when the durable authority enters emergency stop", async () => {
    const auth = authority();
    auth.heartbeat.mockResolvedValue({ alive: false, runtimeMode: "emergency_stop" });
    const mediaFactory: VoiceMediaFactory = {
      async open() { return { async accept() {}, async close() {} }; },
    };
    const { url } = await harness({ authority: auth, mediaFactory, heartbeatIntervalMs: 10 });
    const websocket = await socket(url);
    const connected = nextMessage(websocket); connect(websocket);
    await expect(connected).resolves.toMatchObject({ type: "session.connected" });
    await expect(nextMessage(websocket)).resolves.toMatchObject({ type: "session.ended", reason: "unavailable" });
    await vi.waitFor(() => expect(auth.finish).toHaveBeenCalledWith(expect.objectContaining({
      sessionId, connectionId, terminalReason: "unavailable",
    })));
  });

  it("warns on silence and settles an idle session exactly once", async () => {
    const auth = authority();
    const { url } = await harness({
      authority: auth,
      mediaFactory: { async open() { return { async accept() {}, async close() {} }; } },
      silenceWarningAfterMs: 20, idleTimeoutMs: 60,
    });
    const websocket = await socket(url);
    const connected = nextMessage(websocket); connect(websocket); await connected;
    const warning = nextMessage(websocket);
    websocket.send(JSON.stringify({ type: "session.ready", messageId: crypto.randomUUID() }));
    await expect(warning).resolves.toMatchObject({ type: "silence.warning", remainingSeconds: 1 });
    await expect(nextMessage(websocket)).resolves.toMatchObject({ type: "session.ended", reason: "idle_timeout" });
    await once(websocket, "close");
    expect(auth.finish).toHaveBeenCalledTimes(1);
    expect(auth.finish).toHaveBeenCalledWith(expect.objectContaining({ terminalReason: "idle_timeout" }));
  });

  it("maps authority outages to a retryable safe error without leaking capacity", async () => {
    const auth = authority(); auth.authorize.mockRejectedValue(new Error("restricted_detail"));
    const { url, registry } = await harness({
      authority: auth,
      mediaFactory: { async open() { throw new Error("must_not_open"); } },
    });
    const websocket = await socket(url); const closed = once(websocket, "close");
    const error = nextMessage(websocket); connect(websocket);
    await expect(error).resolves.toMatchObject({ type: "error", code: "session_unavailable", retryable: true });
    await closed;
    expect(auth.finish).not.toHaveBeenCalled(); expect(auth.disconnect).not.toHaveBeenCalled();
    expect(registry.snapshot().activeSessions).toBe(0);
  });

  it("allows a reconnect to retry while disconnect authority is still converging", async () => {
    const auth = authority(); auth.authorize.mockResolvedValue(null);
    const { url, registry } = await harness({
      authority: auth,
      mediaFactory: { async open() { throw new Error("must_not_open"); } },
    });
    const websocket = await socket(url); const closed = once(websocket, "close");
    const error = nextMessage(websocket); connect(websocket, 1);
    await expect(error).resolves.toMatchObject({ type: "error", code: "session_unavailable", retryable: true });
    await closed; expect(registry.snapshot().activeSessions).toBe(0);
  });

  it("fails closed if media attempts ordinary assistant speech before disclosure", async () => {
    let emit: Parameters<VoiceMediaFactory["open"]>[0]["onEvent"] | null = null;
    const auth = authority();
    const { url } = await harness({
      authority: auth,
      mediaFactory: { async open(input) { emit = input.onEvent; return { async accept() {}, async close() {} }; } },
    });
    const websocket = await socket(url); const connected = nextMessage(websocket); connect(websocket); await connected;
    const closed = once(websocket, "close"); const error = nextMessage(websocket);
    await emit!({ type: "assistant.speech.started" });
    await expect(error).resolves.toMatchObject({ type: "error", code: "media_unavailable", retryable: false });
    await closed;
    expect(auth.finish).toHaveBeenCalledWith(expect.objectContaining({ terminalReason: "unavailable" }));
  });

  it("rejects unknown origins, unsupported protocols and non-connect first frames", async () => {
    const mediaFactory: VoiceMediaFactory = { async open() { throw new Error("must_not_open"); } };
    const { url } = await harness({ mediaFactory });
    const badOrigin = new WebSocket(url, "djay.voice.v1");
    const badOriginError = once(badOrigin, "unexpected-response");
    await expect(badOriginError).resolves.toBeDefined();
    const websocket = await socket(url);
    const error = nextMessage(websocket);
    websocket.send(JSON.stringify({ type: "session.ready", messageId: crypto.randomUUID() }));
    await expect(error).resolves.toMatchObject({ type: "error", code: "protocol_unsupported" });
    await once(websocket, "close");
  });
});
