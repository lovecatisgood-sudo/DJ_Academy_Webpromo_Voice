import { engineInputSchema } from "@flowbot/shared";
import { z } from "zod";
import { apiError, apiJson } from "../../../../../../lib/api";
import { simulateDraft } from "../../../../../../lib/flow-authoring";
import { requireAdmin } from "../../../../../../lib/require-admin";

const bodySchema = z.object({
  state: z
    .object({
      currentNodeId: z.string().uuid().nullable().optional(),
      status: z.enum(["bot", "awaiting_admin", "admin_active"]).optional(),
      lang: z.enum(["th", "en"]).optional()
    })
    .optional(),
  input: engineInputSchema
});

export async function POST(request: Request, { params }: { params: Promise<{ botId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return apiError("UNAUTHORIZED", "Authentication required.", 401);
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError("VALIDATION", "Invalid simulation request.", 422);
  const { botId } = await params;
  try {
    return apiJson(await simulateDraft(admin, botId, parsed.data));
  } catch (error) {
    return handleAuthoringError(error);
  }
}

function handleAuthoringError(error: unknown) {
  const status = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 500;
  const details = typeof error === "object" && error && "details" in error ? error.details : undefined;
  return apiError(status === 404 ? "NOT_FOUND" : status === 422 ? "VALIDATION" : "INTERNAL", error instanceof Error ? error.message : "Simulation failed.", status, details);
}
