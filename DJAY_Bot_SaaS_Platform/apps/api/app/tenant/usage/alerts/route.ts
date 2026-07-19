import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../../lib/http";
import { hasSensitiveTenantAssurance } from "../../../../lib/tenant-assurance";
import { resolveTenantRequest } from "../../../../lib/tenant-context";

const schema = z.object({
  subscriptionId: z.uuid(),
  thresholds: z.array(z.union([z.literal(50), z.literal(75), z.literal(90), z.literal(100)])).max(4),
  exhaustionAlert: z.boolean(),
  anomalyAlert: z.boolean(),
  cooldownHours: z.number().int().min(1).max(168),
  recipientEmail: z.email().max(320),
}).strict();

export async function POST(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "billing.overage.manage")
    || !(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  if (!hasSensitiveTenantAssurance(resolved.session)) {
    return safeJson({ status: "reauthentication_required" }, 403);
  }
  if (!resolved.services.usageAlertNotificationEnvelopeKey) {
    return safeJson({ status: "temporarily_unavailable" }, 503);
  }
  try {
    const input = schema.parse(await readJson(request));
    const result = await resolved.services.tenantCommerce.configureUsageAlerts(
      resolved.context,
      { ...input, envelopeKey: resolved.services.usageAlertNotificationEnvelopeKey },
    );
    return safeJson(result, result.status === "updated" ? 200
      : result.status === "not_found" ? 404 : 400);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400)
      : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
