import { tenantRoleAllows } from "@djay/authorization";
import { isExactWebsiteOrigin, uuidSchema, websiteDeploymentFieldLimits } from "@djay/shared";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../../../../lib/http";
import { resolveTenantRequest } from "../../../../../../lib/tenant-context";

const deploymentSchema = z.object({
  name: z.string().trim().min(websiteDeploymentFieldLimits.name.minLength).max(websiteDeploymentFieldLimits.name.maxLength),
  allowedOrigins: z.array(
    z.string().trim().max(websiteDeploymentFieldLimits.origin.maxLength).refine(isExactWebsiteOrigin),
  ).min(1).max(websiteDeploymentFieldLimits.origin.maximumCount),
}).strict();

export async function GET(request: NextRequest, route: { params: Promise<{ agentId: string }> }) {
  const resolved = await resolveTenantRequest(request);
  const agentId = uuidSchema.safeParse((await route.params).agentId);
  if (!resolved || !agentId.success || !tenantRoleAllows(resolved.context.role, "ai_chat.read")) {
    return safeJson({ status: "not_found" }, 404);
  }
  return safeJson({ deployments: await resolved.services.aiChat.listDeployments(resolved.context, agentId.data) });
}

export async function POST(request: NextRequest, route: { params: Promise<{ agentId: string }> }) {
  const resolved = await resolveTenantRequest(request);
  const agentId = uuidSchema.safeParse((await route.params).agentId);
  if (!resolved || !agentId.success || !tenantRoleAllows(resolved.context.role, "ai_chat.deploy") || !(await hasTrustedOrigin(request))) {
    return safeJson({ status: "not_found" }, 404);
  }
  try {
    const result = await resolved.services.aiChat.createWebDeployment(
      resolved.context, agentId.data, deploymentSchema.parse(await readJson(request)),
    );
    return safeJson(result, result.status === "created" ? 201 : result.status === "limit_reached" ? 409 : result.status === "validation_failed" ? 422 : 403);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400)
      : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
