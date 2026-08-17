import { z } from "zod";
import {
  LiveVoiceGatewayError,
  type LiveVoiceConnectRequest,
  type LiveVoiceEvent,
  type LiveVoiceProviderGateway,
  type LiveVoiceSession,
  type RestrictedLiveSocket,
} from "./live-voice";

const eventSchema = z.object({ type: z.string().min(1) }).passthrough();

function decodeMessage(data: unknown) {
  const text = typeof data === "string" ? data
    : data instanceof ArrayBuffer ? new TextDecoder().decode(data)
      : ArrayBuffer.isView(data) ? new TextDecoder().decode(data) : null;
  if (text === null) throw new LiveVoiceGatewayError("gateway_invalid_response");
  try { return eventSchema.parse(JSON.parse(text)); }
  catch { throw new LiveVoiceGatewayError("gateway_invalid_response"); }
}

function closeSocket(socket: RestrictedLiveSocket) {
  try { socket.close(1000, "session_complete"); } catch { /* already closed */ }
}

export function createOpenAIRealtimeVoiceGateway(config: Readonly<{
  apiKey: string;
  model: string;
  voiceName: string;
  transcriptionModel?: string;
  endpoint?: string;
  connectTimeoutMs?: number;
  socketFactory: (url: string, headers: Readonly<Record<string, string>>) => RestrictedLiveSocket;
}>): LiveVoiceProviderGateway {
  if (config.apiKey.length < 20 || !config.model.trim() || !config.voiceName.trim()) {
    throw new Error("Restricted Voice routing configuration is incomplete.");
  }
  return {
    connect(request: LiveVoiceConnectRequest, onEvent): Promise<LiveVoiceSession> {
      return new Promise((resolve, reject) => {
        const endpoint = new URL(config.endpoint ?? "wss://api.openai.com/v1/realtime");
        if (endpoint.protocol !== "wss:") {
          reject(new LiveVoiceGatewayError("gateway_unavailable"));
          return;
        }
        endpoint.searchParams.set("model", config.model);
        let socket: RestrictedLiveSocket;
        try {
          socket = config.socketFactory(endpoint.toString(), {
            Authorization: `Bearer ${config.apiKey}`,
          });
        } catch {
          reject(new LiveVoiceGatewayError("gateway_unavailable"));
          return;
        }
        let ready = false;
        let closed = false;
        let sequence = 0;
        let assistantSpeaking = false;
        const toolCalls = new Map<string, { name: string; args: string }>();
        const timeout = setTimeout(() => {
          if (ready || closed) return;
          closed = true;
          closeSocket(socket);
          reject(new LiveVoiceGatewayError("gateway_timeout"));
        }, config.connectTimeoutMs ?? 8_000);
        const dispatch = (event: LiveVoiceEvent) => {
          void Promise.resolve(onEvent(event)).catch(() => {
            closed = true;
            closeSocket(socket);
          });
        };
        const send = (value: unknown) => {
          if (closed || socket.readyState !== 1) throw new LiveVoiceGatewayError("gateway_unavailable");
          socket.send(JSON.stringify(value));
        };
        const session: LiveVoiceSession = {
          sendAudio(audioBase64) { send({ type: "input_audio_buffer.append", audio: audioBase64 }); },
          sendText(text) {
            send({
              type: "conversation.item.create",
              item: { type: "message", role: "user", content: [{ type: "input_text", text }] },
            });
            send({ type: "response.create" });
          },
          sendActivity() { /* OpenAI server VAD owns activity boundaries. */ },
          sendToolResponse(input) {
            send({
              type: "conversation.item.create",
              item: { type: "function_call_output", call_id: input.callId, output: JSON.stringify(input.response) },
            });
            send({ type: "response.create" });
          },
          close() {
            if (closed) return;
            closed = true;
            clearTimeout(timeout);
            closeSocket(socket);
          },
        };
        socket.onopen = () => {
          try {
            send({
              type: "session.update",
              session: {
                type: "realtime",
                model: config.model,
                modalities: ["audio"],
                instructions: request.systemPolicy,
                audio: {
                  input: {
                    format: { type: "audio/pcm", rate: 16_000 },
                    transcription: { model: config.transcriptionModel ?? "gpt-4o-mini-transcribe" },
                    turn_detection: {
                      type: "server_vad",
                      silence_duration_ms: 500,
                      create_response: true,
                      interrupt_response: true,
                    },
                  },
                  output: { format: { type: "audio/pcm", rate: 24_000 }, voice: config.voiceName },
                },
                tools: request.tools?.map((tool) => ({ type: "function", ...tool })) ?? [],
                tool_choice: request.tools?.length ? "auto" : "none",
              },
            });
          } catch {
            closed = true;
            clearTimeout(timeout);
            closeSocket(socket);
            reject(new LiveVoiceGatewayError("gateway_unavailable"));
          }
        };
        socket.onmessage = (incoming) => {
          let event: z.infer<typeof eventSchema>;
          try { event = decodeMessage(incoming.data); }
          catch {
            if (!ready) {
              closed = true;
              clearTimeout(timeout);
              closeSocket(socket);
              reject(new LiveVoiceGatewayError("gateway_invalid_response"));
            } else dispatch({ type: "error", code: "upstream_invalid_response" });
            return;
          }
          if (event.type === "session.updated" && !ready) {
            ready = true;
            clearTimeout(timeout);
            resolve(session);
          } else if (event.type === "response.output_audio.delta" && typeof event.delta === "string") {
            if (!assistantSpeaking) {
              assistantSpeaking = true;
              dispatch({ type: "assistant.speech.started" });
            }
            dispatch({ type: "audio.chunk", sequence: sequence++, audioBase64: event.delta });
          } else if (event.type === "response.output_audio_transcript.delta" && typeof event.delta === "string") {
            dispatch({ type: "transcript.delta", speaker: "agent", text: event.delta });
          } else if ((event.type === "conversation.item.input_audio_transcription.delta"
            || event.type === "conversation.item.input_audio_transcription.updated"
            || event.type === "conversation.item.input_audio_transcription.completed")
            && typeof (event.delta ?? event.transcript) === "string") {
            dispatch({ type: "transcript.delta", speaker: "customer", text: String(event.delta ?? event.transcript) });
          } else if (event.type === "input_audio_buffer.speech_started" && assistantSpeaking) {
            assistantSpeaking = false;
            dispatch({ type: "assistant.speech.interrupted" });
          } else if (event.type === "response.done" && assistantSpeaking) {
            assistantSpeaking = false;
            dispatch({ type: "assistant.speech.ended" });
          } else if (event.type === "response.function_call_arguments.delta"
            && typeof event.call_id === "string" && typeof event.name === "string" && typeof event.delta === "string") {
            const current = toolCalls.get(event.call_id) ?? { name: event.name, args: "" };
            current.args += event.delta;
            toolCalls.set(event.call_id, current);
          } else if (event.type === "response.function_call_arguments.done" && typeof event.call_id === "string") {
            const current = toolCalls.get(event.call_id);
            const name = typeof event.name === "string" ? event.name : current?.name;
            const rawArgs = typeof event.arguments === "string" ? event.arguments : current?.args;
            if (!name || rawArgs === undefined) {
              dispatch({ type: "error", code: "upstream_invalid_response" });
              return;
            }
            try {
              dispatch({ type: "tool.call", callId: event.call_id, name, args: JSON.parse(rawArgs) });
              toolCalls.delete(event.call_id);
            } catch { dispatch({ type: "error", code: "upstream_invalid_response" }); }
          } else if (event.type === "error") {
            dispatch({ type: "error", code: "upstream_unavailable" });
          }
        };
        socket.onerror = () => {
          if (!ready) {
            closed = true;
            clearTimeout(timeout);
            reject(new LiveVoiceGatewayError("gateway_unavailable"));
          } else dispatch({ type: "error", code: "upstream_unavailable" });
        };
        socket.onclose = () => {
          if (closed) return;
          closed = true;
          clearTimeout(timeout);
          if (!ready) reject(new LiveVoiceGatewayError("gateway_unavailable"));
          else dispatch({ type: "error", code: "upstream_unavailable" });
        };
      });
    },
  };
}
