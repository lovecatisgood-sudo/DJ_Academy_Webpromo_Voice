import { apiError, apiJson } from "../../../../../../lib/api";
import { listVersions } from "../../../../../../lib/flow-authoring";
import { requireAdmin } from "../../../../../../lib/require-admin";

export async function GET(_request: Request, { params }: { params: Promise<{ botId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return apiError("UNAUTHORIZED", "Authentication required.", 401);
  const { botId } = await params;
  try {
    return apiJson({ versions: await listVersions(admin, botId) });
  } catch (error) {
    const status = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 500;
    return apiError(status === 404 ? "NOT_FOUND" : "INTERNAL", error instanceof Error ? error.message : "Versions request failed.", status);
  }
}
