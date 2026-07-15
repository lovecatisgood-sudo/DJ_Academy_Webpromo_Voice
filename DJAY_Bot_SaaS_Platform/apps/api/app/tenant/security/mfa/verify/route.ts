import type { NextRequest } from "next/server";
import { ZodError } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../../../lib/http";
import { resolveTenantRequest } from "../../../../../lib/tenant-context";

export async function POST(request: NextRequest) {
  if (!(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  const resolved = await resolveTenantRequest(request);
  if (!resolved) return safeJson({ status: "not_found" }, 404);
  try {
    const raw = await readJson(request);
    const result = await resolved.services.tenantMfa.verifyEnrollment(
      resolved.session.userId,
      resolved.session.sessionId,
      { ...(typeof raw === "object" && raw !== null ? raw : {}), requestId: resolved.context.requestId },
    );
    return result.status === "verified" ? safeJson(result) : safeJson(result, 401);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ code: "validation_failed" }, 400)
      : safeJson({ code: "temporarily_unavailable" }, 503);
  }
}
