import { z } from "zod";
import { apiError, apiJson } from "../../../../../lib/api";
import { getConversationForStream } from "../../../../../lib/flowbot-runtime";
import { rateLimit } from "../../../../../lib/rate-limit";
import { createStreamToken } from "../../../../../lib/stream-token";
import { checkWidgetOrigin, widgetOptions, withWidgetCors } from "../../../../../lib/widget-origin";

const bodySchema = z.object({
  sessionToken: z.string().min(20)
});

export async function OPTIONS(request: Request, { params }: { params: Promise<{ botKey: string }> }) {
  const { botKey } = await params;
  return widgetOptions(botKey, request);
}

export async function POST(request: Request, { params }: { params: Promise<{ botKey: string }> }) {
  const { botKey } = await params;
  const originCheck = await checkWidgetOrigin(botKey, request);
  if (!originCheck.ok) return originCheck.response;
  const limited = rateLimit(request, { scope: "widget-stream-token", limit: 10, windowMs: 60_000 });
  if (limited) return withWidgetCors(limited, originCheck.origin);
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return withWidgetCors(apiError("VALIDATION", "Invalid stream token request.", 422), originCheck.origin);

  const conversation = await getConversationForStream({ botKey, sessionToken: parsed.data.sessionToken });
  if (!conversation) return withWidgetCors(apiError("UNAUTHORIZED", "Invalid or expired session.", 401), originCheck.origin);
  if (conversation.status === "bot") {
    return withWidgetCors(apiError("CONFLICT", "Stream opens only while staff may be involved.", 409), originCheck.origin);
  }

  const { token, expiresAt } = createStreamToken({
    tenantId: conversation.tenant_id,
    botId: conversation.bot_id,
    conversationId: conversation.id
  });
  return withWidgetCors(apiJson({ streamToken: token, expiresAt }), originCheck.origin);
}
