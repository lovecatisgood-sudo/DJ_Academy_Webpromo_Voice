import { apiError, apiJson } from "../../../../lib/api";
import { listDashboardConversations } from "../../../../lib/admin-crm";
import { requireAdmin } from "../../../../lib/require-admin";

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return apiError("UNAUTHORIZED", "Authentication required.", 401);
  const searchParams = new URL(request.url).searchParams;
  return apiJson({
    conversations: await listDashboardConversations(admin, {
      q: searchParams.get("q") ?? undefined,
      status: searchParams.get("status") ?? undefined
    })
  });
}
