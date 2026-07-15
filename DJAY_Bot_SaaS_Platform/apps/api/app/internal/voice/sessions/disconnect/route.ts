import { ZodError, z } from "zod";
import { getServices } from "../../../../../lib/container";
import { readJson, safeJson } from "../../../../../lib/http";
import { hasVoiceServiceAuthority } from "../../../../../lib/voice-http";

const schema = z.object({ sessionId: z.uuid(), connectionId: z.uuid() }).strict();

export async function POST(request: Request) {
  const services = await getServices();
  if (!hasVoiceServiceAuthority(request, services.env.VOICE_AUTHORIZATION_SERVICE_TOKEN)) return safeJson({ status: "not_found" }, 404);
  if (!services.voiceRuntime) return safeJson({ status: "not_available" }, 503);
  try {
    const body = schema.parse(await readJson(request, 2_000));
    return await services.voiceRuntime.disconnect(body.sessionId, body.connectionId)
      ? safeJson({ status: "disconnected" }) : safeJson({ status: "not_available" }, 409);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400) : safeJson({ status: "not_available" }, 409);
  }
}
