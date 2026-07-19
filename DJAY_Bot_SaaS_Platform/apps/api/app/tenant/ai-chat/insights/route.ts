import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { safeJson } from "../../../../lib/http";
import { resolveTenantRequest } from "../../../../lib/tenant-context";

export async function GET(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "ai_chat.read")) return safeJson({ status: "not_found" }, 404);
  return safeJson({ insights: await resolved.services.tenantAiOperations.insights(resolved.context) });
}
