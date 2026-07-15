import { voiceProtocolVersion } from "@djay/voice-runtime";
import { z } from "zod";

const connectSchema = z.object({
  sessionId: z.uuid(),
  origin: z.string().url().max(2048),
  protocolVersion: z.literal(voiceProtocolVersion),
  connectionId: z.uuid(),
}).strict();

export type AuthorizedVoiceSession = Readonly<{
  sessionId: string;
  capabilityProfile: "voice_gen1" | "voice_gen2";
  locale: "th" | "en";
  maxCallSeconds: number;
  resumeWindowSeconds: number;
  replayed: boolean;
}>;

export interface VoiceSessionAuthorizer {
  authorize(input: Readonly<{ sessionGrant: string; sessionId: string; origin: string; protocolVersion: typeof voiceProtocolVersion; connectionId: string }>): Promise<AuthorizedVoiceSession | null>;
}

export type VoiceGatewayCapacity = Readonly<{ acceptingNewSessions: boolean; activeSessions: number; maxSessions: number }>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

function bearer(request: Request) {
  const header = request.headers.get("authorization");
  return header?.startsWith("Bearer djay_voice_grant_") ? header.slice(7) : null;
}

export function createVoiceGatewayHandler(input: Readonly<{
  authorizer: VoiceSessionAuthorizer;
  capacity: () => VoiceGatewayCapacity;
  ready: () => boolean;
}>) {
  return async (request: Request) => {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health/live") return json({ status: "live" });
    if (request.method === "GET" && url.pathname === "/health/ready") {
      return input.ready() ? json({ status: "ready" }) : json({ status: "not_ready" }, 503);
    }
    if (request.method === "GET" && url.pathname === "/v1/capacity") {
      const capacity = input.capacity();
      return json({ status: capacity.acceptingNewSessions ? "available" : "paused", ...capacity });
    }
    if (request.method !== "POST" || url.pathname !== "/v1/sessions/connect") return json({ status: "not_found" }, 404);
    const capacity = input.capacity();
    if (!capacity.acceptingNewSessions || capacity.activeSessions >= capacity.maxSessions) {
      return json({ status: "rejected", code: "capacity_unavailable", retryable: true }, 503);
    }
    const sessionGrant = bearer(request);
    if (!sessionGrant) return json({ status: "rejected", code: "grant_invalid", retryable: false }, 401);
    try {
      const body = connectSchema.parse(await request.json());
      const authorized = await input.authorizer.authorize({ sessionGrant, ...body });
      if (!authorized || authorized.sessionId !== body.sessionId) {
        return json({ status: "rejected", code: "session_unavailable", retryable: false }, 404);
      }
      return json({
        status: "authorized", sessionId: authorized.sessionId,
        protocolVersion: voiceProtocolVersion, capabilityProfile: authorized.capabilityProfile,
        locale: authorized.locale, maxCallSeconds: authorized.maxCallSeconds,
        resumeWindowSeconds: authorized.resumeWindowSeconds, resumed: authorized.replayed,
      });
    } catch (error) {
      return error instanceof z.ZodError || error instanceof SyntaxError
        ? json({ status: "rejected", code: "protocol_unsupported", retryable: false }, 400)
        : json({ status: "rejected", code: "session_unavailable", retryable: true }, 503);
    }
  };
}
