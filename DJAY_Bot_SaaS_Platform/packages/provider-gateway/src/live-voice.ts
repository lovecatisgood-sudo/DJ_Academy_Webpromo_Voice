import { z } from "zod";

export type RestrictedLiveSocket = {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  set onopen(handler: (() => void) | null);
  set onmessage(handler: ((event: Readonly<{ data: unknown }>) => void) | null);
  set onerror(handler: (() => void) | null);
  set onclose(handler: (() => void) | null);
};

export type LiveVoiceEvent = Readonly<
  | { type: "audio.chunk"; sequence: number; audioBase64: string }
  | { type: "transcript.delta"; speaker: "customer" | "agent"; text: string }
  | { type: "assistant.speech.started" }
  | { type: "assistant.speech.ended" }
  | { type: "assistant.speech.interrupted" }
  | { type: "tool.call"; callId: string; name: string; args: unknown }
  | { type: "session.going_away" }
  | { type: "error"; code: "upstream_unavailable" | "upstream_invalid_response" }
>;

export type LiveVoiceConnectRequest = Readonly<{
  correlationId: string;
  locale: "th" | "en";
  systemPolicy: string;
  tools?: readonly Readonly<{ name: string; description: string; parameters: Record<string, unknown> }>[];
}>;

export interface LiveVoiceSession {
  sendAudio(audioBase64: string): void;
  sendText(text: string): void;
  sendActivity(activity: "start" | "end"): void;
  sendToolResponse(input: Readonly<{ callId: string; name: string; response: Record<string, unknown> }>): void;
  close(): void;
}

export interface LiveVoiceProviderGateway {
  connect(request: LiveVoiceConnectRequest, onEvent: (event: LiveVoiceEvent) => void | Promise<void>): Promise<LiveVoiceSession>;
}

export class LiveVoiceGatewayError extends Error {
  constructor(readonly code: "gateway_timeout" | "gateway_unavailable" | "gateway_invalid_response") { super(code); }
}

const upstreamPartSchema = z.object({
  inlineData: z.object({ mimeType: z.string().optional(), data: z.string().min(1) }).passthrough().optional(),
}).passthrough();

const upstreamMessageSchema = z.object({
  setupComplete: z.unknown().optional(),
  serverContent: z.object({
    modelTurn: z.object({ parts: z.array(upstreamPartSchema) }).passthrough().optional(),
    inputTranscription: z.object({ text: z.string() }).passthrough().optional(),
    outputTranscription: z.object({ text: z.string() }).passthrough().optional(),
    interrupted: z.boolean().optional(),
    turnComplete: z.boolean().optional(),
  }).passthrough().optional(),
  toolCall: z.object({
    functionCalls: z.array(z.object({ id: z.string().min(1), name: z.string().min(1), args: z.unknown() }).passthrough()),
  }).passthrough().optional(),
  goAway: z.unknown().optional(),
}).passthrough();

function decodeUpstreamMessage(data: unknown) {
  const text = typeof data === "string" ? data
    : data instanceof ArrayBuffer ? new TextDecoder().decode(data)
      : ArrayBuffer.isView(data) ? new TextDecoder().decode(data)
        : null;
  if (text === null) throw new LiveVoiceGatewayError("gateway_invalid_response");
  try { return upstreamMessageSchema.parse(JSON.parse(text)); }
  catch { throw new LiveVoiceGatewayError("gateway_invalid_response"); }
}

function safeClose(socket: RestrictedLiveSocket) {
  try { socket.close(1000, "session_complete"); } catch { /* already closed */ }
}

export function createGen1LiveVoiceProviderGateway(config: Readonly<{
  apiKey: string;
  model: string;
  voiceName: string;
  socketFactory: (url: string) => RestrictedLiveSocket;
  connectTimeoutMs?: number;
}>): LiveVoiceProviderGateway {
  if (config.apiKey.length < 20 || !config.model || !config.voiceName) throw new Error("Restricted Voice routing configuration is incomplete.");
  return {
    connect(request, onEvent) {
      return new Promise<LiveVoiceSession>((resolve, reject) => {
        const endpoint = new URL("wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent");
        endpoint.searchParams.set("key", config.apiKey);
        let socket: RestrictedLiveSocket;
        try { socket = config.socketFactory(endpoint.toString()); }
        catch { reject(new LiveVoiceGatewayError("gateway_unavailable")); return; }
        let ready = false; let closed = false; let sequence = 0; let assistantSpeaking = false;
        const timeout = setTimeout(() => {
          if (ready || closed) return; closed = true; safeClose(socket); reject(new LiveVoiceGatewayError("gateway_timeout"));
        }, config.connectTimeoutMs ?? 8_000);
        const dispatch = (event: LiveVoiceEvent) => {
          void Promise.resolve(onEvent(event)).catch(() => { closed = true; safeClose(socket); });
        };
        const send = (value: unknown) => {
          if (closed || socket.readyState !== 1) throw new LiveVoiceGatewayError("gateway_unavailable");
          socket.send(JSON.stringify(value));
        };
        const session: LiveVoiceSession = {
          sendAudio(audioBase64) {
            send({ realtimeInput: { audio: { mimeType: "audio/pcm;rate=16000", data: audioBase64 } } });
          },
          sendText(text) { send({ realtimeInput: { text } }); },
          sendActivity(activity) {
            send({ realtimeInput: activity === "start" ? { activityStart: {} } : { activityEnd: {} } });
          },
          sendToolResponse(input) {
            send({ toolResponse: { functionResponses: [{ id: input.callId, name: input.name, response: input.response }] } });
          },
          close() { if (closed) return; closed = true; clearTimeout(timeout); safeClose(socket); },
        };
        socket.onopen = () => {
          try {
            send({ setup: {
              model: `models/${config.model}`,
              generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: config.voiceName } } },
              },
              systemInstruction: { parts: [{ text: request.systemPolicy }] },
              inputAudioTranscription: {}, outputAudioTranscription: {},
              realtimeInputConfig: {
                automaticActivityDetection: {
                  disabled: false, startOfSpeechSensitivity: "START_SENSITIVITY_LOW",
                  endOfSpeechSensitivity: "END_SENSITIVITY_LOW", prefixPaddingMs: 20, silenceDurationMs: 500,
                },
                activityHandling: "START_OF_ACTIVITY_INTERRUPTS",
              },
              ...(request.tools?.length ? { tools: [{ functionDeclarations: request.tools }] } : {}),
            } });
          } catch { closed = true; clearTimeout(timeout); safeClose(socket); reject(new LiveVoiceGatewayError("gateway_unavailable")); }
        };
        socket.onmessage = (event) => {
          let message: z.infer<typeof upstreamMessageSchema>;
          try { message = decodeUpstreamMessage(event.data); }
          catch {
            if (!ready) { closed = true; clearTimeout(timeout); safeClose(socket); reject(new LiveVoiceGatewayError("gateway_invalid_response")); }
            else dispatch({ type: "error", code: "upstream_invalid_response" });
            return;
          }
          if (message.setupComplete !== undefined && !ready) {
            ready = true; clearTimeout(timeout); resolve(session);
          }
          const content = message.serverContent;
          if (content?.inputTranscription?.text) dispatch({ type: "transcript.delta", speaker: "customer", text: content.inputTranscription.text });
          if (content?.outputTranscription?.text) dispatch({ type: "transcript.delta", speaker: "agent", text: content.outputTranscription.text });
          for (const part of content?.modelTurn?.parts ?? []) {
            const audio = part.inlineData;
            if (!audio?.data || (audio.mimeType && !audio.mimeType.toLowerCase().includes("audio/pcm"))) continue;
            if (!assistantSpeaking) { assistantSpeaking = true; dispatch({ type: "assistant.speech.started" }); }
            dispatch({ type: "audio.chunk", sequence: sequence++, audioBase64: audio.data });
          }
          if (content?.interrupted) {
            if (assistantSpeaking) assistantSpeaking = false;
            dispatch({ type: "assistant.speech.interrupted" });
          }
          if (content?.turnComplete && assistantSpeaking) {
            assistantSpeaking = false; dispatch({ type: "assistant.speech.ended" });
          }
          for (const call of message.toolCall?.functionCalls ?? []) dispatch({ type: "tool.call", callId: call.id, name: call.name, args: call.args });
          if (message.goAway !== undefined) dispatch({ type: "session.going_away" });
        };
        socket.onerror = () => {
          if (!ready) { closed = true; clearTimeout(timeout); reject(new LiveVoiceGatewayError("gateway_unavailable")); }
          else dispatch({ type: "error", code: "upstream_unavailable" });
        };
        socket.onclose = () => {
          if (closed) return; closed = true; clearTimeout(timeout);
          if (!ready) reject(new LiveVoiceGatewayError("gateway_unavailable"));
          else dispatch({ type: "error", code: "upstream_unavailable" });
        };
      });
    },
  };
}
