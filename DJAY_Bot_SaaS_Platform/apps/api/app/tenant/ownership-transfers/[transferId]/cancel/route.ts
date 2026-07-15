import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { hasTrustedOrigin, safeJson } from "../../../../../lib/http";
import { resolveTenantRequest } from "../../../../../lib/tenant-context";

const paramsSchema = z.object({ transferId: z.uuid() }).strict();

export async function POST(
  request: NextRequest,
  route: { params: Promise<{ transferId: string }> },
) {
  if (!(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "ownership.transfer")) {
    return safeJson({ status: "not_found" }, 404);
  }
  try {
    const params = paramsSchema.parse(await route.params);
    const result = await resolved.services.ownership.cancel(
      resolved.context,
      params.transferId,
      resolved.session.reauthenticatedAt,
      resolved.session.mfaVerifiedAt,
    );
    if (result.status !== "cancelled") {
      return safeJson({ status: result.status }, result.status === "reauthentication_required" ? 403 : 404);
    }
    return safeJson(result);
  } catch (error) {
    return error instanceof ZodError
      ? safeJson({ status: "not_found" }, 404)
      : safeJson({ code: "temporarily_unavailable" }, 503);
  }
}
