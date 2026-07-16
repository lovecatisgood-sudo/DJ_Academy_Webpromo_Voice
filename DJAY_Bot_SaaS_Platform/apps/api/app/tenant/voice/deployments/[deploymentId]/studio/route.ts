import { tenantRoleAllows } from "@djay/authorization";
import { aiPlaybookSchema } from "@djay/sales-core";
import { isExactWebsiteOrigin, voiceDeploymentFieldLimits } from "@djay/shared";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../../../../lib/http";
import { resolveTenantRequest } from "../../../../../../lib/tenant-context";

const updateSchema = z.object({
  revision: z.number().int().positive(),
  name: z.string().trim().min(voiceDeploymentFieldLimits.name.minLength).max(voiceDeploymentFieldLimits.name.maxLength),
  agentName: z.string().trim().min(voiceDeploymentFieldLimits.agentName.minLength).max(voiceDeploymentFieldLimits.agentName.maxLength),
  businessName: z.string().trim().min(voiceDeploymentFieldLimits.businessName.minLength).max(voiceDeploymentFieldLimits.businessName.maxLength),
  defaultLocale: z.enum(["th", "en"]),
  allowedOrigins: z.array(
    z.string().trim().max(voiceDeploymentFieldLimits.origin.maxLength).refine(isExactWebsiteOrigin),
  ).min(1).max(voiceDeploymentFieldLimits.origin.maximumCount),
  greetingTh: z.string().trim().min(voiceDeploymentFieldLimits.greeting.minLength).max(voiceDeploymentFieldLimits.greeting.maxLength),
  greetingEn: z.string().trim().min(voiceDeploymentFieldLimits.greeting.minLength).max(voiceDeploymentFieldLimits.greeting.maxLength),
  automatedDisclosureTh: z.string().trim().min(voiceDeploymentFieldLimits.disclosure.minLength).max(voiceDeploymentFieldLimits.disclosure.maxLength),
  automatedDisclosureEn: z.string().trim().min(voiceDeploymentFieldLimits.disclosure.minLength).max(voiceDeploymentFieldLimits.disclosure.maxLength),
  maxCallSeconds: z.number().int().min(voiceDeploymentFieldLimits.maxCallSeconds.min).max(voiceDeploymentFieldLimits.maxCallSeconds.max),
  reconnectWindowSeconds: z.number().int().min(voiceDeploymentFieldLimits.reconnectWindowSeconds.min).max(voiceDeploymentFieldLimits.reconnectWindowSeconds.max),
  definition: aiPlaybookSchema,
  knowledgeRevisionIds: z.array(z.uuid()).max(1000),
}).strict();

async function deploymentId(route: { params: Promise<{ deploymentId: string }> }) {
  return z.uuid().safeParse((await route.params).deploymentId);
}

export async function GET(request: NextRequest, route: { params: Promise<{ deploymentId: string }> }) {
  const resolved = await resolveTenantRequest(request);
  const id = await deploymentId(route);
  if (!resolved || !id.success || !tenantRoleAllows(resolved.context.role, "voice.read")) {
    return safeJson({ status: "not_found" }, 404);
  }
  const studio = await resolved.services.voiceDeployments.getStudio(resolved.context, id.data);
  return studio ? safeJson({ studio }) : safeJson({ status: "not_found" }, 404);
}

export async function PATCH(request: NextRequest, route: { params: Promise<{ deploymentId: string }> }) {
  const resolved = await resolveTenantRequest(request);
  const id = await deploymentId(route);
  if (!resolved || !id.success || !tenantRoleAllows(resolved.context.role, "voice.deploy")
    || !(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  try {
    const result = await resolved.services.voiceDeployments.updateStudio(
      resolved.context, id.data, updateSchema.parse(await readJson(request, 192_000)),
    );
    return safeJson(result,
      result.status === "updated" ? 200
        : result.status === "conflict" ? 409
          : result.status === "not_found" ? 404
            : result.status === "not_entitled" ? 403
              : result.status === "not_allowed" ? 409 : 422,
    );
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400)
      : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}

export async function POST(request: NextRequest, route: { params: Promise<{ deploymentId: string }> }) {
  const resolved = await resolveTenantRequest(request);
  const id = await deploymentId(route);
  if (!resolved || !id.success || !tenantRoleAllows(resolved.context.role, "voice.deploy")
    || !(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  try {
    const result = await resolved.services.voiceDeployments.publishStudio(resolved.context, id.data);
    return safeJson(result,
      result.status === "published" ? 200
        : result.status === "not_found" ? 404
          : result.status === "not_entitled" ? 403
            : result.status === "not_allowed" ? 409 : 422,
    );
  } catch (error) {
    return error instanceof ZodError
      ? safeJson({ status: "validation_failed" }, 422)
      : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
