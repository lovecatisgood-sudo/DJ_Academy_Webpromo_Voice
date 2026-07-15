import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../lib/http";
import { resolveTenantRequest } from "../../../lib/tenant-context";

const updateSchema = z.object({
  stage: z.enum(["account_created", "business_profile", "product_selection", "ready"]),
}).strict();

export async function GET(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "onboarding.read")) {
    return safeJson({ status: "not_found" }, 404);
  }
  const onboarding = await resolved.services.tenantWorkspace.getOnboarding(resolved.context);
  return onboarding ? safeJson({ onboarding }) : safeJson({ status: "not_found" }, 404);
}

export async function PATCH(request: NextRequest) {
  if (!(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "onboarding.update")) {
    return safeJson({ status: "not_found" }, 404);
  }
  try {
    const input = updateSchema.parse(await readJson(request));
    const onboarding = await resolved.services.tenantWorkspace.updateOnboarding(
      resolved.context,
      input.stage,
    );
    return onboarding ? safeJson({ onboarding }) : safeJson({ status: "not_found" }, 404);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ code: "validation_failed" }, 400)
      : safeJson({ code: "temporarily_unavailable" }, 503);
  }
}
