import { AiTextRuntimeError } from "@djay/ai-chat-runtime";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import {
  aiChatCorsHeaders, aiChatNdjson, aiChatRequestCredentials, aiChatSessionToken,
} from "../../../../lib/ai-chat-http";
import { getServices } from "../../../../lib/container";
import { clientAddress, enforceRateLimit, readJson, safeJson } from "../../../../lib/http";

const messageSchema = z.object({ inputId: z.uuid(), message: z.string().trim().min(1).max(2000) }).strict();

export async function POST(request: NextRequest) {
  const credentials = aiChatRequestCredentials(request);
  const sessionToken = aiChatSessionToken(request);
  if (!credentials || !sessionToken) return safeJson({ status: "not_found" }, 404);
  const services = await getServices();
  if (!services.aiChatRuntime) return safeJson({ status: "not_found" }, 404);
  const allowed = await enforceRateLimit("ai_chat_message", `${credentials.deploymentKey}:${clientAddress(request)}`, 60, 60_000);
  if (!allowed.allowed) return safeJson({ status: "rate_limited" }, 429, aiChatCorsHeaders(credentials.origin));
  try {
    const body = messageSchema.parse(await readJson(request, 8_000));
    const response = await services.aiChatRuntime.turn({ ...credentials, sessionToken, ...body });
    return aiChatNdjson(response, credentials.origin);
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return safeJson({ status: "validation_failed" }, 400, aiChatCorsHeaders(credentials.origin));
    }
    if (error instanceof AiTextRuntimeError && error.code === "turn_busy") {
      return safeJson({ status: "turn_busy" }, 409, aiChatCorsHeaders(credentials.origin));
    }
    return safeJson({ status: "temporarily_unavailable" }, 503, aiChatCorsHeaders(credentials.origin));
  }
}

export { OPTIONS } from "../config/route";
