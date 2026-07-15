import { z } from "zod";
import { channelTypes, listContactChannels, upsertContactChannels } from "../../../../../../lib/admin-settings";
import { apiError, apiJson } from "../../../../../../lib/api";
import { requireAdmin } from "../../../../../../lib/require-admin";

const channelSchema = z.object({
  id: z.string().uuid().optional(),
  type: z.enum(channelTypes),
  label: z.string().trim().min(1).max(80),
  value: z.string().trim().min(1).max(300),
  sortOrder: z.number().int().min(0).max(1000).optional()
});

const bodySchema = z.object({
  channels: z.array(channelSchema).max(20)
});

export async function GET(_request: Request, { params }: { params: Promise<{ botId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return apiError("UNAUTHORIZED", "Authentication required.", 401);
  const { botId } = await params;
  try {
    return apiJson({ channels: await listContactChannels(admin, botId) });
  } catch (error) {
    return handleSettingsError(error);
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ botId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return apiError("UNAUTHORIZED", "Authentication required.", 401);
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return apiError("VALIDATION", "Invalid contact channels.", 422, body.error.flatten());
  const { botId } = await params;
  try {
    return apiJson({ channels: await upsertContactChannels(admin, botId, body.data.channels) });
  } catch (error) {
    return handleSettingsError(error);
  }
}

function handleSettingsError(error: unknown) {
  const status = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 500;
  return apiError(status === 404 ? "NOT_FOUND" : "INTERNAL", error instanceof Error ? error.message : "Settings request failed.", status);
}
