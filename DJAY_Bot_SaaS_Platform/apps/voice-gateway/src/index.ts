import { createServer } from "node:http";
import { z } from "zod";
import { createVoiceGatewayHandler } from "./server";
import {
  attachVoiceWebSocketGateway,
  VoiceGatewayRegistry,
  type VoiceMediaFactory,
  type VoiceSessionAuthority,
} from "./transport";

const env = z.object({
  PORT: z.coerce.number().int().min(1).max(65_535).default(8080),
  VOICE_GATEWAY_MAX_SESSIONS: z.coerce.number().int().positive().default(100),
  VOICE_AUTHORIZATION_ENDPOINT: z.string().url(),
  VOICE_HEARTBEAT_ENDPOINT: z.string().url(),
  VOICE_DISCONNECT_ENDPOINT: z.string().url(),
  VOICE_FINISH_ENDPOINT: z.string().url(),
  VOICE_AUTHORIZATION_SERVICE_TOKEN: z.string().min(32),
}).passthrough().parse(process.env);

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
  authorize(input) { return authorityRequest(env.VOICE_AUTHORIZATION_ENDPOINT, input, input.connectionId); },
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

// P7 remains fail-closed until the restricted realtime media adapter is installed.
const mediaFactory: VoiceMediaFactory = {
  async open() { throw new Error("voice_media_not_configured"); },
};
const mediaReady = false;
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

const transport = attachVoiceWebSocketGateway({ server, authority, mediaFactory, registry });
function stop() { registry.pause(); transport.close(); server.close(); }
process.once("SIGTERM", stop);
process.once("SIGINT", stop);

server.listen(env.PORT, "0.0.0.0", () => {
  console.info("voice_gateway_listening", { port: env.PORT, mediaReady });
});
