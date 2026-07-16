import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { safeJson } from "../../../lib/http";
import { resolveTenantRequest } from "../../../lib/tenant-context";

export async function GET(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "usage.read")) {
    return safeJson({ status: "not_found" }, 404);
  }
  return safeJson({ usage: await resolved.services.tenantCommerce.usageOverview(resolved.context) });
}
