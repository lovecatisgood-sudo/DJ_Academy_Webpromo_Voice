import { apiError, apiJson } from "../../../../../../lib/api";
import { getNodeReferences } from "../../../../../../lib/flow-authoring";
import { requireAdmin } from "../../../../../../lib/require-admin";

export async function GET(_request: Request, { params }: { params: Promise<{ nodeId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return apiError("UNAUTHORIZED", "Authentication required.", 401);
  const { nodeId } = await params;
  try {
    return apiJson(await getNodeReferences(admin, nodeId));
  } catch (error) {
    const status = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 500;
    return apiError(status === 404 ? "NOT_FOUND" : "INTERNAL", error instanceof Error ? error.message : "References request failed.", status);
  }
}
