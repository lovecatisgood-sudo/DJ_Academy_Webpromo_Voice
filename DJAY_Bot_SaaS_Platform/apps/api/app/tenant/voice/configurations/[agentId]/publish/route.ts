import { tenantRoleAllows } from "@djay/authorization";
import { uuidSchema } from "@djay/shared";
import type { NextRequest } from "next/server";
import { ZodError } from "zod";
import { hasTrustedOrigin, safeJson } from "../../../../../../lib/http";
import { resolveTenantRequest } from "../../../../../../lib/tenant-context";

export async function POST(request: NextRequest, route: { params: Promise<{ agentId: string }> }) {
  const resolved = await resolveTenantRequest(request);
  const id = uuidSchema.safeParse((await route.params).agentId);
  if (!resolved || !id.success || !tenantRoleAllows(resolved.context.role, "voice.deploy")
    || !(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  try {
    const result = await resolved.services.voiceDeployments.publishConfiguration(resolved.context, id.data);
    return safeJson(result, result.status === "published" ? 200
      : result.status === "not_found" ? 404
        : result.status === "not_entitled" ? 403 : 422);
  } catch (error) {
    return error instanceof ZodError
      ? safeJson({ status: "validation_failed" }, 422)
      : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
