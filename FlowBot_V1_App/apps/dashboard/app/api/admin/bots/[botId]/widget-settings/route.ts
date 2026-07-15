import { z } from "zod";
import { getWidgetSettings, updateWidgetSettings } from "../../../../../../lib/admin-settings";
import { apiError, apiJson } from "../../../../../../lib/api";
import { requireAdmin } from "../../../../../../lib/require-admin";

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  themeColor: z.string().trim().max(32).optional(),
  color: z.string().trim().max(32).optional(),
  position: z.enum(["bl", "br"]).optional(),
  logoUrl: z.string().trim().url().nullable().optional().or(z.literal("")),
  openOnLoad: z.boolean().optional(),
  langToggle: z.boolean().optional(),
  greetingTh: z.string().trim().max(500).optional(),
  greetingEn: z.string().trim().max(500).optional(),
  defaultLang: z.enum(["th", "en"]).optional(),
  allowedOrigins: z.array(z.string().trim().url()).max(20).optional()
});

export async function GET(_request: Request, { params }: { params: Promise<{ botId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return apiError("UNAUTHORIZED", "Authentication required.", 401);
  const { botId } = await params;
  const settings = await getWidgetSettings(admin, botId);
  if (!settings) return apiError("NOT_FOUND", "Bot not found.", 404);
  return apiJson(settings);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ botId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return apiError("UNAUTHORIZED", "Authentication required.", 401);
  const body = patchSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return apiError("VALIDATION", "Invalid widget settings.", 422, body.error.flatten());
  const { botId } = await params;
  const settings = await updateWidgetSettings(admin, botId, body.data);
  if (!settings) return apiError("NOT_FOUND", "Bot not found.", 404);
  return apiJson(settings);
}
