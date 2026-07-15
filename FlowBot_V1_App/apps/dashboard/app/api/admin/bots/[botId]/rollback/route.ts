import { z } from "zod";
import { apiError, apiJson } from "../../../../../../lib/api";
import { rollbackBot } from "../../../../../../lib/flow-authoring";
import { requireAdmin } from "../../../../../../lib/require-admin";

const bodySchema = z.object({
  versionNo: z.number().int().positive()
});

export async function POST(request: Request, { params }: { params: Promise<{ botId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return apiError("UNAUTHORIZED", "Authentication required.", 401);
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError("VALIDATION", "Invalid rollback request.", 422);
  const { botId } = await params;
  try {
    return apiJson(await rollbackBot(admin, botId, parsed.data.versionNo));
  } catch (error) {
    const status = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 500;
    return apiError(status === 404 ? "NOT_FOUND" : "INTERNAL", error instanceof Error ? error.message : "Rollback failed.", status);
  }
}
