import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../lib/http";
import { resolveTenantRequest } from "../../../lib/tenant-context";

const jobSchema = z.object({
  jobType: z.enum(["export", "erasure"]), contactId: z.uuid().optional(),
  idempotencyKey: z.string().min(8).max(200),
}).strict();

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
    const body = jobSchema.parse(await readJson(request));
    return safeJson(await resolved.services.sharedDomain.requestPrivacyJob(resolved.context, {
      jobType: body.jobType,
      idempotencyKey: body.idempotencyKey,
      ...(body.contactId ? { contactId: body.contactId } : {}),
    }), 202);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400) : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
