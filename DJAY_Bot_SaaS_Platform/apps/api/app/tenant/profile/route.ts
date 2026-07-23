import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../lib/http";
import { resolveTenantRequest } from "../../../lib/tenant-context";

const updateSchema = z.object({
  businessName: z.string().trim().min(2).max(200),
  locale: z.enum(["en", "th"]),
  timezone: z.string().trim().min(2).max(64),
}).strict();

export async function GET(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "tenant.read")) {
    return safeJson({ status: "not_found" }, 404);
  }
  const onboarding = await resolved.services.tenantWorkspace.getOnboarding(resolved.context);
  if (!onboarding) return safeJson({ status: "not_found" }, 404);
  return safeJson({
    profile: {
      businessName: onboarding.business_name,
      locale: onboarding.locale,
      timezone: onboarding.timezone,
      slug: onboarding.slug,
    },
  });
}

export async function PATCH(request: NextRequest) {
  if (!(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "tenant.update")) {
    return safeJson({ status: "not_found" }, 404);
  }
  try {
    const input = updateSchema.parse(await readJson(request));
    const result = await resolved.services.tenantWorkspace.updateBusinessProfile(resolved.context, {
      businessName: input.businessName,
      locale: input.locale,
      timezone: input.timezone,
    });
    if (result.status === "updated") return safeJson(result);
    if (result.status === "not_found") return safeJson({ status: "not_found" }, 404);
    return safeJson({ status: result.status }, 400);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400)
      : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
