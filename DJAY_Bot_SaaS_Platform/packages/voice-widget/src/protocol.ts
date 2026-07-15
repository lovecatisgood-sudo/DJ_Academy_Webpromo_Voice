import type { VoiceServerMessage, VoiceSessionGrant } from "@djay/voice-runtime";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const clientErrors = new Set(["grant_invalid", "grant_expired", "capacity_unavailable", "session_unavailable", "protocol_unsupported", "media_unavailable"]);
const terminalReasons = new Set(["completed", "time_limit", "idle_timeout", "transferred", "callback_requested", "unavailable"]);

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("voice_protocol_invalid");
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value).sort(); const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new Error("voice_protocol_invalid");
}
function string(value: unknown, min: number, max: number) {
  if (typeof value !== "string" || value.length < min || value.length > max) throw new Error("voice_protocol_invalid");
  return value;
}
function id(value: unknown) { const result = string(value, 36, 36); if (!uuid.test(result)) throw new Error("voice_protocol_invalid"); return result; }
function integer(value: unknown, min: number, max: number) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) throw new Error("voice_protocol_invalid");
  return value;
}
function oneOf<T extends string>(value: unknown, values: readonly T[]): T {
  if (typeof value !== "string" || !values.includes(value as T)) throw new Error("voice_protocol_invalid");
  return value as T;
}

export function parseVoiceSessionGrant(value: unknown): VoiceSessionGrant {
  const grant = record(value);
  exact(grant, ["sessionId", "sessionGrant", "gatewayUrl", "protocolVersion", "capabilityProfile", "publicLabel", "expiresAt", "maxCallSeconds", "locale", "greeting", "reconnectPolicy", "automatedAgentDisclosure", "recording"]);
  const gatewayUrl = string(grant.gatewayUrl, 1, 2048); const parsedGatewayUrl = new URL(gatewayUrl);
  if (parsedGatewayUrl.protocol !== "ws:" && parsedGatewayUrl.protocol !== "wss:") throw new Error("voice_protocol_invalid");
  const capabilityProfile = oneOf(grant.capabilityProfile, ["voice_gen1", "voice_gen2"] as const);
  const publicLabel = oneOf(grant.publicLabel, ["First-Generation Voice Engine", "Second-Generation Voice Engine"] as const);
  if ((capabilityProfile === "voice_gen1") !== (publicLabel === "First-Generation Voice Engine")) throw new Error("voice_protocol_invalid");
  const reconnect = record(grant.reconnectPolicy); exact(reconnect, ["maxAttempts", "backoffMs", "resumeWindowSeconds"]);
  const disclosure = record(grant.automatedAgentDisclosure); exact(disclosure, ["required", "text"]);
  if (disclosure.required !== true) throw new Error("voice_protocol_invalid");
  const recording = record(grant.recording); exact(recording, ["enabled", "disclosure"]);
  if (recording.enabled !== false || recording.disclosure !== null) throw new Error("voice_protocol_invalid");
  const expiresAt = string(grant.expiresAt, 20, 40); if (!Number.isFinite(Date.parse(expiresAt))) throw new Error("voice_protocol_invalid");
  const sessionGrant = string(grant.sessionGrant, 48, 256); if (!sessionGrant.startsWith("djay_voice_grant_")) throw new Error("voice_protocol_invalid");
  return {
    sessionId: id(grant.sessionId), sessionGrant, gatewayUrl, protocolVersion: oneOf(grant.protocolVersion, ["djay.voice.v1"] as const),
    capabilityProfile, publicLabel, expiresAt, maxCallSeconds: integer(grant.maxCallSeconds, 30, 14_400),
    locale: oneOf(grant.locale, ["th", "en"] as const), greeting: string(grant.greeting, 1, 1000),
    reconnectPolicy: {
      maxAttempts: integer(reconnect.maxAttempts, 0, 10), backoffMs: integer(reconnect.backoffMs, 100, 30_000),
      resumeWindowSeconds: integer(reconnect.resumeWindowSeconds, 0, 300),
    },
    automatedAgentDisclosure: { required: true, text: string(disclosure.text, 8, 500) },
    recording: { enabled: false, disclosure: null },
  };
}

export function parseVoiceServerMessage(value: unknown): VoiceServerMessage {
  const message = record(value); const type = string(message.type, 1, 80); const messageId = id(message.messageId);
  switch (type) {
    case "session.connected":
      exact(message, ["type", "messageId", "sessionId", "resumed", "outputAudioEncoding"]);
      if (typeof message.resumed !== "boolean" || message.outputAudioEncoding !== "pcm_s16le_24000") throw new Error("voice_protocol_invalid");
      return { type, messageId, sessionId: id(message.sessionId), resumed: message.resumed, outputAudioEncoding: "pcm_s16le_24000" };
    case "audio.chunk":
      exact(message, ["type", "messageId", "sequence", "outputAudioEncoding", "audioBase64"]);
      if (message.outputAudioEncoding !== "pcm_s16le_24000") throw new Error("voice_protocol_invalid");
      return { type, messageId, sequence: integer(message.sequence, 0, Number.MAX_SAFE_INTEGER), outputAudioEncoding: "pcm_s16le_24000", audioBase64: string(message.audioBase64, 1, 262_144) };
    case "assistant.speech.started": case "assistant.speech.ended": case "assistant.speech.interrupted":
      exact(message, ["type", "messageId"]); return { type, messageId };
    case "silence.warning":
      exact(message, ["type", "messageId", "remainingSeconds"]); return { type, messageId, remainingSeconds: integer(message.remainingSeconds, 0, 14_400) };
    case "transcript.delta":
      exact(message, ["type", "messageId", "speaker", "text"]); return { type, messageId, speaker: oneOf(message.speaker, ["customer", "agent"] as const), text: string(message.text, 0, 5000) };
    case "action.status":
      exact(message, ["type", "messageId", "actionId", "status"]); return { type, messageId, actionId: id(message.actionId), status: oneOf(message.status, ["proposed", "succeeded", "failed"] as const) };
    case "session.ended": {
      exact(message, ["type", "messageId", "reason"]); const reason = string(message.reason, 1, 40);
      if (!terminalReasons.has(reason)) throw new Error("voice_protocol_invalid");
      return { type, messageId, reason: reason as Extract<VoiceServerMessage, { type: "session.ended" }>["reason"] };
    }
    case "error": {
      exact(message, ["type", "messageId", "code", "retryable"]); const code = string(message.code, 1, 40);
      if (!clientErrors.has(code) || typeof message.retryable !== "boolean") throw new Error("voice_protocol_invalid");
      return { type, messageId, code: code as Extract<VoiceServerMessage, { type: "error" }>["code"], retryable: message.retryable };
    }
    default: throw new Error("voice_protocol_invalid");
  }
}
