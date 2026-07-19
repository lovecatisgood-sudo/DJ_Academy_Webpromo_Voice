import { randomUUID } from "node:crypto";
import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../../lib/http";
import { hasSensitiveTenantAssurance } from "../../../../lib/tenant-assurance";
import { resolveTenantRequest } from "../../../../lib/tenant-context";

const schema = z.object({ returnTo: z.enum(["usage", "workspace"]).default("usage") }).strict();
const idempotencySchema = z.string().trim().min(16).max(200);

export async function POST(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "billing.portal")
    || !(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  if (!hasSensitiveTenantAssurance(resolved.session)) return safeJson({ status: "reauthentication_required" }, 403);
  if (!resolved.services.stripePaymentProvider || !resolved.services.billingCheckoutEnvelopeKey) {
    return safeJson({ status: "portal_unavailable" }, 503);
  }
  try {
    const input = schema.parse(await readJson(request));
    const idempotencyKey = idempotencySchema.parse(request.headers.get("idempotency-key"));
    const prepared = await resolved.services.tenantCommerce.prepareStripePortal(resolved.context, {
      portalIntentId: randomUUID(), idempotencyKey,
    });
    if (prepared.status !== "prepared") return safeJson(prepared, 409);
    try {
      const returnUrl = new URL(input.returnTo === "usage" ? "/workspace/usage" : "/workspace",
        resolved.services.env.TENANT_APP_URL).toString();
      const portal = await resolved.services.stripePaymentProvider.createPortal(
        prepared.externalCustomerRef, returnUrl, idempotencyKey,
      );
      await resolved.services.tenantCommerce.completeStripePortal(resolved.context, {
        portalIntentId: prepared.portalIntentId, idempotencyKey, portalUrl: portal.portalUrl,
        expiresAt: portal.expiresAt, failureCode: null,
        envelopeKey: resolved.services.billingCheckoutEnvelopeKey,
      });
      return safeJson({ status: "ready", portalUrl: portal.portalUrl, expiresAt: portal.expiresAt });
    } catch (error) {
      await resolved.services.tenantCommerce.completeStripePortal(resolved.context, {
        portalIntentId: prepared.portalIntentId, idempotencyKey, portalUrl: null,
        expiresAt: null, failureCode: "payment_provider_unavailable",
        envelopeKey: resolved.services.billingCheckoutEnvelopeKey,
      });
      throw error;
    }
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return safeJson({ status: "validation_failed" }, 400);
    if (error instanceof Error && error.message.includes("stripe_customer_unavailable")) {
      return safeJson({ status: "portal_unavailable" }, 409);
    }
    return safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
