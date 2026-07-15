import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { ZodError } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../lib/http";
import { resolveTenantRequest } from "../../../lib/tenant-context";

export async function POST(request: NextRequest) {
  if (!(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "ownership.transfer")) {
    return safeJson({ status: "not_found" }, 404);
  }
  try {
    const result = await resolved.services.ownership.initiate(
      resolved.context,
      await readJson(request),
      resolved.session.reauthenticatedAt,
      resolved.session.mfaVerifiedAt,
    );
    if (result.status === "not_found") return safeJson(result, 404);
    if (result.status === "reauthentication_required") return safeJson(result, 403);
    return safeJson(result, result.status === "created" ? 201 : 409);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ code: "validation_failed" }, 400)
      : safeJson({ code: "temporarily_unavailable" }, 503);
  }
}
