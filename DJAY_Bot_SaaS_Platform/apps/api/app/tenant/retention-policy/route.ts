import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../lib/http";
import { resolveTenantRequest } from "../../../lib/tenant-context";

const retentionPolicySchema = z.object({
  transcriptDays: z.number().int().min(30).max(3650),
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
