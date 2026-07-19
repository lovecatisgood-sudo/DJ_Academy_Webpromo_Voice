import { tenantRoleAllows } from "@djay/authorization";
import { isExactWebsiteOrigin, voiceDeploymentFieldLimits } from "@djay/shared";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../../lib/http";
import { resolveTenantRequest } from "../../../../lib/tenant-context";

const schema = z.object({
  name: z.string().trim().min(voiceDeploymentFieldLimits.name.minLength).max(voiceDeploymentFieldLimits.name.maxLength),
  agentName: z.string().trim().min(voiceDeploymentFieldLimits.agentName.minLength).max(voiceDeploymentFieldLimits.agentName.maxLength),
  businessName: z.string().trim().min(voiceDeploymentFieldLimits.businessName.minLength).max(voiceDeploymentFieldLimits.businessName.maxLength),
  allowedOrigins: z.array(
    z.string().trim().max(voiceDeploymentFieldLimits.origin.maxLength).refine(isExactWebsiteOrigin),
  ).min(1).max(voiceDeploymentFieldLimits.origin.maximumCount),
  defaultLocale: z.enum(["th", "en"]),
  greetingTh: z.string().trim().min(voiceDeploymentFieldLimits.greeting.minLength).max(voiceDeploymentFieldLimits.greeting.maxLength),
  greetingEn: z.string().trim().min(voiceDeploymentFieldLimits.greeting.minLength).max(voiceDeploymentFieldLimits.greeting.maxLength),
  automatedDisclosureTh: z.string().trim().min(voiceDeploymentFieldLimits.disclosure.minLength).max(voiceDeploymentFieldLimits.disclosure.maxLength),
  automatedDisclosureEn: z.string().trim().min(voiceDeploymentFieldLimits.disclosure.minLength).max(voiceDeploymentFieldLimits.disclosure.maxLength),
  maxCallSeconds: z.number().int().min(voiceDeploymentFieldLimits.maxCallSeconds.min).max(voiceDeploymentFieldLimits.maxCallSeconds.max),
  reconnectWindowSeconds: z.number().int().min(voiceDeploymentFieldLimits.reconnectWindowSeconds.min).max(voiceDeploymentFieldLimits.reconnectWindowSeconds.max),
}).strict();

export async function GET(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "voice.read")) return safeJson({ status: "not_found" }, 404);
  return safeJson(await resolved.services.voiceDeployments.list(resolved.context));
}

export async function POST(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "voice.deploy") || !(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  try {
    const result = await resolved.services.voiceDeployments.create(resolved.context, schema.parse(await readJson(request)));
    return safeJson(result, result.status === "created" ? 201
      : result.status === "limit_reached" ? 409 : result.status === "not_entitled" ? 403 : 400);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400) : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
