import { listLeads } from "../../../../lib/admin-crm";
import { apiError, apiJson } from "../../../../lib/api";
import { requireAdmin } from "../../../../lib/require-admin";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return apiError("UNAUTHORIZED", "Authentication required.", 401);
  return apiJson({ leads: await listLeads(admin) });
}
