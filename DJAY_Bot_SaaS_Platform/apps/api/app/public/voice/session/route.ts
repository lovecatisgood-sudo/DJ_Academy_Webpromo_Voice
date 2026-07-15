import { voiceSessionGrantSchema } from "@djay/voice-runtime";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { getServices } from "../../../../lib/container";
import { clientAddress, enforceRateLimit, readJson, safeJson } from "../../../../lib/http";
import { voiceCorsHeaders, voiceRequestCredentials } from "../../../../lib/voice-http";

const startSchema = z.object({ locale: z.enum(["th", "en"]).default("th") }).strict();

export async function POST(request: NextRequest) {
  const credentials = voiceRequestCredentials(request);
  if (!credentials) return safeJson({ status: "not_found" }, 404);
  const services = await getServices();
  if (!services.voiceRuntime || !services.env.VOICE_GATEWAY_URL) return safeJson({ status: "not_found" }, 404);
  const allowed = await enforceRateLimit("voice_session_issue", `${credentials.deploymentKey}:${clientAddress(request)}`, 10, 60_000);
  if (!allowed.allowed) return safeJson({ status: "rate_limited" }, 429, voiceCorsHeaders(credentials.origin));
  try {
    const body = startSchema.parse(await readJson(request, 1_000));
    const issued = await services.voiceRuntime.issue({
      ...credentials, locale: body.locale,
      expiresAt: new Date(Date.now() + services.env.VOICE_SESSION_GRANT_TTL_SECONDS * 1000),
    });
    const grant = voiceSessionGrantSchema.parse({
      sessionId: issued.sessionId, sessionGrant: issued.sessionGrant,
      gatewayUrl: services.env.VOICE_GATEWAY_URL, protocolVersion: "djay.voice.v1",
      capabilityProfile: issued.capabilityProfile, publicLabel: issued.publicLabel,
      expiresAt: issued.expiresAt, maxCallSeconds: issued.maxCallSeconds,
      locale: issued.locale, greeting: issued.greeting,
      reconnectPolicy: {
        maxAttempts: services.env.VOICE_RECONNECT_MAX_ATTEMPTS,
        backoffMs: services.env.VOICE_RECONNECT_BACKOFF_MS,
        resumeWindowSeconds: issued.reconnectWindowSeconds,
      },
      automatedAgentDisclosure: { required: true, text: issued.automatedDisclosure },
      recording: { enabled: false, disclosure: null },
    });
    return safeJson({ status: "issued", grant }, 201, voiceCorsHeaders(credentials.origin));
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400, voiceCorsHeaders(credentials.origin))
      : safeJson({ status: "not_available" }, 404, voiceCorsHeaders(credentials.origin));
  }
}

export async function OPTIONS(request: NextRequest) {
  const credentials = voiceRequestCredentials(request);
  if (!credentials) return safeJson({ status: "not_found" }, 404);
  const services = await getServices();
  if (!services.voiceRuntime) return safeJson({ status: "not_found" }, 404);
  return new NextResponse(null, { status: 204, headers: voiceCorsHeaders(credentials.origin) });
}
