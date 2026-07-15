import { z } from "zod";
import { apiError, apiJson } from "../../../../../../lib/api";
import { createOption } from "../../../../../../lib/flow-authoring";
import { requireAdmin } from "../../../../../../lib/require-admin";

const bodySchema = z.object({
  targetNodeId: z.string().uuid(),
  labelTh: z.string().min(1),
  labelEn: z.string().min(1),
  sortOrder: z.number().int().optional()
});

export async function POST(request: Request, { params }: { params: Promise<{ nodeId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return apiError("UNAUTHORIZED", "Authentication required.", 401);
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError("VALIDATION", "Invalid option request.", 422);
  const { nodeId } = await params;
  try {
    return apiJson({ option: await createOption(admin, nodeId, parsed.data) }, 201);
  } catch (error) {
    const status = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 500;
    return apiError(status === 404 ? "NOT_FOUND" : status === 422 ? "VALIDATION" : "INTERNAL", error instanceof Error ? error.message : "Option request failed.", status);
  }
}
