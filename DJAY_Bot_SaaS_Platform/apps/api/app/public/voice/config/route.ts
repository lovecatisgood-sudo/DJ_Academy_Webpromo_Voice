import type { NextRequest } from "next/server";
import { getServices } from "../../../../lib/container";
import { safeJson } from "../../../../lib/http";
import { voiceCorsHeaders, voiceRequestCredentials } from "../../../../lib/voice-http";

export async function GET(request: NextRequest) {
  const credentials = voiceRequestCredentials(request);
  if (!credentials) return safeJson({ status: "not_found" }, 404);
  const services = await getServices();
  if (!services.voiceRuntime) return safeJson({ status: "not_found" }, 404);
  try {
    const config = await services.voiceRuntime.config(credentials);
    if (!config) return safeJson({ status: "not_found" }, 404, voiceCorsHeaders(credentials.origin));
    return safeJson({ status: "available", config }, 200, voiceCorsHeaders(credentials.origin));
  } catch {
    return safeJson({ status: "not_found" }, 404, voiceCorsHeaders(credentials.origin));
  }
}

export async function OPTIONS(request: NextRequest) {
  const credentials = voiceRequestCredentials(request);
  return credentials ? new Response(null, { status: 204, headers: voiceCorsHeaders(credentials.origin) })
    : safeJson({ status: "not_found" }, 404);
}
