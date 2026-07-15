import { tenantRoleAllows } from "@djay/authorization";
import { uuidSchema } from "@djay/shared";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../../lib/http";
import { resolveTenantRequest } from "../../../../lib/tenant-context";

const requestSchema = z.object({
  deploymentId: uuidSchema,
  targetOrigin: z.url().refine((value) => new URL(value).origin === value),
}).strict();

export async function GET(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "flowbot.read")) return safeJson({ status: "not_found" }, 404);
  const parsedDeployment = uuidSchema.safeParse(request.nextUrl.searchParams.get("deploymentId"));
  return safeJson({ checks: await resolved.services.flowbot.listInstallChecks(
    resolved.context,
    parsedDeployment.success ? parsedDeployment.data : undefined,
  ) });
}

export async function POST(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "flowbot.deploy") || !(await hasTrustedOrigin(request))) {
    return safeJson({ status: "not_found" }, 404);
  }
  try {
    const body = requestSchema.parse(await readJson(request));
    const result = await resolved.services.flowbot.requestInstallCheck(resolved.context, body.deploymentId, body.targetOrigin);
    return safeJson(result, result.status === "requested" ? 201 : result.status === "not_entitled" ? 403 : 404);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400)
      : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
