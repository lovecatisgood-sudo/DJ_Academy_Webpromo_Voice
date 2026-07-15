import { z } from "zod";
import { apiError, apiJson } from "../../../../../lib/api";
import { deleteOption, updateOption } from "../../../../../lib/flow-authoring";
import { requireAdmin } from "../../../../../lib/require-admin";

const patchSchema = z.object({
  targetNodeId: z.string().uuid().optional(),
  labelTh: z.string().min(1).optional(),
  labelEn: z.string().min(1).optional(),
  sortOrder: z.number().int().optional()
});

export async function PATCH(request: Request, { params }: { params: Promise<{ optionId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return apiError("UNAUTHORIZED", "Authentication required.", 401);
  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError("VALIDATION", "Invalid option patch.", 422);
  const { optionId } = await params;
  try {
    return apiJson({ option: await updateOption(admin, optionId, parsed.data) });
  } catch (error) {
    return handleAuthoringError(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ optionId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return apiError("UNAUTHORIZED", "Authentication required.", 401);
  const { optionId } = await params;
  try {
    return apiJson(await deleteOption(admin, optionId));
  } catch (error) {
    return handleAuthoringError(error);
  }
}

function handleAuthoringError(error: unknown) {
  const status = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 500;
  return apiError(status === 404 ? "NOT_FOUND" : status === 422 ? "VALIDATION" : "INTERNAL", error instanceof Error ? error.message : "Option request failed.", status);
}
