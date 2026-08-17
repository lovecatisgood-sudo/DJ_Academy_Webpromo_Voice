import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { aiChatCorsHeaders, aiChatRequestCredentials } from "../../../../lib/ai-chat-http";
import { getServices } from "../../../../lib/container";
import { clientAddress, enforceRateLimit, safeJson } from "../../../../lib/http";

export async function POST(request: NextRequest) {
  const credentials = aiChatRequestCredentials(request);
  if (!credentials) return safeJson({ status: "not_found" }, 404);
  const services = await getServices();
  if (!services.aiChatRuntimeStore) return safeJson({ status: "not_found" }, 404);
  const allowed = await enforceRateLimit("ai_chat_install", `${credentials.deploymentKey}:${clientAddress(request)}`, 30, 60_000);
  if (!allowed.allowed) return safeJson({ status: "rate_limited" }, 429, aiChatCorsHeaders(credentials.origin));
  const verified = await services.aiChatRuntimeStore.reportInstall(credentials.deploymentKey, credentials.origin);
  return safeJson({ status: "recorded", verified }, 200, aiChatCorsHeaders(credentials.origin));
}

export async function OPTIONS(request: NextRequest) {
  const credentials = aiChatRequestCredentials(request);
  return credentials
    ? new NextResponse(null, { status: 204, headers: aiChatCorsHeaders(credentials.origin) })
    : safeJson({ status: "not_found" }, 404);
}
