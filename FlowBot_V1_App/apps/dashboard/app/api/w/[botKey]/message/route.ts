import { engineInputSchema } from "@flowbot/shared";
import { z } from "zod";
import { apiError, apiJson } from "../../../../../lib/api";
import { processVisitorMessage } from "../../../../../lib/flowbot-runtime";
import { rateLimit } from "../../../../../lib/rate-limit";
import { checkWidgetOrigin, widgetOptions, withWidgetCors } from "../../../../../lib/widget-origin";

const bodySchema = z.object({
  sessionToken: z.string().min(20),
  inputId: z.string().uuid(),
  lang: z.enum(["th", "en"]).optional(),
  input: engineInputSchema
});

export async function OPTIONS(request: Request, { params }: { params: Promise<{ botKey: string }> }) {
  const { botKey } = await params;
  return widgetOptions(botKey, request);
}

export async function POST(request: Request, { params }: { params: Promise<{ botKey: string }> }) {
  const { botKey } = await params;
  const originCheck = await checkWidgetOrigin(botKey, request);
  if (!originCheck.ok) return originCheck.response;
  const limited = rateLimit(request, { scope: "widget-message", limit: 30, windowMs: 60_000 });
  if (limited) return withWidgetCors(limited, originCheck.origin);
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return withWidgetCors(apiError("VALIDATION", "Invalid message request.", 422), originCheck.origin);

  try {
    const response = await processVisitorMessage({
      botKey,
      sessionToken: parsed.data.sessionToken,
      inputId: parsed.data.inputId,
      lang: parsed.data.lang,
      input: parsed.data.input,
      testFault:
        process.env.NODE_ENV !== "production" && request.headers.get("x-flowbot-test-fault") === "after-visitor-message"
          ? "after_visitor_message"
          : undefined
    });
    if (!response) return withWidgetCors(apiError("UNAUTHORIZED", "Invalid or expired session.", 401), originCheck.origin);
    return withWidgetCors(apiJson(response), originCheck.origin);
  } catch (error) {
    const status = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 500;
    return withWidgetCors(
      apiError(status === 409 ? "CONFLICT" : "INTERNAL", error instanceof Error ? error.message : "Message failed.", status),
      originCheck.origin
    );
  }
}
