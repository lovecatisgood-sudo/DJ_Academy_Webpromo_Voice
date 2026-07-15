import { z } from "zod";
import { apiError, apiJson } from "../../../../../lib/api";
import { syncConversation } from "../../../../../lib/flowbot-runtime";
import { rateLimit } from "../../../../../lib/rate-limit";
import { checkWidgetOrigin, widgetOptions, withWidgetCors } from "../../../../../lib/widget-origin";

const bodySchema = z.object({
  sessionToken: z.string().min(20),
  afterSequence: z.string().regex(/^\d+$/).optional()
});

export async function OPTIONS(request: Request, { params }: { params: Promise<{ botKey: string }> }) {
  const { botKey } = await params;
  return widgetOptions(botKey, request);
}

export async function POST(request: Request, { params }: { params: Promise<{ botKey: string }> }) {
  const { botKey } = await params;
  const originCheck = await checkWidgetOrigin(botKey, request);
  if (!originCheck.ok) return originCheck.response;
  const limited = rateLimit(request, { scope: "widget-sync", limit: 30, windowMs: 60_000 });
  if (limited) return withWidgetCors(limited, originCheck.origin);
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return withWidgetCors(apiError("VALIDATION", "Invalid sync request.", 422), originCheck.origin);

  const response = await syncConversation({
    botKey,
    sessionToken: parsed.data.sessionToken,
    afterSequence: parsed.data.afterSequence
  });
  if (!response) return withWidgetCors(apiError("UNAUTHORIZED", "Invalid or expired session.", 401), originCheck.origin);
  return withWidgetCors(apiJson(response), originCheck.origin);
}
