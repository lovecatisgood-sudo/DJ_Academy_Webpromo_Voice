import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { aiChatCorsHeaders, aiChatRequestCredentials } from "../../../../lib/ai-chat-http";
import { getServices } from "../../../../lib/container";
import { safeJson } from "../../../../lib/http";

async function resolve(request: NextRequest) {
  const credentials = aiChatRequestCredentials(request);
  if (!credentials) return null;
  const services = await getServices();
  if (!services.aiChatRuntimeStore) return null;
  const config = await services.aiChatRuntimeStore.config(credentials.deploymentKey, credentials.origin);
  return config ? { config, origin: credentials.origin } : null;
}

export async function GET(request: NextRequest) {
  const resolved = await resolve(request);
  return resolved
    ? safeJson({ status: "available", config: resolved.config }, 200, aiChatCorsHeaders(resolved.origin))
    : safeJson({ status: "not_found" }, 404);
}

export async function OPTIONS(request: NextRequest) {
  const resolved = await resolve(request);
  return resolved
    ? new NextResponse(null, { status: 204, headers: aiChatCorsHeaders(resolved.origin) })
    : safeJson({ status: "not_found" }, 404);
}
