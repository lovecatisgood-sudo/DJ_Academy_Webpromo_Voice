import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { ZodError } from "zod";
import { enforceRateLimit, hasTrustedOrigin, readJson, safeJson } from "../../../../lib/http";
import { resolveTenantRequest } from "../../../../lib/tenant-context";

export async function POST(request: NextRequest) {
  if (!(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "team.invite")) {
    return safeJson({ status: "not_found" }, 404);
  }
  const limit = await enforceRateLimit(
    "tenant-invitation",
    `${resolved.context.tenantId}:${resolved.context.userId}`,
    30,
    60 * 60 * 1000,
  );
  if (!limit.allowed) return safeJson({ code: "rate_limited" }, 429);
  try {
    const result = await resolved.services.invitations.invite(resolved.context, {
      ...(await readJson(request) as object),
      requestId: resolved.context.requestId,
    });
    if (result.status === "not_found") return safeJson({ status: "not_found" }, 404);
    if (result.status === "seat_limit_reached") return safeJson({ status: result.status }, 409);
    return safeJson({ status: result.status }, result.status === "created" ? 201 : 202);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ code: "validation_failed" }, 400)
      : safeJson({ code: "temporarily_unavailable" }, 503);
  }
}
