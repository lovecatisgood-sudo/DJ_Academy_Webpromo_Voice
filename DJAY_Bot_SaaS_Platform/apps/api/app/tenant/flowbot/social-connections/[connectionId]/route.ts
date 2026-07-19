import { tenantRoleAllows } from "@djay/authorization";
import { uuidSchema } from "@djay/shared";
import type { NextRequest } from "next/server";
import { hasTrustedOrigin, safeJson } from "../../../../../lib/http";
import { resolveTenantRequest } from "../../../../../lib/tenant-context";

export async function DELETE(request: NextRequest, route: { params: Promise<{ connectionId: string }> }) {
  const resolved = await resolveTenantRequest(request);
  const connectionId = uuidSchema.safeParse((await route.params).connectionId);
  if (!resolved || !connectionId.success || !tenantRoleAllows(resolved.context.role, "integrations.manage")
    || !(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  const result = await resolved.services.tenantFlowSocial.revoke(resolved.context, connectionId.data);
  return safeJson(result, result.status === "revoked" ? 200 : 404);
}
