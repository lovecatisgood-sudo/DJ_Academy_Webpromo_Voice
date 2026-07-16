import { describe, expect, it, vi } from "vitest";
import type {
  LiveVoiceConnectRequest, LiveVoiceEvent, LiveVoiceProviderGateway, LiveVoiceSession,
} from "@djay/provider-gateway";
import { createGen1VoiceMediaFactory, createVoiceMediaFactory } from "./media";
import type { VoiceMediaEvent } from "./transport";

const sessionId = "10000000-0000-4000-8000-000000000001";
const connectionId = "10000000-0000-4000-8000-000000000002";
const actionId = "10000000-0000-4000-8000-000000000003";

function harness(turnTerminal: "transferred" | null = null) {
  let emit: ((event: LiveVoiceEvent) => void | Promise<void>) | null = null;
  let connectRequest: LiveVoiceConnectRequest | null = null;
  const sent = { audio: [] as string[], text: [] as string[], tool: [] as unknown[], closed: 0 };
  const liveSession: LiveVoiceSession = {
    sendAudio(value) { sent.audio.push(value); }, sendText(value) { sent.text.push(value); }, sendActivity() {},
    sendToolResponse(value) { sent.tool.push(value); }, close() { sent.closed += 1; },
  };
  const liveGateway: LiveVoiceProviderGateway = {
    async connect(request, onEvent) { connectRequest = request; emit = onEvent; return liveSession; },
  };
  const fetchImpl = vi.fn<typeof fetch>(async (request, init) => {
    const url = String(request); const body = JSON.parse(String(init?.body));
    if (url.endsWith("/context")) {
      expect(body).toEqual({ sessionId, connectionId });
      return new Response(JSON.stringify({
        greeting: "Hello, how can I help?", automatedDisclosure: "This is our automated voice assistant.", agentName: "Mali",
      }), { status: 200 });
    }
    expect(body).toMatchObject({ sessionId, connectionId, message: "I need help" });
    return new Response(JSON.stringify({
      status: turnTerminal ? "handover" : "completed", inputId: body.inputId,
      text: "Here is the approved answer.", quickReplies: [], nextTurnSequence: 2,
      actionStatuses: [{ actionId, status: "succeeded" }], terminalReason: turnTerminal,
    }), { status: 200 });
  });
  const factory = createGen1VoiceMediaFactory({
    apiKey: "restricted-key-abcdefghijklmnopqrstuvwxyz", model: "restricted-model", voiceName: "restricted-voice",
    contextEndpoint: "http://api.test/context", turnEndpoint: "http://api.test/turn",
    serviceToken: "service-token-abcdefghijklmnopqrstuvwxyz", liveGateway, fetchImpl,
  });
  const events: VoiceMediaEvent[] = [];
  return {
    events, sent, fetchImpl,
    async open() {
      const media = await factory.open({
        session: { sessionId, capabilityProfile: "voice_gen1", locale: "en", maxCallSeconds: 900, resumeWindowSeconds: 30, replayed: false, route: null },
        connectionId, inputAudioEncoding: "pcm_s16le_16000", async onEvent(event) { events.push(event); },
      });
      return { media, emit: (event: LiveVoiceEvent) => emit!(event), connectRequest: () => connectRequest! };
    },
  };
}

describe("First-Generation Voice media orchestration", () => {
  it("queues disclosure first and permits only Sales Core-approved customer turns", async () => {
    const state = harness("transferred"); const { media, emit, connectRequest } = await state.open();
    expect(connectRequest().tools?.map((tool) => tool.name)).toEqual(["plan_sales_turn"]);
    expect(connectRequest().systemPolicy).not.toMatch(/openai|anthropic|gemini|gpt-|model id|provider key/i);
    await media.accept({ type: "session.ready", messageId: crypto.randomUUID() });
    expect(state.events[0]).toEqual({ type: "disclosure.completed" });
    expect(state.sent.text).toHaveLength(1);
    await emit({ type: "assistant.speech.started" });
    await emit({ type: "audio.chunk", sequence: 0, audioBase64: "AQID" });
    await emit({ type: "assistant.speech.ended" });
    await emit({ type: "tool.call", callId: "call-1", name: "plan_sales_turn", args: { customerMessage: "I need help" } });
    expect(state.sent.tool).toEqual([expect.objectContaining({
      callId: "call-1", name: "plan_sales_turn",
      response: { customerResponse: "Here is the approved answer.", status: "handover" },
    })]);
    expect(state.events).toContainEqual({ type: "action.status", actionId, status: "succeeded" });
    await emit({ type: "assistant.speech.started" });
    await emit({ type: "audio.chunk", sequence: 1, audioBase64: "BAUG" });
    await emit({ type: "assistant.speech.ended" });
    expect(state.events).toContainEqual({ type: "session.ended", reason: "transferred" });
    await media.close("customer_ended"); expect(state.sent.closed).toBe(1);
  });

  it("fails closed when ordinary speech bypasses the turn planner", async () => {
    const state = harness(); const { media, emit } = await state.open();
    await media.accept({ type: "session.ready", messageId: crypto.randomUUID() });
    await emit({ type: "assistant.speech.ended" });
    await emit({ type: "audio.chunk", sequence: 0, audioBase64: "AQID" });
    expect(state.events.at(-1)).toEqual({ type: "error", code: "session_unavailable", retryable: false });
  });

  it("rejects compressed client audio before opening restricted media", async () => {
    const state = harness();
    const factory = createGen1VoiceMediaFactory({
      apiKey: "restricted-key-abcdefghijklmnopqrstuvwxyz", model: "restricted-model", voiceName: "restricted-voice",
      contextEndpoint: "http://api.test/context", turnEndpoint: "http://api.test/turn",
      serviceToken: "service-token-abcdefghijklmnopqrstuvwxyz",
      liveGateway: { async connect() { throw new Error("must_not_connect"); } }, fetchImpl: state.fetchImpl,
    });
    await expect(factory.open({
      session: { sessionId, capabilityProfile: "voice_gen1", locale: "en", maxCallSeconds: 900, resumeWindowSeconds: 30, replayed: false, route: null },
      connectionId, inputAudioEncoding: "webm_opus", async onEvent() {},
    })).rejects.toThrow("voice_media_contract_unsupported");
  });
});

describe("Second-Generation Voice media routing", () => {
  it("opens only the exact restricted assignment and never falls back to First-Generation", async () => {
    const state = harness();
    const calls: string[] = [];
    const liveSession: LiveVoiceSession = {
      sendAudio() {}, sendText() {}, sendActivity() {}, sendToolResponse() {}, close() {},
    };
    const factory = createVoiceMediaFactory({
      contextEndpoint: "http://api.test/context", turnEndpoint: "http://api.test/turn",
      serviceToken: "service-token-abcdefghijklmnopqrstuvwxyz", fetchImpl: state.fetchImpl,
      gen1Gateway: { async connect() { calls.push("gen1"); return liveSession; } },
      gen2Routes: [{
        providerKey: "google_live", modelKey: "qualified-model", regionKey: "global",
        gateway: { async connect() { calls.push("gen2"); return liveSession; } },
      }],
    });
    const session = {
      sessionId, capabilityProfile: "voice_gen2" as const, locale: "en" as const,
      maxCallSeconds: 900, resumeWindowSeconds: 30, replayed: false,
      route: { providerKey: "google_live", modelKey: "qualified-model", regionKey: "global" },
    };
    await expect(factory.open({
      session, connectionId, inputAudioEncoding: "pcm_s16le_16000", async onEvent() {},
    })).resolves.toBeDefined();
    expect(calls).toEqual(["gen2"]);

    await expect(factory.open({
      session: { ...session, route: { ...session.route, modelKey: "unqualified-model" } },
      connectionId, inputAudioEncoding: "pcm_s16le_16000", async onEvent() {},
    })).rejects.toThrow("voice_media_route_unavailable");
    expect(calls).toEqual(["gen2"]);
  });
});
