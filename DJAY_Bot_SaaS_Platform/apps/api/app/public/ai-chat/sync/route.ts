import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { aiChatCorsHeaders, aiChatRequestCredentials, aiChatSessionToken } from "../../../../lib/ai-chat-http";
import { getServices } from "../../../../lib/container";
import { clientAddress, enforceRateLimit, readJson, safeJson } from "../../../../lib/http";

const syncSchema = z.object({ afterSequence: z.number().int().min(0).max(2_147_483_646) }).strict();

export async function POST(request: NextRequest) {
  const credentials = aiChatRequestCredentials(request);
  const sessionToken = aiChatSessionToken(request);
  if (!credentials || !sessionToken) return safeJson({ status: "not_found" }, 404);
  const services = await getServices();
  if (!services.aiChatRuntimeStore) return safeJson({ status: "not_found" }, 404);
  const allowed = await enforceRateLimit("ai_chat_sync", `${credentials.deploymentKey}:${clientAddress(request)}`, 240, 60_000);
  if (!allowed.allowed) return safeJson({ status: "rate_limited" }, 429, aiChatCorsHeaders(credentials.origin));
  try {
    const body = syncSchema.parse(await readJson(request, 2_000));
    const response = await services.aiChatRuntimeStore.sync({ ...credentials, sessionToken, afterSequence: body.afterSequence });
    return response
      ? safeJson({ status: "synced", response }, 200, aiChatCorsHeaders(credentials.origin))
      : safeJson({ status: "not_found" }, 404, aiChatCorsHeaders(credentials.origin));
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400, aiChatCorsHeaders(credentials.origin))
      : safeJson({ status: "not_available" }, 409, aiChatCorsHeaders(credentials.origin));
  }
}

export { OPTIONS } from "../config/route";
