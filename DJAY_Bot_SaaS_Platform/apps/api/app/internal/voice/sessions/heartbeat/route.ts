import { z } from "zod";
import type { NextRequest } from "next/server";
import { getServices } from "../../../../../lib/container";
import { readJson, safeJson } from "../../../../../lib/http";
import { hasVoiceServiceAuthority } from "../../../../../lib/voice-http";

const schema = z.object({ sessionId: z.uuid(), connectionId: z.uuid() }).strict();

export async function POST(request: NextRequest) {
  const services = await getServices();
  if (!hasVoiceServiceAuthority(request, services.env.VOICE_AUTHORIZATION_SERVICE_TOKEN)) {
    return safeJson({ status: "not_found" }, 404);
  }
  if (!services.voiceRuntime) return safeJson({ status: "not_available" }, 503);
  try {
    const body = schema.parse(await readJson(request, 2_000));
    return safeJson(await services.voiceRuntime.heartbeat(body.sessionId, body.connectionId));
  } catch {
    return safeJson({ status: "not_available" }, 503);
  }
}
