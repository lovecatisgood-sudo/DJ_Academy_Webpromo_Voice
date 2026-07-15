import { randomUUID } from "node:crypto";
import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import {
  VoiceLifecycleError,
  VoiceSessionLifecycle,
  type VoiceClientMessage,
  type VoiceInputAudioEncoding,
  type VoiceServerMessage,
  type VoiceTerminalReason,
  voiceClientMessageSchema,
  voiceProtocolVersion,
  voiceServerMessageSchema,
} from "@djay/voice-runtime";
import { WebSocket, WebSocketServer, type RawData } from "ws";

export type AuthorizedVoiceSession = Readonly<{
  sessionId: string;
  capabilityProfile: "voice_gen1" | "voice_gen2";
  locale: "th" | "en";
  maxCallSeconds: number;
  resumeWindowSeconds: number;
  replayed: boolean;
}>;

export interface VoiceSessionAuthority {
  authorize(input: Readonly<{
    sessionGrant: string;
    sessionId: string;
    origin: string;
    protocolVersion: typeof voiceProtocolVersion;
    connectionId: string;
  }>): Promise<AuthorizedVoiceSession | null>;
  disconnect(input: Readonly<{ sessionId: string; connectionId: string }>): Promise<boolean>;
  finish(input: Readonly<{
    sessionId: string;
    connectionId: string;
    elapsedSeconds: number;
    terminalReason: VoiceTerminalReason;
  }>): Promise<unknown>;
}

export type VoiceMediaInput = Exclude<VoiceClientMessage, { type: "session.connect" | "session.end" }>;
export type VoiceMediaEvent = Readonly<
  | { type: "disclosure.completed" }
  | { type: "customer.speech.started" }
  | { type: "audio.chunk"; sequence: number; audioBase64: string }
  | { type: "assistant.speech.started" }
  | { type: "assistant.speech.ended" }
  | { type: "silence.warning"; remainingSeconds: number }
  | { type: "transcript.delta"; speaker: "customer" | "agent"; text: string }
  | { type: "action.status"; actionId: string; status: "proposed" | "succeeded" | "failed" }
  | { type: "session.ended"; reason: Exclude<VoiceTerminalReason, "customer_ended" | "grant_expired"> }
  | { type: "error"; code: "media_unavailable" | "session_unavailable"; retryable: boolean }
>;

export interface VoiceMediaSession {
  accept(message: VoiceMediaInput): Promise<void>;
  close(reason: VoiceTerminalReason): Promise<void>;
}

export interface VoiceMediaFactory {
  open(input: Readonly<{
    session: AuthorizedVoiceSession;
    inputAudioEncoding: VoiceInputAudioEncoding;
    onEvent: (event: VoiceMediaEvent) => Promise<void>;
  }>): Promise<VoiceMediaSession>;
}

export class VoiceGatewayRegistry {
  private active = 0;
  private accepting = true;

  constructor(readonly maxSessions: number) {}

  snapshot() {
    return { acceptingNewSessions: this.accepting, activeSessions: this.active, maxSessions: this.maxSessions };
  }

  tryAcquire() {
    if (!this.accepting || this.active >= this.maxSessions) return false;
    this.active += 1;
    return true;
  }

  release() { this.active = Math.max(0, this.active - 1); }
  pause() { this.accepting = false; }
}

function safeOrigin(request: IncomingMessage) {
  const value = request.headers.origin;
  if (!value || Array.isArray(value)) return null;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.origin === value ? value : null;
  } catch { return null; }
}

function rejectUpgrade(socket: Duplex, status: number, label: string) {
  socket.end(`HTTP/1.1 ${status} ${label}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

function decode(raw: RawData) {
  return JSON.parse(typeof raw === "string" ? raw : raw.toString("utf8")) as unknown;
}

export function attachVoiceWebSocketGateway(input: Readonly<{
  server: Server;
  authority: VoiceSessionAuthority;
  mediaFactory: VoiceMediaFactory;
  registry: VoiceGatewayRegistry;
  path?: string;
  connectTimeoutMs?: number;
}>) {
  const path = input.path ?? "/v1/connect";
  const websocketServer = new WebSocketServer({ noServer: true, maxPayload: 300_000 });
  const sockets = new Set<WebSocket>();

  input.server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", "http://voice-gateway.invalid");
    if (url.pathname !== path || url.search || !safeOrigin(request)) {
      rejectUpgrade(socket, 404, "Not Found"); return;
    }
    const protocols = String(request.headers["sec-websocket-protocol"] ?? "").split(",").map((item) => item.trim());
    if (!protocols.includes(voiceProtocolVersion)) {
      rejectUpgrade(socket, 426, "Upgrade Required"); return;
    }
    websocketServer.handleUpgrade(request, socket, head, (websocket) => {
      websocketServer.emit("connection", websocket, request);
    });
  });

  websocketServer.on("connection", (socket, request) => {
    sockets.add(socket);
    const origin = safeOrigin(request);
    if (!origin) { socket.close(4400, "protocol_unsupported"); return; }
    let authorized: AuthorizedVoiceSession | null = null;
    let connectionId: string | null = null;
    let media: VoiceMediaSession | null = null;
    let lifecycle: VoiceSessionLifecycle | null = null;
    let ready = false;
    let lastInputSequence = -1;
    let admissionHeld = false;
    let terminal = false;
    let operation = Promise.resolve();
    let durationTimer: ReturnType<typeof setTimeout> | null = null;
    let connectedAtMs = 0;

    const send = (message: VoiceServerMessage) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(voiceServerMessageSchema.parse(message)));
    };
    const sendError = (code: Extract<VoiceServerMessage, { type: "error" }>["code"], retryable: boolean) => {
      send({ type: "error", messageId: randomUUID(), code, retryable });
    };
    const releaseAdmission = () => {
      if (admissionHeld) { admissionHeld = false; input.registry.release(); }
    };
    const elapsedSeconds = () => connectedAtMs ? Math.max(0, Math.ceil((Date.now() - connectedAtMs) / 1000)) : 0;

    const finish = async (reason: VoiceTerminalReason, publicReason: Extract<VoiceServerMessage, { type: "session.ended" }>["reason"]) => {
      if (terminal || !authorized || !connectionId) return;
      terminal = true;
      if (durationTimer) clearTimeout(durationTimer);
      try { lifecycle?.apply({ type: "ended", atMs: Date.now(), reason }); } catch { /* database authority remains terminal source */ }
      try { await media?.close(reason); } catch { /* terminal settlement still runs */ }
      try {
        await input.authority.finish({ sessionId: authorized.sessionId, connectionId, elapsedSeconds: elapsedSeconds(), terminalReason: reason });
        send({ type: "session.ended", messageId: randomUUID(), reason: publicReason });
      } catch { sendError("session_unavailable", true); }
      releaseAdmission();
      if (socket.readyState === WebSocket.OPEN) socket.close(1000, "session_ended");
    };

    const processMediaEvent = async (event: VoiceMediaEvent) => {
      if (!authorized || terminal || !lifecycle) return;
      switch (event.type) {
        case "disclosure.completed":
          lifecycle.apply({ type: "disclosure_completed", atMs: Date.now() }); break;
        case "customer.speech.started": {
          const interruptions = lifecycle.snapshot.interruptionCount;
          lifecycle.apply({ type: "customer_speech_started", atMs: Date.now() });
          if (lifecycle.snapshot.interruptionCount > interruptions) {
            send({ type: "assistant.speech.interrupted", messageId: randomUUID() });
          }
          break;
        }
        case "assistant.speech.started":
          lifecycle.apply({ type: "assistant_speech_started", atMs: Date.now() });
          send({ type: event.type, messageId: randomUUID() }); break;
        case "assistant.speech.ended":
          lifecycle.apply({ type: "assistant_speech_ended", atMs: Date.now() });
          send({ type: event.type, messageId: randomUUID() }); break;
        case "audio.chunk":
          send({ ...event, messageId: randomUUID(), outputAudioEncoding: "pcm_s16le_24000" }); break;
        case "silence.warning": case "transcript.delta": case "action.status":
          send({ ...event, messageId: randomUUID() }); break;
        case "session.ended":
          await finish(event.reason, event.reason); break;
        case "error":
          sendError(event.code, event.retryable);
          await finish("unavailable", "unavailable"); break;
      }
    };
    const onMediaEvent = async (event: VoiceMediaEvent) => {
      try { await processMediaEvent(event); }
      catch {
        sendError("media_unavailable", false);
        await finish("unavailable", "unavailable");
      }
    };

    const connect = async (message: Extract<VoiceClientMessage, { type: "session.connect" }>) => {
      if (authorized || connectionId) throw new VoiceLifecycleError("invalid_transition");
      if (!input.registry.tryAcquire()) {
        sendError("capacity_unavailable", true); socket.close(4429, "capacity_unavailable"); return;
      }
      admissionHeld = true;
      connectionId = message.connectionId;
      let result: AuthorizedVoiceSession | null;
      try {
        result = await input.authority.authorize({
          sessionGrant: message.sessionGrant, sessionId: message.sessionId, origin,
          protocolVersion: message.protocolVersion, connectionId: message.connectionId,
        });
      } catch {
        sendError("session_unavailable", true); releaseAdmission(); socket.close(1011, "session_unavailable"); return;
      }
      if (!result || result.sessionId !== message.sessionId) {
        sendError("session_unavailable", message.reconnectAttempt > 0);
        releaseAdmission(); socket.close(4404, "session_unavailable"); return;
      }
      authorized = result;
      connectedAtMs = Date.now();
      lifecycle = new VoiceSessionLifecycle(result.resumeWindowSeconds);
      lifecycle.apply({ type: "connected", atMs: Date.now() });
      try {
        media = await input.mediaFactory.open({ session: result, inputAudioEncoding: message.inputAudioEncoding, onEvent: onMediaEvent });
      } catch {
        sendError("media_unavailable", true);
        await finish("unavailable", "unavailable"); return;
      }
      send({
        type: "session.connected", messageId: randomUUID(), sessionId: result.sessionId,
        resumed: message.reconnectAttempt > 0, outputAudioEncoding: "pcm_s16le_24000",
      });
      durationTimer = setTimeout(() => { void finish("time_limit", "time_limit"); }, result.maxCallSeconds * 1000);
    };

    const handle = async (raw: RawData, isBinary: boolean) => {
      if (isBinary) { sendError("protocol_unsupported", false); socket.close(4400, "protocol_unsupported"); return; }
      let message: VoiceClientMessage;
      try { message = voiceClientMessageSchema.parse(decode(raw)); }
      catch { sendError("protocol_unsupported", false); socket.close(4400, "protocol_unsupported"); return; }
      if (message.type === "session.connect") { await connect(message); return; }
      if (!authorized || !connectionId || !media || !lifecycle) throw new VoiceLifecycleError("invalid_transition");
      if (message.type === "session.end") {
        await finish("customer_ended", "completed"); return;
      }
      if (message.type === "session.ready") {
        if (ready) throw new VoiceLifecycleError("invalid_transition");
        ready = true; await media.accept(message); return;
      }
      if (!ready) throw new VoiceLifecycleError("invalid_transition");
      if (message.type === "audio.chunk") {
        if (message.sequence !== lastInputSequence + 1) throw new VoiceLifecycleError("invalid_transition");
        lastInputSequence = message.sequence;
      }
      if (message.type === "speech.started") {
        const interruptions = lifecycle.snapshot.interruptionCount;
        lifecycle.apply({ type: "customer_speech_started", atMs: Date.now() });
        if (lifecycle.snapshot.interruptionCount > interruptions) {
          send({ type: "assistant.speech.interrupted", messageId: randomUUID() });
        }
      }
      await media.accept(message);
    };

    const connectTimer = setTimeout(() => {
      if (!authorized) { sendError("grant_expired", false); socket.close(4408, "connect_timeout"); }
    }, input.connectTimeoutMs ?? 5_000);

    socket.on("message", (raw, isBinary) => {
      operation = operation.then(() => handle(raw, isBinary)).catch(() => {
        sendError("protocol_unsupported", false); socket.close(4400, "protocol_unsupported");
      });
    });
    socket.on("close", () => {
      sockets.delete(socket); clearTimeout(connectTimer);
      if (durationTimer) clearTimeout(durationTimer);
      operation = operation.then(async () => {
        if (authorized && connectionId && !terminal) {
          try { lifecycle?.apply({ type: "transport_lost", atMs: Date.now() }); } catch { /* close remains idempotent */ }
          try { await media?.close("unavailable"); } catch { /* disconnect still runs */ }
          try { await input.authority.disconnect({ sessionId: authorized.sessionId, connectionId }); } catch { /* reaper owns eventual cleanup */ }
        }
        releaseAdmission();
      });
    });
  });

  return {
    close() {
      input.registry.pause();
      for (const socket of sockets) socket.close(1012, "service_restart");
      websocketServer.close();
    },
  };
}
