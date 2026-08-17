import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { safeJson } from "../../../../../lib/http";
import { withTenantMutation } from "../../../../../lib/tenant-mutation";

const bodySchema = z.object({ purchaseIntentId: z.uuid() }).strict();
const idempotencySchema = z.string().trim().min(16).max(180);

export async function POST(request: NextRequest) {
  return withTenantMutation(request, {
    permission: "billing.checkout", assurance: "recent_auth",
    rateLimit: { scope: "tenant-text-trial-setup", limit: 10, windowMs: 15 * 60 * 1000 }, bodySchema,
  }, async (resolved) => {
    const idempotencyKey = idempotencySchema.safeParse(request.headers.get("idempotency-key"));
    if (!idempotencyKey.success) return safeJson({ status: "validation_failed" }, 400);
    if (!resolved.services.stripePaymentProvider) return safeJson({ status: "not_available" }, 503);
    try {
      const prepared = await resolved.services.trials.prepareTextStarterCardSetup(resolved.context, {
        purchaseIntentId: resolved.body.purchaseIntentId, setupId: randomUUID(), idempotencyKey: idempotencyKey.data,
      });
      if (prepared.status !== "prepared") return safeJson(prepared, 409);
      const provider = await resolved.services.stripePaymentProvider.createTrialCardSetup({
        tenantId: resolved.context.tenantId, purchaseIntentId: resolved.body.purchaseIntentId,
        idempotencyKey: prepared.setup.idempotency_key,
      });
      await resolved.services.trials.completeTextStarterCardSetup(resolved.context, {
        setupId: prepared.setup.id, externalCustomerRef: provider.externalCustomerRef,
        externalSetupIntentRef: provider.externalSetupIntentRef,
      });
      return safeJson({ status: "ready", setupId: prepared.setup.id,
        externalSetupIntentRef: provider.externalSetupIntentRef, clientSecret: provider.clientSecret }, 200);
    } catch (error) {
      console.error("text_trial_setup_failed", { requestId: resolved.context.requestId,
        error: error instanceof Error ? error.name : "unknown" });
      return safeJson({ status: "temporarily_unavailable" }, 503);
    }
  });
}
