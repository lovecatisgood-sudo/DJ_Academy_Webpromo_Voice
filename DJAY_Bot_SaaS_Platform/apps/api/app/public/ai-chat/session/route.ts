import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { aiChatCorsHeaders, aiChatRequestCredentials } from "../../../../lib/ai-chat-http";
import { getServices } from "../../../../lib/container";
import { clientAddress, enforceRateLimit, readJson, safeJson } from "../../../../lib/http";

const startSchema = z.object({
  language: z.enum(["th", "en"]).default("th"),
  languageOverride: z.enum(["th", "en"]).optional(),
}).strict();

export async function POST(request: NextRequest) {
  const credentials = aiChatRequestCredentials(request);
  if (!credentials) return safeJson({ status: "not_found" }, 404);
  const services = await getServices();
  if (!services.aiChatRuntimeStore) return safeJson({ status: "not_found" }, 404);
  const allowed = await enforceRateLimit("ai_chat_session_start", `${credentials.deploymentKey}:${clientAddress(request)}`, 30, 60_000);
  if (!allowed.allowed) return safeJson({ status: "rate_limited" }, 429, aiChatCorsHeaders(credentials.origin));
  try {
    const body = startSchema.parse(await readJson(request, 2_000));
    const started = await services.aiChatRuntimeStore.start({
      ...credentials, language: body.language,
      ...(body.languageOverride ? { languageOverride: body.languageOverride } : {}),
    });
    return started
      ? safeJson({ status: "started", ...started }, 201, aiChatCorsHeaders(credentials.origin))
      : safeJson({ status: "not_found" }, 404, aiChatCorsHeaders(credentials.origin));
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400, aiChatCorsHeaders(credentials.origin))
      : safeJson({ status: "not_available" }, 404, aiChatCorsHeaders(credentials.origin));
  }
}

export { OPTIONS } from "../config/route";
