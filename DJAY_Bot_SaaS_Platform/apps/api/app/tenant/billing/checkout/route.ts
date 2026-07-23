import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { emitCommerceMetric } from "../../../../lib/commerce-metrics";
import { safeJson } from "../../../../lib/http";
import { withTenantMutation } from "../../../../lib/tenant-mutation";

const schema = z.object({ subscriptionId: z.uuid(), contractSnapshotId: z.uuid() }).strict();
const idempotencySchema = z.string().trim().min(16).max(200);

export async function POST(request: NextRequest) {
  return withTenantMutation(
    request,
    {
      permission: "billing.checkout",
      assurance: "recent_auth",
      rateLimit: { scope: "tenant-billing-checkout", limit: 10, windowMs: 15 * 60 * 1000 },
      bodySchema: schema,
    },
    async (resolved) => {
      if (!resolved.services.stripePaymentProvider || !resolved.services.billingCheckoutEnvelopeKey) {
        emitCommerceMetric("checkout_result", { outcome: "unavailable", httpStatus: 503 });
        return safeJson({ status: "checkout_unavailable" }, 503);
      }
      try {
        emitCommerceMetric("checkout_attempt", { providerMode: resolved.services.stripeLiveMode ? "live" : "test" });
        const idempotencyKey = idempotencySchema.parse(request.headers.get("idempotency-key"));
        const prepared = await resolved.services.tenantCommerce.prepareStripeCheckout(resolved.context, {
          checkoutIntentId: randomUUID(),
          subscriptionId: resolved.body.subscriptionId,
          contractSnapshotId: resolved.body.contractSnapshotId,
          idempotencyKey,
          providerMode: resolved.services.stripeLiveMode ? "live" : "test",
          now: new Date(),
        });
        if (prepared.status !== "prepared") {
          emitCommerceMetric("checkout_result", { outcome: prepared.status, httpStatus: 409 });
          return safeJson(prepared, 409);
        }
        await resolved.services.purchaseIntents.consumeOpenPurchaseIntentForPlan({
          context: resolved.context,
          planKey: prepared.planKey,
          checkoutIntentId: prepared.checkoutIntentId,
        });
        try {
          const checkout = await resolved.services.stripePaymentProvider.createCheckout({
            tenantId: prepared.tenantId,
            publicPlanKey: prepared.planKey,
            checkoutIntentId: prepared.checkoutIntentId,
            contractSha256: prepared.contractSha256,
            externalPriceRef: prepared.externalPriceRef,
            returnUrl: new URL("/workspace/usage?checkout=return", resolved.services.env.TENANT_APP_URL).toString(),
            idempotencyKey,
          });
          await resolved.services.tenantCommerce.completeStripeCheckout(resolved.context, {
            checkoutIntentId: prepared.checkoutIntentId,
            idempotencyKey,
            externalSessionRef: checkout.externalSessionRef,
            externalCustomerRef: checkout.externalCustomerRef,
            externalSubscriptionRef: checkout.externalSubscriptionRef,
            checkoutUrl: checkout.checkoutUrl,
            expiresAt: checkout.expiresAt,
            failureCode: null,
            envelopeKey: resolved.services.billingCheckoutEnvelopeKey,
          });
          emitCommerceMetric("checkout_result", { outcome: "ready", httpStatus: 200 });
          return safeJson({
            status: "ready",
            checkoutUrl: checkout.checkoutUrl,
            expiresAt: checkout.expiresAt,
            checkoutIntentId: prepared.checkoutIntentId,
          });
        } catch (error) {
          await resolved.services.tenantCommerce.completeStripeCheckout(resolved.context, {
            checkoutIntentId: prepared.checkoutIntentId,
            idempotencyKey,
            externalSessionRef: null,
            externalCustomerRef: null,
            externalSubscriptionRef: null,
            checkoutUrl: null,
            expiresAt: null,
            failureCode: "payment_provider_unavailable",
            envelopeKey: resolved.services.billingCheckoutEnvelopeKey,
          });
          throw error;
        }
      } catch (error) {
        if (error instanceof ZodError || error instanceof SyntaxError) {
          emitCommerceMetric("checkout_result", { outcome: "validation_failed", httpStatus: 400 });
          return safeJson({ status: "validation_failed" }, 400);
        }
        const code = error instanceof Error ? error.message : "unknown";
        if (code.includes("checkout_authority_unavailable")) {
          emitCommerceMetric("checkout_result", { outcome: "checkout_unavailable", httpStatus: 409 });
          return safeJson({ status: "checkout_unavailable" }, 409);
        }
        console.error("stripe_checkout_failed", {
          requestId: resolved.context.requestId,
          error: error instanceof Error ? error.name : "unknown",
        });
        emitCommerceMetric("checkout_result", { outcome: "temporarily_unavailable", httpStatus: 503 });
        emitCommerceMetric("api_error", { route: "tenant.billing.checkout", httpStatus: 503 });
        return safeJson({ status: "temporarily_unavailable" }, 503);
      }
    },
  );
}
