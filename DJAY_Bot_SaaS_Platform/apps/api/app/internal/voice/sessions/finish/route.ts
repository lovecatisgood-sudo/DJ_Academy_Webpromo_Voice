import { ZodError, z } from "zod";
import { getServices } from "../../../../../lib/container";
import { readJson, safeJson } from "../../../../../lib/http";
import { hasVoiceServiceAuthority } from "../../../../../lib/voice-http";

const schema = z.object({
  sessionId: z.uuid(), connectionId: z.uuid(), elapsedSeconds: z.number().int().nonnegative().max(14_700),
  terminalReason: z.enum(["completed", "customer_ended", "time_limit", "idle_timeout", "transferred", "callback_requested", "unavailable", "grant_expired"]),
}).strict();

export async function POST(request: Request) {
  const services = await getServices();
  if (!hasVoiceServiceAuthority(request, services.env.VOICE_AUTHORIZATION_SERVICE_TOKEN)) return safeJson({ status: "not_found" }, 404);
  if (!services.voiceRuntime) return safeJson({ status: "not_available" }, 503);
  try {
    return safeJson(await services.voiceRuntime.finish(schema.parse(await readJson(request, 2_000))));
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400) : safeJson({ status: "not_available" }, 409);
  }
}
