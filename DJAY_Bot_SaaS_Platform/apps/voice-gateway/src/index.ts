import { createServer } from "node:http";
import { assertNoProductionPlaceholders } from "@djay/shared/production-config";
import { z } from "zod";
import { createVoiceGatewayHandler } from "./server";
import { createConfiguredVoiceMediaFactory } from "./media";
import {
  attachVoiceWebSocketGateway,
  VoiceGatewayRegistry,
  type VoiceMediaFactory,
  type VoiceSessionAuthority,
} from "./transport";

const env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(8080),
  VOICE_GATEWAY_MAX_SESSIONS: z.coerce.number().int().positive().default(100),
  VOICE_SILENCE_WARNING_SECONDS: z.coerce.number().int().min(5).max(300).default(45),
  VOICE_IDLE_TIMEOUT_SECONDS: z.coerce.number().int().min(10).max(600).default(60),
  VOICE_AUTHORIZATION_ENDPOINT: z.string().url(),
  VOICE_HEARTBEAT_ENDPOINT: z.string().url(),
  VOICE_DISCONNECT_ENDPOINT: z.string().url(),
  VOICE_FINISH_ENDPOINT: z.string().url(),
  VOICE_AUTHORIZATION_SERVICE_TOKEN: z.string().min(32),
  VOICE_MEDIA_CONTEXT_ENDPOINT: z.string().url().optional(),
  VOICE_TURN_ENDPOINT: z.string().url().optional(),
  VOICE_GEN1_PROVIDER_KEY: z.enum(["google_live", "openai_realtime"]).default("google_live"),
  VOICE_GEN1_API_KEY: z.string().min(20).optional(),
  VOICE_GEN1_MODEL: z.string().min(2).max(160).default("gemini-3.1-flash-live-preview"),
  VOICE_GEN1_VOICE_NAME: z.string().min(2).max(80).default("Puck"),
  VOICE_GEN1_TRANSCRIPTION_MODEL: z.string().min(2).max(160).optional(),
  VOICE_GEN2_PROVIDER_KEY: z.literal("google_live").optional(),
  VOICE_GEN2_API_KEY: z.string().min(20).optional(),
  VOICE_GEN2_MODEL: z.string().min(2).max(160).optional(),
  VOICE_GEN2_REGION_KEY: z.string().regex(/^[a-z0-9][a-z0-9._-]{1,79}$/).optional(),
  VOICE_GEN2_VOICE_NAME: z.string().min(2).max(80).optional(),
}).refine(
  (value) => value.VOICE_SILENCE_WARNING_SECONDS < value.VOICE_IDLE_TIMEOUT_SECONDS,
  { message: "VOICE_SILENCE_WARNING_SECONDS must be lower than VOICE_IDLE_TIMEOUT_SECONDS" },
).superRefine((value, context) => {
  const gen2 = [value.VOICE_GEN2_PROVIDER_KEY, value.VOICE_GEN2_API_KEY,
    value.VOICE_GEN2_MODEL, value.VOICE_GEN2_REGION_KEY, value.VOICE_GEN2_VOICE_NAME];
  if (gen2.some(Boolean) && !gen2.every(Boolean)) {
    context.addIssue({ code: "custom", message: "Second-Generation Voice route configuration must be complete." });
  }
}).parse(process.env);

assertNoProductionPlaceholders(env.NODE_ENV, env);

const restrictedRouteSchema = z.object({
  providerKey: z.string().regex(/^[a-z0-9][a-z0-9._-]{1,79}$/),
  modelKey: z.string().min(2).max(160),
  regionKey: z.string().regex(/^[a-z0-9][a-z0-9._-]{1,79}$/),
}).strict();
const authorizedSessionSchema = z.object({
  sessionId: z.uuid(), capabilityProfile: z.enum(["voice_gen1", "voice_gen2"]),
  locale: z.enum(["th", "en"]), maxCallSeconds: z.number().int().min(30).max(14_400),
  resumeWindowSeconds: z.number().int().min(0).max(300), replayed: z.boolean(),
  route: restrictedRouteSchema.nullable(),
}).strict().superRefine((value, context) => {
  if ((value.capabilityProfile === "voice_gen1") !== (value.route === null)) {
    context.addIssue({ code: "custom", message: "Voice route contract does not match the capability profile." });
  }
});

async function authorityRequest<T>(endpoint: string, body: unknown, idempotencyKey: string): Promise<T | null> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.VOICE_AUTHORIZATION_SERVICE_TOKEN}`,
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5_000),
  });
  return response.ok ? response.json() as Promise<T> : null;
}

const authority: VoiceSessionAuthority = {
  async authorize(input) {
    const result = await authorityRequest<unknown>(env.VOICE_AUTHORIZATION_ENDPOINT, input, input.connectionId);
    return result ? authorizedSessionSchema.parse(result) : null;
  },
  async heartbeat(input) {
    const result = await authorityRequest<{
      alive: boolean; runtimeMode: "running" | "paused" | "emergency_stop";
    }>(env.VOICE_HEARTBEAT_ENDPOINT, input, `${input.connectionId}:heartbeat`);
    if (!result) throw new Error("voice_heartbeat_unavailable");
    return result;
  },
  async disconnect(input) {
    return Boolean(await authorityRequest(env.VOICE_DISCONNECT_ENDPOINT, input, `${input.connectionId}:disconnect`));
  },
  async finish(input) {
    const result = await authorityRequest(env.VOICE_FINISH_ENDPOINT, input, `${input.sessionId}:finish`);
    if (!result) throw new Error("voice_finish_unavailable");
    return result;
  },
};

const gen1Ready = Boolean(env.VOICE_GEN1_API_KEY);
const gen2Ready = Boolean(env.VOICE_GEN2_PROVIDER_KEY && env.VOICE_GEN2_API_KEY
  && env.VOICE_GEN2_MODEL && env.VOICE_GEN2_REGION_KEY && env.VOICE_GEN2_VOICE_NAME);
const mediaReady = Boolean(env.VOICE_MEDIA_CONTEXT_ENDPOINT && env.VOICE_TURN_ENDPOINT && (gen1Ready || gen2Ready));
const mediaFactory: VoiceMediaFactory = mediaReady ? createConfiguredVoiceMediaFactory({
  contextEndpoint: env.VOICE_MEDIA_CONTEXT_ENDPOINT!, turnEndpoint: env.VOICE_TURN_ENDPOINT!,
  serviceToken: env.VOICE_AUTHORIZATION_SERVICE_TOKEN,
  ...(gen1Ready ? { gen1: {
    providerKey: env.VOICE_GEN1_PROVIDER_KEY,
    apiKey: env.VOICE_GEN1_API_KEY!, model: env.VOICE_GEN1_MODEL,
    voiceName: env.VOICE_GEN1_VOICE_NAME,
    ...(env.VOICE_GEN1_TRANSCRIPTION_MODEL
      ? { transcriptionModel: env.VOICE_GEN1_TRANSCRIPTION_MODEL } : {}),
  } } : {}),
  ...(gen2Ready ? { gen2: {
    providerKey: env.VOICE_GEN2_PROVIDER_KEY!, apiKey: env.VOICE_GEN2_API_KEY!,
    modelKey: env.VOICE_GEN2_MODEL!, regionKey: env.VOICE_GEN2_REGION_KEY!,
    voiceName: env.VOICE_GEN2_VOICE_NAME!,
  } } : {}),
}) : { async open() { throw new Error("voice_media_not_configured"); } };
const registry = new VoiceGatewayRegistry(env.VOICE_GATEWAY_MAX_SESSIONS);
if (!mediaReady) registry.pause();
const handler = createVoiceGatewayHandler({ ready: () => mediaReady, capacity: () => registry.snapshot() });

const server = createServer(async (request, response) => {
  const method = request.method ?? "GET";
  const init: RequestInit = { method, headers: request.headers as HeadersInit };
  const webRequest = new Request(`http://127.0.0.1:${env.PORT}${request.url ?? "/"}`, init);
  const result = await handler(webRequest);
  response.writeHead(result.status, Object.fromEntries(result.headers.entries()));
  response.end(Buffer.from(await result.arrayBuffer()));
});

const transport = attachVoiceWebSocketGateway({
  server, authority, mediaFactory, registry,
  silenceWarningAfterMs: env.VOICE_SILENCE_WARNING_SECONDS * 1000,
  idleTimeoutMs: env.VOICE_IDLE_TIMEOUT_SECONDS * 1000,
});
function stop() { registry.pause(); transport.close(); server.close(); }
process.once("SIGTERM", stop);
process.once("SIGINT", stop);

server.listen(env.PORT, "0.0.0.0", () => {
  console.info("voice_gateway_listening", {
    port: env.PORT, mediaReady, gen1Ready, gen2Ready,
  });
});
