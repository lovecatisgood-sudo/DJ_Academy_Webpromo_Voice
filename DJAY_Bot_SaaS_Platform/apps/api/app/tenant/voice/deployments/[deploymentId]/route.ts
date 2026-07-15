import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../../../lib/http";
import { resolveTenantRequest } from "../../../../../lib/tenant-context";

const schema = z.object({ action: z.enum(["enable", "disable", "revoke"]) }).strict();

export async function PATCH(request: NextRequest, route: { params: Promise<{ deploymentId: string }> }) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "voice.deploy") || !(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  try {
    const { deploymentId } = await route.params;
    if (!z.uuid().safeParse(deploymentId).success) return safeJson({ status: "not_found" }, 404);
    const body = schema.parse(await readJson(request));
    const result = await resolved.services.voiceDeployments.changeStatus(resolved.context, deploymentId, body.action);
    return safeJson(result, result.status === "updated" || result.status === "unchanged" ? 200
      : result.status === "not_entitled" ? 403 : result.status === "not_found" ? 404 : 409);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400) : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
