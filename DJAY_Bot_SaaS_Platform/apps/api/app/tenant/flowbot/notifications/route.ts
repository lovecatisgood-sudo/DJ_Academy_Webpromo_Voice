import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../../lib/http";
import { resolveTenantRequest } from "../../../../lib/tenant-context";

const requestSchema = z.object({
  name: z.string().trim().min(2).max(160),
  recipientEmail: z.email().max(320),
}).strict();

export async function GET(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "flowbot.read")) return safeJson({ status: "not_found" }, 404);
  return safeJson({ notifications: await resolved.services.tenantFlowbotNotifications.list(resolved.context) });
}

export async function POST(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "flowbot.deploy") || !(await hasTrustedOrigin(request))) {
    return safeJson({ status: "not_found" }, 404);
  }
  const key = resolved.services.flowbotNotificationEnvelopeKey;
  if (!key) return safeJson({ status: "not_available" }, 503);
  try {
    const result = await resolved.services.tenantFlowbotNotifications.create(
      resolved.context, { ...requestSchema.parse(await readJson(request)), envelopeKey: key },
    );
    return safeJson(result, result.status === "created" ? 201 : result.status === "not_entitled" ? 403 : 409);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400)
      : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
