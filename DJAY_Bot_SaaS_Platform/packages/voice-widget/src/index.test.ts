import { describe, expect, it } from "vitest";
import { voiceServerMessageSchema, voiceSessionGrantSchema } from "@djay/voice-runtime";
import { normalizeVoiceApiBaseUrl, resampleVoiceInputToPcm16, selectVoiceInputAudioEncoding } from "./index";
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
  it("normalizes API URLs and chooses the provider-neutral PCM input contract", () => {
    expect(normalizeVoiceApiBaseUrl("https://api.example///")).toBe("https://api.example");
    expect(() => normalizeVoiceApiBaseUrl("https://api.example/public")).toThrow("widget_api_origin_invalid");
    expect(selectVoiceInputAudioEncoding(true)).toEqual({ encoding: "pcm_s16le_16000", sampleRate: 16_000 });
    expect(selectVoiceInputAudioEncoding(false)).toBeNull();
  });

  it("resamples and clamps microphone frames to signed 16-bit 16 kHz PCM", () => {
    const source = new Float32Array(480).map((_, index) => Math.sin(index / 8) * 1.2);
    const output = resampleVoiceInputToPcm16(source, 48_000);
    expect(output).toHaveLength(160);
    expect(Math.max(...output)).toBeLessThanOrEqual(32_767);
    expect(Math.min(...output)).toBeGreaterThanOrEqual(-32_768);
    expect(() => resampleVoiceInputToPcm16(source, 8_000)).toThrow("voice_input_sample_rate_unsupported");
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
