import { randomUUID } from "node:crypto";
import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../../lib/http";
import { hasSensitiveTenantAssurance } from "../../../../lib/tenant-assurance";
import { resolveTenantRequest } from "../../../../lib/tenant-context";

const schema = z.object({
  subscriptionId: z.uuid(),
  action: z.enum(["schedule", "revoke"]),
}).strict();
const idempotencySchema = z.string().trim().min(16).max(200);

export async function POST(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "billing.cancel")
    || !(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  if (!hasSensitiveTenantAssurance(resolved.session)) {
    return safeJson({ status: "reauthentication_required" }, 403);
  }
  if (!resolved.services.stripePaymentProvider) {
    return safeJson({ status: "cancellation_unavailable" }, 503);
  }
  try {
    const input = schema.parse(await readJson(request));
    const idempotencyKey = idempotencySchema.parse(request.headers.get("idempotency-key"));
    const prepared = await resolved.services.tenantCommerce.prepareSubscriptionCancellation(
      resolved.context,
      { requestId: randomUUID(), subscriptionId: input.subscriptionId, action: input.action, idempotencyKey },
    );
    if (prepared.status !== "prepared") return safeJson(prepared, 409);
    try {
      const providerResult = await resolved.services.stripePaymentProvider.setSubscriptionCancellation(
        prepared.externalSubscriptionRef, input.action === "schedule", idempotencyKey,
      );
      const completed = await resolved.services.tenantCommerce.completeSubscriptionCancellation(
        resolved.context,
        { cancellationRequestId: prepared.cancellationRequestId, idempotencyKey,
          cancelAtPeriodEnd: providerResult.cancelAtPeriodEnd,
          effectiveAt: providerResult.effectiveAt, failureCode: null },
      );
      return safeJson({ ...completed, effectiveAt: providerResult.effectiveAt });
    } catch (error) {
      await resolved.services.tenantCommerce.completeSubscriptionCancellation(resolved.context, {
        cancellationRequestId: prepared.cancellationRequestId, idempotencyKey,
        cancelAtPeriodEnd: false, effectiveAt: null, failureCode: "payment_provider_unavailable",
      });
      throw error;
    }
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return safeJson({ status: "validation_failed" }, 400);
    }
    if (error instanceof Error && error.message.includes("cancellation_authority_unavailable")) {
      return safeJson({ status: "cancellation_unavailable" }, 409);
    }
    console.error("subscription_cancellation_failed", {
      requestId: resolved.context.requestId,
      error: error instanceof Error ? error.name : "unknown",
    });
    return safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
