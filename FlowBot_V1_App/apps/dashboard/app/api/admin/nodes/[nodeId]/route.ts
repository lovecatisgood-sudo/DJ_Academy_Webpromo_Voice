import { z } from "zod";
import { apiError, apiJson } from "../../../../../lib/api";
import { deleteNode, updateNode } from "../../../../../lib/flow-authoring";
import { requireAdmin } from "../../../../../lib/require-admin";

const patchSchema = z.object({
  type: z.enum(["message", "options", "cta_link", "cta_lead_form", "cta_contact_card", "cta_live_chat", "cta_scheduler"]).optional(),
  parentId: z.string().uuid().nullable().optional(),
  nextNodeId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().optional(),
  title: z.string().min(1).optional(),
  contentTh: z.string().optional(),
  contentEn: z.string().optional(),
  searchableContent: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional()
});

export async function PATCH(request: Request, { params }: { params: Promise<{ nodeId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return apiError("UNAUTHORIZED", "Authentication required.", 401);
  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError("VALIDATION", "Invalid node patch.", 422);
  const { nodeId } = await params;
  try {
    return apiJson({ node: await updateNode(admin, nodeId, parsed.data) });
  } catch (error) {
    return handleAuthoringError(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ nodeId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return apiError("UNAUTHORIZED", "Authentication required.", 401);
  const mode = new URL(request.url).searchParams.get("mode") === "detach" ? "detach" : "cascade";
  const { nodeId } = await params;
  try {
    return apiJson(await deleteNode(admin, nodeId, mode));
  } catch (error) {
    return handleAuthoringError(error);
  }
}

function handleAuthoringError(error: unknown) {
  const status = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 500;
  const details = typeof error === "object" && error && "details" in error ? error.details : undefined;
  return apiError(
    status === 404 ? "NOT_FOUND" : status === 409 ? "CONFLICT" : status === 422 ? "VALIDATION" : "INTERNAL",
    error instanceof Error ? error.message : "Node request failed.",
    status,
    details
  );
}
