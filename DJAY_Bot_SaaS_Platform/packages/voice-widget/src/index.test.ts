import { describe, expect, it } from "vitest";
import { voiceServerMessageSchema, voiceSessionGrantSchema } from "@djay/voice-runtime";
import { normalizeVoiceApiBaseUrl, selectVoiceInputAudioEncoding } from "./index";
import { parseVoiceServerMessage, parseVoiceSessionGrant } from "./protocol";

const id = "10000000-0000-4000-8000-000000000001";
const grant = {
  sessionId: id, sessionGrant: `djay_voice_grant_${"a".repeat(48)}`,
  gatewayUrl: "wss://voice.example.test/v1/connect", protocolVersion: "djay.voice.v1",
  capabilityProfile: "voice_gen1", publicLabel: "First-Generation Voice Engine",
  expiresAt: "2026-07-15T12:00:00.000Z", maxCallSeconds: 900, locale: "en", greeting: "Hello",
  reconnectPolicy: { maxAttempts: 3, backoffMs: 500, resumeWindowSeconds: 30 },
  automatedAgentDisclosure: { required: true, text: "This is an automated assistant." },
  recording: { enabled: false, disclosure: null },
};

describe("Voice web widget", () => {
  it("normalizes API URLs and chooses a controlled cross-browser input encoding", () => {
    expect(normalizeVoiceApiBaseUrl("https://api.example///")).toBe("https://api.example");
    expect(selectVoiceInputAudioEncoding((type) => type === "audio/webm;codecs=opus")).toEqual({
      encoding: "webm_opus", mimeType: "audio/webm;codecs=opus",
    });
    expect(selectVoiceInputAudioEncoding((type) => type === "audio/mp4")).toEqual({
      encoding: "mp4_aac", mimeType: "audio/mp4",
    });
    expect(selectVoiceInputAudioEncoding(() => false)).toBeNull();
  });

  it("exports no routing controls or native service identifiers", async () => {
    const source = await import("./index");
    expect(Object.keys(source).join(" ")).not.toMatch(/provider|model|vendor|credential|cost/i);
  });

  it("strictly decodes grants and server frames without accepting extra fields", () => {
    expect(parseVoiceSessionGrant(grant)).toEqual(voiceSessionGrantSchema.parse(grant));
    const connected = { type: "session.connected", messageId: id, sessionId: id, resumed: false, outputAudioEncoding: "pcm_s16le_24000" };
    expect(parseVoiceServerMessage(connected)).toEqual(voiceServerMessageSchema.parse(connected));
    expect(() => parseVoiceSessionGrant({ ...grant, routingIdentity: "restricted" })).toThrow("voice_protocol_invalid");
    expect(() => parseVoiceServerMessage({ type: "error", messageId: id, code: "native_failure", retryable: false })).toThrow("voice_protocol_invalid");
  });
});
