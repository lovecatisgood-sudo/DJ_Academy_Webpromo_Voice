import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { authCookieNames } from "../../../../lib/auth-cookies";
import { safeJson } from "../../../../lib/http";
import { resolveTenantRequest } from "../../../../lib/tenant-context";

export async function GET(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "security.sessions.read")) {
    return safeJson({ status: "not_found" }, 404);
  }
  const token = request.cookies.get(authCookieNames.tenantSession)?.value;
  if (!token) return safeJson({ status: "not_found" }, 404);
  const sessions = await resolved.services.session.list(token);
  if (!sessions) return safeJson({ status: "not_found" }, 404);
  return safeJson({ sessions });
}
