import { describe, expect, it } from "vitest";
import {
  assertProviderNeutralCustomerText,
  createGen1LiveVoiceProviderGateway,
  createHttpTextProviderGateway,
  LiveVoiceGatewayError,
  ProviderGatewayError,
  type LiveVoiceEvent,
  type RestrictedLiveSocket,
} from "./index";

const request = {
  correlationId: "turn-1", locale: "en" as const, systemPolicy: "policy", messages: [],
  customerMessage: "Hello", structuredOutputSchemaVersion: "sales-core.v1" as const,
};

describe("internal text gateway", () => {
  it("normalizes a valid result without routing metadata", async () => {
    const gateway = createHttpTextProviderGateway({
      endpoint: "https://ai-gateway.internal/generate", serviceToken: "secret",
      fetchImpl: async (_input, init) => {
        expect(JSON.parse(String(init?.body))).toMatchObject({ capability: "sales_text", customerMessage: "Hello" });
        return new Response(JSON.stringify({ output: { ok: true }, nativeUsage: { inputUnits: 12, outputUnits: 8 } }), { status: 200 });
      },
    });
    await expect(gateway.generate(request)).resolves.toEqual({ output: { ok: true }, nativeUsage: { inputUnits: 12, outputUnits: 8 } });
  });

  it("returns only a stable safe error for upstream failures", async () => {
    const gateway = createHttpTextProviderGateway({
      endpoint: "https://ai-gateway.internal/generate", serviceToken: "secret",
      fetchImpl: async () => new Response("sensitive upstream body", { status: 503 }),
    });
    await expect(gateway.generate(request)).rejects.toEqual(new ProviderGatewayError("gateway_unavailable"));
  });

  it("rejects restricted routing identity in customer text", () => {
    expect(() => assertProviderNeutralCustomerText("This reply names GPT-5.")).toThrow(/gateway_invalid_response/);
  });
});

class FakeLiveSocket implements RestrictedLiveSocket {
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: Readonly<{ data: unknown }>) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  send(data: string) { this.sent.push(data); }
  close() { this.readyState = 3; }
  open() { this.readyState = 1; this.onopen?.(); }
  message(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) }); }
}

describe("restricted realtime Voice gateway", () => {
  it("owns setup, raw PCM transport, transcripts, multi-part audio and tool calls", async () => {
    const socket = new FakeLiveSocket(); const events: LiveVoiceEvent[] = [];
    const gateway = createGen1LiveVoiceProviderGateway({
      apiKey: "restricted-key-abcdefghijklmnopqrstuvwxyz", model: "restricted-model",
      voiceName: "restricted-voice", socketFactory: () => socket,
    });
    const connecting = gateway.connect({
      correlationId: "voice-session-1", locale: "en", systemPolicy: "Restricted system policy",
      tools: [{ name: "plan_sales_turn", description: "Plan one turn", parameters: { type: "object" } }],
    }, (event) => { events.push(event); });
    socket.open();
    const setup = JSON.parse(socket.sent[0]!) as Record<string, any>;
    expect(setup.setup.generationConfig.responseModalities).toEqual(["AUDIO"]);
    expect(setup.setup.inputAudioTranscription).toEqual({});
    expect(setup.setup.tools[0].functionDeclarations[0].name).toBe("plan_sales_turn");
    socket.message({ setupComplete: {} });
    const session = await connecting;
    session.sendAudio("AQID"); session.sendActivity("start"); session.sendActivity("end");
    expect(socket.sent.slice(-3).map((value) => JSON.parse(value))).toEqual([
      { realtimeInput: { audio: { mimeType: "audio/pcm;rate=16000", data: "AQID" } } },
      { realtimeInput: { activityStart: {} } }, { realtimeInput: { activityEnd: {} } },
    ]);
    socket.message({ serverContent: {
      inputTranscription: { text: "Hello" }, outputTranscription: { text: "Hi" },
      modelTurn: { parts: [
        { inlineData: { mimeType: "audio/pcm;rate=24000", data: "BAUG" } },
        { inlineData: { mimeType: "audio/pcm;rate=24000", data: "BwgJ" } },
      ] }, turnComplete: true,
    } });
    socket.message({ toolCall: { functionCalls: [{ id: "call-1", name: "plan_sales_turn", args: { customerMessage: "Hello" } }] } });
    expect(events).toEqual([
      { type: "transcript.delta", speaker: "customer", text: "Hello" },
      { type: "transcript.delta", speaker: "agent", text: "Hi" },
      { type: "assistant.speech.started" },
      { type: "audio.chunk", sequence: 0, audioBase64: "BAUG" },
      { type: "audio.chunk", sequence: 1, audioBase64: "BwgJ" },
      { type: "assistant.speech.ended" },
      { type: "tool.call", callId: "call-1", name: "plan_sales_turn", args: { customerMessage: "Hello" } },
    ]);
    session.sendToolResponse({ callId: "call-1", name: "plan_sales_turn", response: { response: "Approved" } });
    expect(JSON.parse(socket.sent.at(-1)!)).toEqual({
      toolResponse: { functionResponses: [{ id: "call-1", name: "plan_sales_turn", response: { response: "Approved" } }] },
    });
  });

  it("fails closed with stable errors when setup is invalid", async () => {
    const socket = new FakeLiveSocket();
    const gateway = createGen1LiveVoiceProviderGateway({
      apiKey: "restricted-key-abcdefghijklmnopqrstuvwxyz", model: "restricted-model",
      voiceName: "restricted-voice", socketFactory: () => socket,
    });
    const connecting = gateway.connect({
      correlationId: "voice-session-2", locale: "th", systemPolicy: "Restricted system policy",
    }, () => undefined);
    socket.open(); socket.onmessage?.({ data: "not-json" });
    await expect(connecting).rejects.toEqual(new LiveVoiceGatewayError("gateway_invalid_response"));
    expect(socket.readyState).toBe(3);
  });
});
