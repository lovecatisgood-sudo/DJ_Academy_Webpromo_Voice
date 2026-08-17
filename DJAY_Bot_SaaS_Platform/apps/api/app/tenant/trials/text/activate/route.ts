import { createHmac, randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { safeJson } from "../../../../../lib/http";
import { withTenantMutation } from "../../../../../lib/tenant-mutation";

const bodySchema = z.object({ purchaseIntentId: z.uuid() }).strict();
const idempotencySchema = z.string().trim().min(16).max(200);

export async function POST(request: NextRequest) {
  return withTenantMutation(request, {
    permission: "billing.checkout", assurance: "recent_auth",
    rateLimit: { scope: "tenant-text-trial-activate", limit: 10, windowMs: 15 * 60 * 1000 }, bodySchema,
  }, async (resolved) => {
    const idempotencyKey = idempotencySchema.safeParse(request.headers.get("idempotency-key"));
    if (!idempotencyKey.success) return safeJson({ status: "validation_failed" }, 400);
    if (!resolved.services.stripePaymentProvider || !resolved.services.textTrialFingerprintHashKey) {
      return safeJson({ status: "not_available" }, 503);
    }
    try {
      const setup = await resolved.services.trials.getTextStarterCardSetup(resolved.context, resolved.body.purchaseIntentId);
      if (!setup) return safeJson({ status: "not_eligible" }, 409);
      const evidence = await resolved.services.stripePaymentProvider.retrieveTrialCardSetup({
        externalSetupIntentRef: setup.external_setup_intent_ref,
        expectedCustomerRef: setup.external_customer_ref,
        tenantId: resolved.context.tenantId, purchaseIntentId: resolved.body.purchaseIntentId,
      });
      const fingerprintHash = createHmac("sha256", resolved.services.textTrialFingerprintHashKey)
        .update(evidence.cardFingerprint, "utf8").digest();
      const result = await resolved.services.trials.activateTextStarter(resolved.context, {
        purchaseIntentId: resolved.body.purchaseIntentId, setupId: setup.id,
        externalCustomerRef: evidence.externalCustomerRef,
        externalSetupIntentRef: evidence.externalSetupIntentRef,
        externalPaymentMethodRef: evidence.externalPaymentMethodRef, fingerprintHash,
        trialGrantId: randomUUID(), entitlementSnapshotId: randomUUID(), idempotencyKey: idempotencyKey.data,
      });
      return safeJson(result, result.status === "activated" ? 200 : 409);
    } catch (error) {
      console.error("text_trial_activation_failed", { requestId: resolved.context.requestId,
        error: error instanceof Error ? error.name : "unknown" });
      return safeJson({ status: "temporarily_unavailable" }, 503);
    }
  });
}
