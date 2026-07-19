import { randomUUID } from "node:crypto";
import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../../lib/http";
import { hasSensitiveTenantAssurance } from "../../../../lib/tenant-assurance";
import { resolveTenantRequest } from "../../../../lib/tenant-context";

const schema = z.object({ subscriptionId: z.uuid(), contractSnapshotId: z.uuid() }).strict();
const idempotencySchema = z.string().trim().min(16).max(200);

export async function POST(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "billing.checkout")) {
    return safeJson({ status: "not_found" }, 404);
  }
  if (!(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  if (!hasSensitiveTenantAssurance(resolved.session)) {
    return safeJson({ status: "reauthentication_required" }, 403);
  }
  if (!resolved.services.stripePaymentProvider || !resolved.services.billingCheckoutEnvelopeKey) {
    return safeJson({ status: "checkout_unavailable" }, 503);
  }
  try {
    const input = schema.parse(await readJson(request));
    const idempotencyKey = idempotencySchema.parse(request.headers.get("idempotency-key"));
    const prepared = await resolved.services.tenantCommerce.prepareStripeCheckout(resolved.context, {
      checkoutIntentId: randomUUID(), subscriptionId: input.subscriptionId,
      contractSnapshotId: input.contractSnapshotId, idempotencyKey,
      providerMode: resolved.services.stripeLiveMode ? "live" : "test", now: new Date(),
    });
    if (prepared.status !== "prepared") return safeJson(prepared, 409);
    try {
      const checkout = await resolved.services.stripePaymentProvider.createCheckout({
        tenantId: prepared.tenantId, publicPlanKey: prepared.planKey,
        checkoutIntentId: prepared.checkoutIntentId, contractSha256: prepared.contractSha256,
        externalPriceRef: prepared.externalPriceRef,
        returnUrl: new URL("/workspace/usage?checkout=return", resolved.services.env.TENANT_APP_URL).toString(),
        idempotencyKey,
      });
      await resolved.services.tenantCommerce.completeStripeCheckout(resolved.context, {
        checkoutIntentId: prepared.checkoutIntentId, idempotencyKey,
        externalSessionRef: checkout.externalSessionRef,
        externalCustomerRef: checkout.externalCustomerRef,
        externalSubscriptionRef: checkout.externalSubscriptionRef,
        checkoutUrl: checkout.checkoutUrl, expiresAt: checkout.expiresAt,
        failureCode: null, envelopeKey: resolved.services.billingCheckoutEnvelopeKey,
      });
      return safeJson({ status: "ready", checkoutUrl: checkout.checkoutUrl,
        expiresAt: checkout.expiresAt, checkoutIntentId: prepared.checkoutIntentId });
    } catch (error) {
      await resolved.services.tenantCommerce.completeStripeCheckout(resolved.context, {
        checkoutIntentId: prepared.checkoutIntentId, idempotencyKey,
        externalSessionRef: null, externalCustomerRef: null, externalSubscriptionRef: null,
        checkoutUrl: null, expiresAt: null, failureCode: "payment_provider_unavailable",
        envelopeKey: resolved.services.billingCheckoutEnvelopeKey,
      });
      throw error;
    }
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return safeJson({ status: "validation_failed" }, 400);
    }
    const code = error instanceof Error ? error.message : "unknown";
    if (code.includes("checkout_authority_unavailable")) {
      return safeJson({ status: "checkout_unavailable" }, 409);
    }
    console.error("stripe_checkout_failed", {
      requestId: resolved.context.requestId, error: error instanceof Error ? error.name : "unknown",
    });
    return safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
