import { z } from "zod";
import { getTenantPrivacySettings, updateTenantPrivacySettings } from "../../../../lib/admin-settings";
import { apiError, apiJson } from "../../../../lib/api";
import { requireAdmin } from "../../../../lib/require-admin";

const privacySchema = z.object({
  transcriptRetentionDays: z.number().int().min(30).max(3650).optional(),
  privacyPolicyUrl: z.string().trim().url().optional().or(z.literal("")),
  leadNoticeTh: z.string().trim().max(1000).optional(),
  leadNoticeEn: z.string().trim().max(1000).optional(),
  alertEmail: z.string().trim().email().optional().or(z.literal(""))
});

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return apiError("UNAUTHORIZED", "Authentication required.", 401);
  try {
    return apiJson({ settings: await getTenantPrivacySettings(admin) });
  } catch (error) {
    return handlePrivacyError(error);
  }
}

export async function PATCH(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return apiError("UNAUTHORIZED", "Authentication required.", 401);
  const body = privacySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return apiError("VALIDATION", "Invalid privacy settings.", 422, body.error.flatten());
  try {
    return apiJson({ settings: await updateTenantPrivacySettings(admin, body.data) });
  } catch (error) {
    return handlePrivacyError(error);
  }
}

function handlePrivacyError(error: unknown) {
  const status = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 500;
  return apiError(status === 403 ? "FORBIDDEN" : "INTERNAL", error instanceof Error ? error.message : "Privacy request failed.", status);
}
