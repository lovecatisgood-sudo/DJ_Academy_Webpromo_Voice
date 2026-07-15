import type { NextRequest } from "next/server";
import { hasTrustedOrigin, safeJson } from "../../../../../lib/http";
import { resolveTenantRequest } from "../../../../../lib/tenant-context";

export async function POST(request: NextRequest) {
  if (!(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  const resolved = await resolveTenantRequest(request);
  if (!resolved) return safeJson({ status: "not_found" }, 404);
  const enrollment = await resolved.services.tenantMfa.startEnrollment(
    resolved.session.userId,
    resolved.context.requestId,
    "account",
  );
  return safeJson({ status: "enrollment_started", enrollment });
}
