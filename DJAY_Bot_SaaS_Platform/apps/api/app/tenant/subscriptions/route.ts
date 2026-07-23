import { randomUUID } from "node:crypto";
import { tenantRoleAllows } from "@djay/authorization";
import { publicPlanKeySchema } from "@djay/shared";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { safeJson } from "../../../lib/http";
import { resolveTenantRequest } from "../../../lib/tenant-context";
import { withTenantMutation } from "../../../lib/tenant-mutation";

const selectionSchema = z.object({ planKey: publicPlanKeySchema }).strict();

export async function GET(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "subscriptions.read")) {
    return safeJson({ status: "not_found" }, 404);
  }
  return safeJson({ subscriptions: await resolved.services.tenantCommerce.listSubscriptions(resolved.context) });
}

export async function POST(request: NextRequest) {
  return withTenantMutation(
    request,
    {
      permission: "billing.checkout",
      assurance: "recent_auth",
      rateLimit: { scope: "tenant-subscription-select", limit: 20, windowMs: 15 * 60 * 1000 },
      bodySchema: selectionSchema,
    },
    async (resolved) => {
      try {
        const result = await resolved.services.tenantCommerce.createPendingSubscription(resolved.context, {
          planKey: resolved.body.planKey,
          subscriptionId: randomUUID(),
          snapshotId: randomUUID(),
          quotaAccountId: randomUUID(),
          now: new Date(),
        });
        if (result.status === "created") {
          await resolved.services.purchaseIntents.createPurchaseIntent({
            planKey: resolved.body.planKey,
            tenantId: resolved.context.tenantId,
          });
        }
        return safeJson(result, result.status === "created" ? 201 : 409);
      } catch (error) {
        console.error("subscription_selection_failed", {
          requestId: resolved.context.requestId,
          error: error instanceof Error ? error.name : "unknown",
        });
        return safeJson({ status: "temporarily_unavailable" }, 503);
      }
    },
  );
}
