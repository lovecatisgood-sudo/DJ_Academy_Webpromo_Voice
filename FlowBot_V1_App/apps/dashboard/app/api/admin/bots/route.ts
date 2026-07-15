import { apiError, apiJson } from "../../../../lib/api";
import { listBots } from "../../../../lib/flow-authoring";
import { requireAdmin } from "../../../../lib/require-admin";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return apiError("UNAUTHORIZED", "Authentication required.", 401);
  return apiJson({ bots: await listBots(admin) });
}
