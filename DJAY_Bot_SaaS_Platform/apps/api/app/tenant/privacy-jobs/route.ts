import { tenantRoleAllows } from "@djay/authorization";
import { privacyJobRequestSchema } from "@djay/shared";
import type { NextRequest } from "next/server";
import { ZodError } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../lib/http";
import { resolveTenantRequest } from "../../../lib/tenant-context";

export async function GET(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "privacy.manage")) return safeJson({ status: "not_found" }, 404);
  return safeJson({ jobs: await resolved.services.sharedDomain.listPrivacyJobs(resolved.context) });
}

export async function POST(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "privacy.manage") || !(await hasTrustedOrigin(request))) {
    return safeJson({ status: "not_found" }, 404);
  }
  try {
    const result = await resolved.services.sharedDomain.requestPrivacyJob(
      resolved.context,
      privacyJobRequestSchema.parse(await readJson(request)),
    );
    return safeJson(result, result.status === "accepted" ? 202 : result.status === "conflict" ? 409 : 404);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400) : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
