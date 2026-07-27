import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../lib/http";
import { resolveTenantRequest } from "../../../lib/tenant-context";
import { hasSensitiveTenantAssurance } from "../../../lib/tenant-assurance";

/*
 * Standard merchants may set message retention between 30 and 730 days (SKU1-DEC-004).
 *
 * The database constraint still permits up to 3650 days, deliberately: counsel's decision is that
 * retention beyond two years is available only through a separately reviewed enterprise
 * arrangement. That review is a platform-operator action, not a self-serve one, so the ceiling is
 * enforced here at the tenant-facing boundary rather than by narrowing the column — narrowing it
 * would make the enterprise case impossible to honour without another migration.
 *
 * The Privacy Notice states 365 days as the default and 730 as the standard maximum. Raising this
 * number silently would make that statement false, so it must move only with the decision record.
 */
const standardMaximumTranscriptDays = 730;

const retentionPolicySchema = z.object({
  transcriptDays: z.number().int().min(30).max(standardMaximumTranscriptDays),
}).strict();

export async function GET(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "privacy.manage")) {
    return safeJson({ status: "not_found" }, 404);
  }
  const policy = await resolved.services.sharedDomain.getRetentionPolicy(resolved.context);
  return policy ? safeJson({ policy }) : safeJson({ status: "not_found" }, 404);
}

export async function PUT(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "privacy.manage")
      || !(await hasTrustedOrigin(request))) {
    return safeJson({ status: "not_found" }, 404);
  }
  if (!hasSensitiveTenantAssurance(resolved.session)) return safeJson({ status: "reauthentication_required" }, 403);
  try {
    const body = retentionPolicySchema.parse(await readJson(request));
    const result = await resolved.services.sharedDomain.updateRetentionPolicy(
      resolved.context, body.transcriptDays,
    );
    return safeJson(result, result.status === "updated" ? 200 : 409);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400)
      : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
