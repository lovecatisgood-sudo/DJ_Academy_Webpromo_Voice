import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { safeJson } from "../../../../../lib/http";
import { withTenantMutation } from "../../../../../lib/tenant-mutation";

const bodySchema = z.object({ purchaseIntentId: z.uuid() }).strict();
const idempotencySchema = z.string().trim().min(16).max(200);

export async function POST(request: NextRequest) {
  return withTenantMutation(
    request,
    {
      permission: "billing.checkout",
      assurance: "recent_auth",
      rateLimit: { scope: "tenant-flow-trial-activate", limit: 10, windowMs: 15 * 60 * 1000 },
      bodySchema,
    },
    async (resolved) => {
      const idempotencyKey = idempotencySchema.safeParse(request.headers.get("idempotency-key"));
      if (!idempotencyKey.success) return safeJson({ status: "validation_failed" }, 400);
      try {
        const result = await resolved.services.trials.activateFlowStarter(resolved.context, {
          purchaseIntentId: resolved.body.purchaseIntentId,
          trialGrantId: randomUUID(),
          entitlementSnapshotId: randomUUID(),
          idempotencyKey: idempotencyKey.data,
        });
        return safeJson(result, result.status === "activated" ? 200 : 409);
      } catch (error) {
        console.error("flow_trial_activation_failed", {
          requestId: resolved.context.requestId,
          error: error instanceof Error ? error.name : "unknown",
        });
        return safeJson({ status: "temporarily_unavailable" }, 503);
      }
    },
  );
}
