import { z } from "zod";
import { apiError, apiJson } from "../../../../../lib/api";
import { createOrResumeSession } from "../../../../../lib/flowbot-runtime";
import { rateLimit } from "../../../../../lib/rate-limit";
import { checkWidgetOrigin, widgetOptions, withWidgetCors } from "../../../../../lib/widget-origin";

const bodySchema = z.object({
  sessionToken: z.string().optional(),
  lang: z.enum(["th", "en"]).optional(),
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
  const limited = rateLimit(request, { scope: "widget-session", limit: 10, windowMs: 60_000 });
  if (limited) return withWidgetCors(limited, originCheck.origin);
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return withWidgetCors(apiError("VALIDATION", "Invalid session request.", 422), originCheck.origin);

  const session = await createOrResumeSession({
    botKey,
    sessionToken: parsed.data.sessionToken,
    lang: parsed.data.lang,
    afterSequence: parsed.data.afterSequence
  });
  if (!session) return withWidgetCors(apiError("NOT_FOUND", "Bot or published flow not found.", 404), originCheck.origin);
  return withWidgetCors(apiJson(session), originCheck.origin);
}
