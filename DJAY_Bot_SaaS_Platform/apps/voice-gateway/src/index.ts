import { createServer } from "node:http";
import { z } from "zod";
import { createVoiceGatewayHandler, type VoiceSessionAuthorizer } from "./server";

const env = z.object({
  PORT: z.coerce.number().int().min(1).max(65_535).default(8080),
  VOICE_GATEWAY_MAX_SESSIONS: z.coerce.number().int().positive().default(100),
  VOICE_AUTHORIZATION_ENDPOINT: z.string().url(),
  VOICE_AUTHORIZATION_SERVICE_TOKEN: z.string().min(32),
}).passthrough().parse(process.env);

const authorizer: VoiceSessionAuthorizer = {
  async authorize(input) {
    const response = await fetch(env.VOICE_AUTHORIZATION_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.VOICE_AUTHORIZATION_SERVICE_TOKEN}`,
        "content-type": "application/json",
        "idempotency-key": input.connectionId,
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(5_000),
    });
    return response.ok ? response.json() : null;
  },
};

let activeSessions = 0;
let acceptingNewSessions = true;
const handler = createVoiceGatewayHandler({
  authorizer,
  ready: () => true,
  capacity: () => ({ acceptingNewSessions, activeSessions, maxSessions: env.VOICE_GATEWAY_MAX_SESSIONS }),
});

process.on("SIGTERM", () => { acceptingNewSessions = false; });
process.on("SIGINT", () => { acceptingNewSessions = false; });

createServer(async (request, response) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const method = request.method ?? "GET";
  const init: RequestInit = { method, headers: request.headers as HeadersInit };
  if (method !== "GET" && method !== "HEAD" && body) init.body = body;
  const webRequest = new Request(`http://127.0.0.1:${env.PORT}${request.url ?? "/"}`, init);
  const result = await handler(webRequest);
  response.writeHead(result.status, Object.fromEntries(result.headers.entries()));
  response.end(Buffer.from(await result.arrayBuffer()));
}).listen(env.PORT, "0.0.0.0", () => {
  console.info("voice_gateway_listening", { port: env.PORT });
});

export function trackActiveSession(delta: 1 | -1) { activeSessions = Math.max(0, activeSessions + delta); }
