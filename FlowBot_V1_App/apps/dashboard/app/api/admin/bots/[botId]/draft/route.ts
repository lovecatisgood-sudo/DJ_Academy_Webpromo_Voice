import { z } from "zod";
import { apiError, apiJson } from "../../../../../../lib/api";
import { createDraftNode, getDraft } from "../../../../../../lib/flow-authoring";
import { requireAdmin } from "../../../../../../lib/require-admin";

const createNodeSchema = z.object({
  type: z.enum(["message", "options", "cta_link", "cta_lead_form", "cta_contact_card", "cta_live_chat", "cta_scheduler"]),
  parentId: z.string().uuid().nullable().optional(),
  title: z.string().min(1),
  contentTh: z.string().optional(),
  contentEn: z.string().optional(),
  sortOrder: z.number().int().optional(),
  config: z.record(z.string(), z.unknown()).optional()
});

export async function GET(_request: Request, { params }: { params: Promise<{ botId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return apiError("UNAUTHORIZED", "Authentication required.", 401);
  const { botId } = await params;
  try {
    return apiJson(await getDraft(admin, botId));
  } catch (error) {
    return handleAuthoringError(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ botId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return apiError("UNAUTHORIZED", "Authentication required.", 401);
  const parsed = createNodeSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError("VALIDATION", "Invalid node request.", 422);
  const { botId } = await params;
  try {
    return apiJson({ node: await createDraftNode(admin, botId, parsed.data) }, 201);
  } catch (error) {
    return handleAuthoringError(error);
  }
}

function handleAuthoringError(error: unknown) {
  const status = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 500;
  return apiError(status === 404 ? "NOT_FOUND" : status === 422 ? "VALIDATION" : "INTERNAL", error instanceof Error ? error.message : "Authoring request failed.", status);
}
