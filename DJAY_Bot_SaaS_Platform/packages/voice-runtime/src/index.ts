import { voiceCapabilityProfileSchema } from "@djay/shared";
import { z } from "zod";

export const voiceProtocolVersion = "djay.voice.v1" as const;

const gatewayUrlSchema = z.url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "wss:" || protocol === "ws:";
}, "Voice gateway URL must use WebSocket transport.");

const disclosureSchema = z.object({
  required: z.literal(true),
  text: z.string().trim().min(8).max(500),
}).strict();

export const voiceSessionGrantSchema = z.object({
  sessionId: z.uuid(),
  sessionGrant: z.string().startsWith("djay_voice_grant_").min(48).max(256),
  gatewayUrl: gatewayUrlSchema,
  protocolVersion: z.literal(voiceProtocolVersion),
  capabilityProfile: voiceCapabilityProfileSchema,
  publicLabel: z.enum(["First-Generation Voice Engine", "Second-Generation Voice Engine"]),
  expiresAt: z.iso.datetime(),
  maxCallSeconds: z.number().int().min(30).max(14_400),
  locale: z.enum(["th", "en"]),
  greeting: z.string().trim().min(1).max(1000),
  reconnectPolicy: z.object({
    maxAttempts: z.number().int().min(0).max(10),
    backoffMs: z.number().int().min(100).max(30_000),
    resumeWindowSeconds: z.number().int().min(0).max(300),
  }).strict(),
  automatedAgentDisclosure: disclosureSchema,
  recording: z.object({
    enabled: z.boolean(),
    disclosure: disclosureSchema.nullable(),
  }).strict(),
}).strict().superRefine((grant, context) => {
  if (grant.capabilityProfile === "voice_gen1" && grant.publicLabel !== "First-Generation Voice Engine") {
    context.addIssue({ code: "custom", path: ["publicLabel"], message: "Capability label mismatch." });
  }
  if (grant.capabilityProfile === "voice_gen2" && grant.publicLabel !== "Second-Generation Voice Engine") {
    context.addIssue({ code: "custom", path: ["publicLabel"], message: "Capability label mismatch." });
  }
  if (grant.recording.enabled !== Boolean(grant.recording.disclosure)) {
    context.addIssue({ code: "custom", path: ["recording"], message: "Recording disclosure state mismatch." });
  }
});

export type VoiceSessionGrant = z.infer<typeof voiceSessionGrantSchema>;

export const voiceInputAudioEncodingSchema = z.enum(["webm_opus", "ogg_opus", "mp4_aac"]);
export const voiceOutputAudioEncodingSchema = z.literal("pcm_s16le_24000");
export type VoiceInputAudioEncoding = z.infer<typeof voiceInputAudioEncodingSchema>;
export type VoiceOutputAudioEncoding = z.infer<typeof voiceOutputAudioEncodingSchema>;

export const voiceClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("session.connect"), messageId: z.uuid(), sessionId: z.uuid(),
    sessionGrant: z.string().startsWith("djay_voice_grant_").min(48).max(256),
    connectionId: z.uuid(), protocolVersion: z.literal(voiceProtocolVersion),
    inputAudioEncoding: voiceInputAudioEncodingSchema,
    reconnectAttempt: z.number().int().min(0).max(10),
  }).strict(),
  z.object({ type: z.literal("session.ready"), messageId: z.uuid() }).strict(),
  z.object({ type: z.literal("audio.chunk"), messageId: z.uuid(), sequence: z.number().int().nonnegative(), audioBase64: z.string().min(1).max(262_144) }).strict(),
  z.object({ type: z.literal("speech.started"), messageId: z.uuid() }).strict(),
  z.object({ type: z.literal("speech.ended"), messageId: z.uuid() }).strict(),
  z.object({ type: z.literal("session.end"), messageId: z.uuid(), reason: z.enum(["customer_ended", "page_closed"]) }).strict(),
]);

export const voiceServerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("session.connected"), messageId: z.uuid(), sessionId: z.uuid(),
    resumed: z.boolean(), outputAudioEncoding: voiceOutputAudioEncodingSchema,
  }).strict(),
  z.object({
    type: z.literal("audio.chunk"), messageId: z.uuid(), sequence: z.number().int().nonnegative(),
    outputAudioEncoding: voiceOutputAudioEncodingSchema, audioBase64: z.string().min(1).max(262_144),
  }).strict(),
  z.object({ type: z.literal("assistant.speech.started"), messageId: z.uuid() }).strict(),
  z.object({ type: z.literal("assistant.speech.ended"), messageId: z.uuid() }).strict(),
  z.object({ type: z.literal("assistant.speech.interrupted"), messageId: z.uuid() }).strict(),
  z.object({ type: z.literal("silence.warning"), messageId: z.uuid(), remainingSeconds: z.number().int().nonnegative() }).strict(),
  z.object({ type: z.literal("transcript.delta"), messageId: z.uuid(), speaker: z.enum(["customer", "agent"]), text: z.string().max(5000) }).strict(),
  z.object({ type: z.literal("action.status"), messageId: z.uuid(), actionId: z.uuid(), status: z.enum(["proposed", "succeeded", "failed"]) }).strict(),
  z.object({ type: z.literal("session.ended"), messageId: z.uuid(), reason: z.enum(["completed", "time_limit", "idle_timeout", "transferred", "callback_requested", "unavailable"]) }).strict(),
  z.object({ type: z.literal("error"), messageId: z.uuid(), code: z.enum(["grant_invalid", "grant_expired", "capacity_unavailable", "session_unavailable", "protocol_unsupported", "media_unavailable"]), retryable: z.boolean() }).strict(),
]);

export type VoiceClientMessage = z.infer<typeof voiceClientMessageSchema>;
export type VoiceServerMessage = z.infer<typeof voiceServerMessageSchema>;

export type VoiceTerminalReason = "completed" | "customer_ended" | "time_limit" | "idle_timeout" | "transferred" | "callback_requested" | "unavailable" | "grant_expired";
export type VoiceSessionState = "issued" | "connected" | "reconnecting" | "ending" | "ended";

export type VoiceLifecycleEvent = Readonly<
  | { type: "connected"; atMs: number }
  | { type: "disclosure_completed"; atMs: number }
  | { type: "customer_speech_started"; atMs: number }
  | { type: "assistant_speech_started"; atMs: number }
  | { type: "assistant_speech_ended"; atMs: number }
  | { type: "transport_lost"; atMs: number }
  | { type: "reconnected"; atMs: number }
  | { type: "ended"; atMs: number; reason: VoiceTerminalReason }
>;

export type VoiceLifecycleSnapshot = Readonly<{
  state: VoiceSessionState;
  disclosureCompleted: boolean;
  assistantSpeaking: boolean;
  interruptionCount: number;
  reconnectCount: number;
  connectedAtMs: number | null;
  terminalAtMs: number | null;
  terminalReason: VoiceTerminalReason | null;
  settlement: Readonly<{ disposition: "settle" | "release"; elapsedSeconds: number; customerMinutes: number }> | null;
}>;

export class VoiceLifecycleError extends Error {
  constructor(readonly code: "invalid_transition" | "disclosure_required" | "reconnect_window_expired") {
    super(code);
  }
}

export class VoiceSessionLifecycle {
  private snapshotValue: VoiceLifecycleSnapshot = {
    state: "issued", disclosureCompleted: false, assistantSpeaking: false,
    interruptionCount: 0, reconnectCount: 0, connectedAtMs: null,
    terminalAtMs: null, terminalReason: null, settlement: null,
  };

  constructor(private readonly reconnectWindowSeconds: number) {}

  get snapshot() { return this.snapshotValue; }

  apply(event: VoiceLifecycleEvent) {
    const current = this.snapshotValue;
    if (current.state === "ended") throw new VoiceLifecycleError("invalid_transition");
    switch (event.type) {
      case "connected":
        if (current.state !== "issued") throw new VoiceLifecycleError("invalid_transition");
        this.snapshotValue = { ...current, state: "connected", connectedAtMs: event.atMs };
        break;
      case "disclosure_completed":
        if (current.state !== "connected") throw new VoiceLifecycleError("invalid_transition");
        this.snapshotValue = { ...current, disclosureCompleted: true };
        break;
      case "assistant_speech_started":
        if (current.state !== "connected") throw new VoiceLifecycleError("invalid_transition");
        if (!current.disclosureCompleted) throw new VoiceLifecycleError("disclosure_required");
        this.snapshotValue = { ...current, assistantSpeaking: true };
        break;
      case "customer_speech_started":
        if (current.state !== "connected") throw new VoiceLifecycleError("invalid_transition");
        this.snapshotValue = current.assistantSpeaking
          ? { ...current, assistantSpeaking: false, interruptionCount: current.interruptionCount + 1 }
          : current;
        break;
      case "assistant_speech_ended":
        if (current.state !== "connected" || !current.assistantSpeaking) throw new VoiceLifecycleError("invalid_transition");
        this.snapshotValue = { ...current, assistantSpeaking: false };
        break;
      case "transport_lost":
        if (current.state !== "connected") throw new VoiceLifecycleError("invalid_transition");
        this.snapshotValue = { ...current, state: "reconnecting", assistantSpeaking: false, terminalAtMs: event.atMs };
        break;
      case "reconnected": {
        if (current.state !== "reconnecting" || current.terminalAtMs === null) throw new VoiceLifecycleError("invalid_transition");
        if (event.atMs - current.terminalAtMs > this.reconnectWindowSeconds * 1000) throw new VoiceLifecycleError("reconnect_window_expired");
        this.snapshotValue = { ...current, state: "connected", reconnectCount: current.reconnectCount + 1, terminalAtMs: null };
        break;
      }
      case "ended": {
        if (current.connectedAtMs === null) {
          this.snapshotValue = { ...current, state: "ended", terminalAtMs: event.atMs, terminalReason: event.reason,
            settlement: { disposition: "release", elapsedSeconds: 0, customerMinutes: 0 } };
          break;
        }
        const elapsedSeconds = Math.max(0, Math.ceil((event.atMs - current.connectedAtMs) / 1000));
        this.snapshotValue = { ...current, state: "ended", assistantSpeaking: false, terminalAtMs: event.atMs, terminalReason: event.reason,
          settlement: { disposition: elapsedSeconds > 0 ? "settle" : "release", elapsedSeconds, customerMinutes: Math.ceil(elapsedSeconds / 60) } };
        break;
      }
    }
    return this.snapshotValue;
  }
}
