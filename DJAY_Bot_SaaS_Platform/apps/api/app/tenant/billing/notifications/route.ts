import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../../lib/http";
import { hasSensitiveTenantAssurance } from "../../../../lib/tenant-assurance";
import { resolveTenantRequest } from "../../../../lib/tenant-context";

const billingNotificationEventKeys = [
  "subscription.active", "subscription.past_due", "subscription.grace_period",
  "subscription.restricted", "subscription.cancelled", "cancellation.scheduled",
  "cancellation.revoked", "cancellation.failed", "payment.succeeded", "payment.failed",
  "refund.updated", "credit_note.issued",
] as const;

const configureSchema = z.object({
  action: z.literal("configure"),
  emailEnabled: z.boolean(),
  recipientEmail: z.email().max(320).nullable(),
  locale: z.enum(["en", "th"]),
  eventKeys: z.array(z.enum(billingNotificationEventKeys)).max(billingNotificationEventKeys.length),
}).strict();
const readSchema = z.object({ action: z.literal("mark_read"), notificationId: z.uuid() }).strict();
const schema = z.discriminatedUnion("action", [configureSchema, readSchema]);

export async function GET(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "billing.portal")) {
    return safeJson({ status: "not_found" }, 404);
  }
  return safeJson({ billingNotifications:
    await resolved.services.tenantBillingNotifications.overview(resolved.context) });
}

export async function POST(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  try {
    const input = schema.parse(await readJson(request));
    if (input.action === "mark_read") {
      if (!tenantRoleAllows(resolved.context.role, "billing.portal")) return safeJson({ status: "not_found" }, 404);
      const result = await resolved.services.tenantBillingNotifications.markRead(
        resolved.context, input.notificationId,
      );
      return safeJson(result, result.status === "read" ? 200 : 404);
    }
    if (!tenantRoleAllows(resolved.context.role, "billing.tax.manage")) return safeJson({ status: "not_found" }, 404);
    if (!hasSensitiveTenantAssurance(resolved.session)) return safeJson({ status: "reauthentication_required" }, 403);
    const key = resolved.services.billingNotificationEnvelopeKey;
    if (!key) return safeJson({ status: "temporarily_unavailable" }, 503);
    return safeJson(await resolved.services.tenantBillingNotifications.configure(
      resolved.context, { ...input, envelopeKey: key },
    ));
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400)
      : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
