import { tenantRoleAllows } from "@djay/authorization";
import { isExactWebsiteOrigin, uuidSchema, websiteDeploymentFieldLimits } from "@djay/shared";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { safeJson } from "../../../../../../lib/http";
import { resolveTenantRequest } from "../../../../../../lib/tenant-context";
import { withTenantMutation } from "../../../../../../lib/tenant-mutation";

const deploymentSchema = z.object({
  name: z.string().trim().min(websiteDeploymentFieldLimits.name.minLength).max(websiteDeploymentFieldLimits.name.maxLength),
  allowedOrigins: z.array(
    z.string().trim().max(websiteDeploymentFieldLimits.origin.maxLength).refine(isExactWebsiteOrigin),
  ).min(1).max(websiteDeploymentFieldLimits.origin.maximumCount),
}).strict();

export async function GET(request: NextRequest, route: { params: Promise<{ botId: string }> }) {
  const resolved = await resolveTenantRequest(request);
  const botId = uuidSchema.safeParse((await route.params).botId);
  if (!resolved || !botId.success || !tenantRoleAllows(resolved.context.role, "flowbot.read")) {
    return safeJson({ status: "not_found" }, 404);
  }
  return safeJson({ deployments: await resolved.services.flowbot.listDeployments(resolved.context, botId.data) });
}

export async function POST(request: NextRequest, route: { params: Promise<{ botId: string }> }) {
  const botId = uuidSchema.safeParse((await route.params).botId);
  if (!botId.success) return safeJson({ status: "not_found" }, 404);
  return withTenantMutation(
    request,
    {
      permission: "flowbot.deploy",
      assurance: "none",
      rateLimit: { scope: "tenant-flowbot-deploy", limit: 20, windowMs: 15 * 60 * 1000 },
      bodySchema: deploymentSchema,
    },
    async (resolved) => {
      try {
        const result = await resolved.services.flowbot.createDeployment(
          resolved.context,
          botId.data,
          resolved.body,
        );
        return safeJson(
          result,
          result.status === "created" ? 201
            : result.status === "limit_reached" ? 409
              : result.status === "validation_failed" ? 422
                : 403,
        );
      } catch {
        return safeJson({ status: "temporarily_unavailable" }, 503);
      }
    },
  );
}
