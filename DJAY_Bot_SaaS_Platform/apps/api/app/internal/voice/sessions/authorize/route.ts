import { voiceProtocolVersion } from "@djay/voice-runtime";
import { ZodError, z } from "zod";
import { getServices } from "../../../../../lib/container";
import { readJson, safeJson } from "../../../../../lib/http";
import { hasVoiceServiceAuthority } from "../../../../../lib/voice-http";

const schema = z.object({
  sessionGrant: z.string().startsWith("djay_voice_grant_").min(48).max(256),
  sessionId: z.uuid(), origin: z.string().url().max(2048),
  protocolVersion: z.literal(voiceProtocolVersion), connectionId: z.uuid(),
}).strict();

export async function POST(request: Request) {
  const services = await getServices();
  if (!hasVoiceServiceAuthority(request, services.env.VOICE_AUTHORIZATION_SERVICE_TOKEN)) {
    return safeJson({ status: "not_found" }, 404);
  }
  if (!services.voiceRuntime) return safeJson({ status: "not_available" }, 503);
  try {
    const authorized = await services.voiceRuntime.authorize(schema.parse(await readJson(request, 4_000)));
    return authorized ? safeJson(authorized) : safeJson({ status: "not_available" }, 404);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400)
      : safeJson({ status: "not_available" }, 409);
  }
}
