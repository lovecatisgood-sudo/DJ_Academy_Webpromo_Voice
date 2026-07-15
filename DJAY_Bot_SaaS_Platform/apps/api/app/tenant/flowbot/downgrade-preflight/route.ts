import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { safeJson } from "../../../../lib/http";
import { resolveTenantRequest } from "../../../../lib/tenant-context";

export async function GET(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "subscriptions.manage")) return safeJson({ status: "not_found" }, 404);
  const preflight = await resolved.services.flowbot.downgradePreflight(resolved.context);
  return preflight ? safeJson({ preflight }) : safeJson({ status: "not_found" }, 404);
}
