import { tenantRoleAllows } from "@djay/authorization";
import { uuidSchema } from "@djay/shared";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { safeJson } from "../../../../lib/http";
import { resolveTenantRequest } from "../../../../lib/tenant-context";
import { withTenantMutation } from "../../../../lib/tenant-mutation";

const requestSchema = z.object({
  deploymentId: uuidSchema,
  targetOrigin: z.url().refine((value) => new URL(value).origin === value),
}).strict();

export async function GET(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "ai_chat.read")) return safeJson({ status: "not_found" }, 404);
  const deployment = uuidSchema.safeParse(request.nextUrl.searchParams.get("deploymentId"));
  return safeJson({ checks: await resolved.services.aiChat.listInstallChecks(
    resolved.context,
    deployment.success ? deployment.data : undefined,
  ) });
}

export async function POST(request: NextRequest) {
  return withTenantMutation(
    request,
    {
      permission: "ai_chat.deploy",
      rateLimit: { scope: "tenant-ai-chat-install-check", limit: 20, windowMs: 15 * 60 * 1000 },
      bodySchema: requestSchema,
    },
    async (resolved) => {
      const result = await resolved.services.aiChat.requestInstallCheck(
        resolved.context,
        resolved.body.deploymentId,
        resolved.body.targetOrigin,
      );
      return safeJson(result, result.status === "requested" ? 201 : result.status === "not_entitled" ? 403 : 404);
    },
  );
}
