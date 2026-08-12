import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../lib/http";
import { resolveTenantRequest } from "../../../lib/tenant-context";

const updateSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("refresh") }).strict(),
  z.object({
    action: z.literal("save_preferences"),
    businessGoal: z.enum(["answer_questions","capture_leads","recommend_products","book_appointments","customer_support"]),
    industry: z.enum(["retail","services","restaurant","education","property","health","other"]),
    firstProduct: z.enum(["flowbot","ai_chat","voice"]),
  }).strict(),
]);

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
    const body = updateSchema.parse(await readJson(request));
    if (body.action === "save_preferences") {
      const result = await resolved.services.tenantWorkspace.updateOnboardingPreferences(resolved.context, body);
      return safeJson(result, result.status === "updated" ? 200 : 404);
    }
    const onboarding = await resolved.services.tenantWorkspace.refreshOnboarding(resolved.context);
    return onboarding ? safeJson({ onboarding }) : safeJson({ status: "not_found" }, 404);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ code: "validation_failed" }, 400)
      : safeJson({ code: "temporarily_unavailable" }, 503);
  }
}
