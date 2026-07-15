import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { hasTrustedOrigin, requestId, safeJson } from "../../../../../lib/http";
import { resolveTenantRequest } from "../../../../../lib/tenant-context";

const paramsSchema = z.object({ sessionId: z.uuid() }).strict();

export async function DELETE(
  request: NextRequest,
  route: { params: Promise<{ sessionId: string }> },
) {
  if (!(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "security.sessions.revoke")) {
    return safeJson({ status: "not_found" }, 404);
  }
  try {
    const params = paramsSchema.parse(await route.params);
    const token = request.cookies.get("djay_tenant_session")?.value;
    if (!token) return safeJson({ status: "not_found" }, 404);
    const result = await resolved.services.session.revokeOwned(token, {
      sessionId: params.sessionId,
      requestId: requestId(),
    });
    if (result.status !== "revoked") return safeJson({ status: "not_found" }, 404);
    const response = safeJson({ status: "revoked", revokedCurrent: result.revokedCurrent });
    if (result.revokedCurrent) response.cookies.delete("djay_tenant_session");
    return response;
  } catch (error) {
    return error instanceof ZodError
      ? safeJson({ status: "not_found" }, 404)
      : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
