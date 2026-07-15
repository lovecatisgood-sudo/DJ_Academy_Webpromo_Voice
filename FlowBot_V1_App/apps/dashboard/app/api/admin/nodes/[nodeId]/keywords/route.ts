import { z } from "zod";
import { apiError, apiJson } from "../../../../../../lib/api";
import { replaceKeywords } from "../../../../../../lib/flow-authoring";
import { requireAdmin } from "../../../../../../lib/require-admin";

const bodySchema = z.object({
  keywords: z.array(
    z.object({
      lang: z.enum(["th", "en"]),
      keyword: z.string().min(1),
      priority: z.number().int().optional(),
      substringEnabled: z.boolean().optional()
    })
  )
});

export async function PUT(request: Request, { params }: { params: Promise<{ nodeId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return apiError("UNAUTHORIZED", "Authentication required.", 401);
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError("VALIDATION", "Invalid keywords request.", 422);
  const { nodeId } = await params;
  try {
    return apiJson(await replaceKeywords(admin, nodeId, parsed.data.keywords));
  } catch (error) {
    const status = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 500;
    return apiError(status === 404 ? "NOT_FOUND" : "INTERNAL", error instanceof Error ? error.message : "Keywords request failed.", status);
  }
}
