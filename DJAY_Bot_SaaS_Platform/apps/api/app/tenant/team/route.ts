import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { safeJson } from "../../../lib/http";
import { resolveTenantRequest } from "../../../lib/tenant-context";

export async function GET(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "team.read")) {
    return safeJson({ status: "not_found" }, 404);
  }
  const team = await resolved.services.tenantWorkspace.getTeamOverview(resolved.context);
  return safeJson({ team });
}
