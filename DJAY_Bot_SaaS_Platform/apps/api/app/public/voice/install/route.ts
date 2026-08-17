import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServices } from "../../../../lib/container";
import { clientAddress, enforceRateLimit, safeJson } from "../../../../lib/http";
import { voiceCorsHeaders, voiceRequestCredentials } from "../../../../lib/voice-http";

export async function POST(request: NextRequest) {
  const credentials = voiceRequestCredentials(request);
  if (!credentials) return safeJson({ status: "not_found" }, 404);
  const services = await getServices();
  if (!services.voiceRuntime) return safeJson({ status: "not_found" }, 404);
  const allowed = await enforceRateLimit("voice_install", `${credentials.deploymentKey}:${clientAddress(request)}`, 30, 60_000);
  if (!allowed.allowed) return safeJson({ status: "rate_limited" }, 429, voiceCorsHeaders(credentials.origin));
  const verified = await services.voiceRuntime.reportInstall(credentials.deploymentKey, credentials.origin);
  return safeJson({ status: "recorded", verified }, 200, voiceCorsHeaders(credentials.origin));
}

export async function OPTIONS(request: NextRequest) {
  const credentials = voiceRequestCredentials(request);
  return credentials
    ? new NextResponse(null, { status: 204, headers: voiceCorsHeaders(credentials.origin) })
    : safeJson({ status: "not_found" }, 404);
}
