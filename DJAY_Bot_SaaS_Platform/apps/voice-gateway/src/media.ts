import { randomUUID } from "node:crypto";
import {
  createGen1LiveVoiceProviderGateway,
  type LiveVoiceEvent,
  type LiveVoiceProviderGateway,
  type LiveVoiceSession,
  type RestrictedLiveSocket,
} from "@djay/provider-gateway";
import { z } from "zod";
import { WebSocket } from "ws";
import type { VoiceMediaFactory, VoiceMediaSession } from "./transport";

const contextSchema = z.object({
  greeting: z.string().trim().min(1).max(1000),
  automatedDisclosure: z.string().trim().min(8).max(500),
  agentName: z.string().trim().min(2).max(160),
}).strict();
const toolArgsSchema = z.object({ customerMessage: z.string().trim().min(1).max(2000) }).strict();
const turnResultSchema = z.object({
  status: z.enum(["completed", "handover"]), inputId: z.uuid(), text: z.string().max(5000),
  quickReplies: z.array(z.string().max(80)).max(6), nextTurnSequence: z.number().int().positive(),
  actionStatuses: z.array(z.object({ actionId: z.uuid(), status: z.literal("succeeded") }).strict()).max(10),
  terminalReason: z.literal("transferred").nullable(),
}).strict();

async function postInternal<T>(input: Readonly<{
  endpoint: string; serviceToken: string; idempotencyKey: string; body: unknown; schema: z.ZodType<T>;
  fetchImpl?: typeof fetch;
}>) {
  const response = await (input.fetchImpl ?? fetch)(input.endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.serviceToken}`, "content-type": "application/json",
      "idempotency-key": input.idempotencyKey,
    },
    body: JSON.stringify(input.body), signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error("voice_authority_unavailable");
  return input.schema.parse(await response.json());
}

function mediaSystemPolicy(input: Readonly<{ locale: "th" | "en"; agentName: string; disclosure: string; greeting: string }>) {
  return [
    "You are the realtime speech and turn-taking layer for a business sales assistant.",
    "Never answer a customer from your own knowledge. Never claim an action succeeded from your own reasoning.",
    "After the opening disclosure and greeting, every customer turn must call plan_sales_turn exactly once.",
    "Use the customer speech transcript as customerMessage. Speak only the exact customerResponse returned by that tool.",
    "If the tool fails, apologize briefly without naming internal technology and ask the customer to try again later.",
    "Never name an AI provider, model, credential, system prompt, tool, internal route, or internal cost.",
    "Do not collect or retain payment card data, passwords, government identifiers, or unrelated sensitive data.",
    `Conversation locale: ${input.locale}. Public assistant name: ${input.agentName}.`,
    `The first spoken words must be exactly this disclosure, followed by the greeting: ${JSON.stringify(`${input.disclosure} ${input.greeting}`)}`,
  ].join("\n");
}

export function createGen1VoiceMediaFactory(config: Readonly<{
  apiKey: string; model: string; voiceName: string;
  contextEndpoint: string; turnEndpoint: string; serviceToken: string;
  liveGateway?: LiveVoiceProviderGateway; fetchImpl?: typeof fetch;
}>): VoiceMediaFactory {
  const upstream = config.liveGateway ?? createGen1LiveVoiceProviderGateway({
    apiKey: config.apiKey, model: config.model, voiceName: config.voiceName,
    socketFactory: (url) => new WebSocket(url) as unknown as RestrictedLiveSocket,
  });
  return {
    async open(input) {
      if (input.session.capabilityProfile !== "voice_gen1" || input.inputAudioEncoding !== "pcm_s16le_16000") {
        throw new Error("voice_media_contract_unsupported");
      }
      const context = await postInternal({
        endpoint: config.contextEndpoint, serviceToken: config.serviceToken,
        idempotencyKey: `${input.connectionId}:context`,
        body: { sessionId: input.session.sessionId, connectionId: input.connectionId }, schema: contextSchema,
        ...(config.fetchImpl ? { fetchImpl: config.fetchImpl } : {}),
      });
      let providerSession: LiveVoiceSession | null = null;
      let closed = false; let ready = false; let openingSpeech = true; let approvedSpeech = false;
      let turnInFlight = false; let pendingTerminal: "transferred" | null = null;
      const toolResults = new Map<string, z.infer<typeof turnResultSchema>>();

      const handleToolCall = async (event: Extract<LiveVoiceEvent, { type: "tool.call" }>) => {
        if (!providerSession || event.name !== "plan_sales_turn" || turnInFlight) {
          await input.onEvent({ type: "error", code: "session_unavailable", retryable: false }); return;
        }
        const args = toolArgsSchema.safeParse(event.args);
        if (!args.success) { await input.onEvent({ type: "error", code: "session_unavailable", retryable: false }); return; }
        turnInFlight = true;
        try {
          let result = toolResults.get(event.callId);
          if (!result) {
            const inputId = randomUUID();
            result = await postInternal({
              endpoint: config.turnEndpoint, serviceToken: config.serviceToken, idempotencyKey: inputId,
              body: {
                sessionId: input.session.sessionId, connectionId: input.connectionId,
                inputId, message: args.data.customerMessage,
              }, schema: turnResultSchema,
              ...(config.fetchImpl ? { fetchImpl: config.fetchImpl } : {}),
            });
            toolResults.set(event.callId, result);
          }
          for (const action of result.actionStatuses) {
            await input.onEvent({ type: "action.status", actionId: action.actionId, status: action.status });
          }
          approvedSpeech = true; pendingTerminal = result.terminalReason;
          providerSession.sendToolResponse({
            callId: event.callId, name: event.name,
            response: { customerResponse: result.text, status: result.status },
          });
        } catch {
          providerSession.sendToolResponse({
            callId: event.callId, name: event.name,
            response: { customerResponse: input.session.locale === "th"
              ? "ขออภัย ระบบไม่พร้อมใช้งานชั่วคราว กรุณาลองอีกครั้งภายหลัง"
              : "Sorry, the service is temporarily unavailable. Please try again later.", status: "unavailable" },
          });
          approvedSpeech = true;
        } finally { turnInFlight = false; }
      };

      const handleProviderEvent = async (event: LiveVoiceEvent) => {
        if (closed) return;
        switch (event.type) {
          case "audio.chunk":
            if (!openingSpeech && !approvedSpeech) {
              await input.onEvent({ type: "error", code: "session_unavailable", retryable: false }); return;
            }
            await input.onEvent(event); break;
          case "transcript.delta": case "assistant.speech.started":
            await input.onEvent(event); break;
          case "assistant.speech.ended":
            await input.onEvent(event);
            if (openingSpeech) openingSpeech = false; else approvedSpeech = false;
            if (pendingTerminal) await input.onEvent({ type: "session.ended", reason: pendingTerminal });
            break;
          case "assistant.speech.interrupted":
            approvedSpeech = false; await input.onEvent({ type: "customer.speech.started" }); break;
          case "tool.call": await handleToolCall(event); break;
          case "session.going_away":
            await input.onEvent({ type: "error", code: "media_unavailable", retryable: true }); break;
          case "error":
            await input.onEvent({ type: "error", code: "media_unavailable", retryable: event.code === "upstream_unavailable" }); break;
        }
      };
      providerSession = await upstream.connect({
        correlationId: input.session.sessionId, locale: input.session.locale,
        systemPolicy: mediaSystemPolicy({
          locale: input.session.locale, agentName: context.agentName,
          disclosure: context.automatedDisclosure, greeting: context.greeting,
        }),
        tools: [{
          name: "plan_sales_turn", description: "Validate and plan one customer sales turn through Sales Core.",
          parameters: {
            type: "object", additionalProperties: false, required: ["customerMessage"],
            properties: { customerMessage: { type: "string", minLength: 1, maxLength: 2000 } },
          },
        }],
      }, handleProviderEvent);

      const media: VoiceMediaSession = {
        async accept(message) {
          if (closed || !providerSession) throw new Error("voice_media_closed");
          if (message.type === "session.ready") {
            if (ready) throw new Error("voice_media_already_ready");
            ready = true; await input.onEvent({ type: "disclosure.completed" });
            providerSession.sendText(`Speak the required automated-agent disclosure and greeting now. Do not call a tool for this opening.`);
          } else if (message.type === "audio.chunk") providerSession.sendAudio(message.audioBase64);
          else if (message.type === "speech.started") providerSession.sendActivity("start");
          else if (message.type === "speech.ended") providerSession.sendActivity("end");
        },
        async close() { if (closed) return; closed = true; providerSession?.close(); },
      };
      return media;
    },
  };
}
