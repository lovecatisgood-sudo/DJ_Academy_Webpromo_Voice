import { apiError, apiJson } from "../../../../../../lib/api";
import { publishBot } from "../../../../../../lib/flow-authoring";
import { requireAdmin } from "../../../../../../lib/require-admin";

export async function POST(_request: Request, { params }: { params: Promise<{ botId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return apiError("UNAUTHORIZED", "Authentication required.", 401);
  const { botId } = await params;
  try {
    return apiJson(await publishBot(admin, botId));
  } catch (error) {
    return handleAuthoringError(error);
  }
}

function handleAuthoringError(error: unknown) {
  const status = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 500;
  const details = typeof error === "object" && error && "details" in error ? error.details : undefined;
  return apiError(status === 404 ? "NOT_FOUND" : status === 422 ? "VALIDATION" : "INTERNAL", error instanceof Error ? error.message : "Publish failed.", status, details);
}
