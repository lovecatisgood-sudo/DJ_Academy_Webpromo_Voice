import { describe, expect, it } from "vitest";
import { VoiceLifecycleError, VoiceSessionLifecycle, voiceClientMessageSchema, voiceServerMessageSchema, voiceSessionGrantSchema } from "./index";

const grant = {
  sessionId: "10000000-0000-4000-8000-000000000001",
  sessionGrant: `djay_voice_grant_${"a".repeat(48)}`,
  gatewayUrl: "wss://voice.example.test/v1/connect",
  protocolVersion: "djay.voice.v1",
  capabilityProfile: "voice_gen1",
  publicLabel: "First-Generation Voice Engine",
  expiresAt: "2026-07-15T12:00:00.000Z",
  maxCallSeconds: 900,
  locale: "th",
  greeting: "สวัสดีครับ นี่คือผู้ช่วยอัตโนมัติของเรา",
  reconnectPolicy: { maxAttempts: 3, backoffMs: 500, resumeWindowSeconds: 30 },
  automatedAgentDisclosure: { required: true, text: "This is an automated voice assistant." },
  recording: { enabled: false, disclosure: null },
} as const;

describe("opaque voice protocol", () => {
  it("accepts the provider-neutral Gen1 public grant", () => {
    expect(voiceSessionGrantSchema.parse(grant)).toEqual(grant);
    expect(JSON.stringify(grant)).not.toMatch(/provider|model|vendor|token|cost/i);
  });

  it("rejects mismatched public generation labels and recording disclosure", () => {
    expect(() => voiceSessionGrantSchema.parse({ ...grant, publicLabel: "Second-Generation Voice Engine" })).toThrow();
    expect(() => voiceSessionGrantSchema.parse({ ...grant, recording: { enabled: true, disclosure: null } })).toThrow();
  });

  it("keeps client and server messages on an explicit allow-list", () => {
    expect(voiceClientMessageSchema.parse({ type: "speech.started", messageId: grant.sessionId }).type).toBe("speech.started");
    const error = voiceServerMessageSchema.parse({ type: "error", messageId: grant.sessionId, code: "media_unavailable", retryable: true });
    expect(error.type === "error" ? error.code : null).toBe("media_unavailable");
    expect(() => voiceServerMessageSchema.parse({ type: "error", messageId: grant.sessionId, code: "upstream_model_failed", retryable: false })).toThrow();
  });
});

describe("voice session lifecycle", () => {
  it("requires disclosure, records barge-in and produces one rounded settlement intent", () => {
    const lifecycle = new VoiceSessionLifecycle(30);
    lifecycle.apply({ type: "connected", atMs: 1_000 });
    expect(() => lifecycle.apply({ type: "assistant_speech_started", atMs: 1_100 })).toThrowError(new VoiceLifecycleError("disclosure_required"));
    lifecycle.apply({ type: "disclosure_completed", atMs: 1_200 });
    lifecycle.apply({ type: "assistant_speech_started", atMs: 2_000 });
    lifecycle.apply({ type: "customer_speech_started", atMs: 2_200 });
    lifecycle.apply({ type: "transport_lost", atMs: 30_000 });
    lifecycle.apply({ type: "reconnected", atMs: 35_000 });
    const ended = lifecycle.apply({ type: "ended", atMs: 62_001, reason: "completed" });
    expect(ended).toMatchObject({ state: "ended", interruptionCount: 1, reconnectCount: 1,
      settlement: { disposition: "settle", elapsedSeconds: 62, customerMinutes: 2 } });
    expect(() => lifecycle.apply({ type: "ended", atMs: 63_000, reason: "completed" })).toThrowError("invalid_transition");
  });

  it("releases an unconnected grant and rejects late reconnect", () => {
    const unused = new VoiceSessionLifecycle(30);
    expect(unused.apply({ type: "ended", atMs: 500, reason: "grant_expired" }).settlement).toEqual({ disposition: "release", elapsedSeconds: 0, customerMinutes: 0 });
    const disconnected = new VoiceSessionLifecycle(10);
    disconnected.apply({ type: "connected", atMs: 1_000 });
    disconnected.apply({ type: "transport_lost", atMs: 2_000 });
    expect(() => disconnected.apply({ type: "reconnected", atMs: 12_001 })).toThrowError("reconnect_window_expired");
  });
});
