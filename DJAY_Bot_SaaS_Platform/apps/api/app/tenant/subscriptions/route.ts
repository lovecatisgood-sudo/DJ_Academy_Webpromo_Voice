import { randomUUID } from "node:crypto";
import { tenantRoleAllows } from "@djay/authorization";
import { publicPlanKeySchema } from "@djay/shared";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../lib/http";
import { resolveTenantRequest } from "../../../lib/tenant-context";

const selectionSchema = z.object({ planKey: publicPlanKeySchema }).strict();
const assuranceWindowMs = 10 * 60 * 1000;

export async function GET(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "subscriptions.read")) {
    return safeJson({ status: "not_found" }, 404);
  }
  return safeJson({ subscriptions: await resolved.services.tenantCommerce.listSubscriptions(resolved.context) });
}

export async function POST(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "subscriptions.manage")) {
    return safeJson({ status: "not_found" }, 404);
  }
  if (!(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  const mfaAt = resolved.session.mfaVerifiedAt?.getTime() ?? 0;
  const reauthAt = resolved.session.reauthenticatedAt.getTime();
  if (Date.now() - mfaAt > assuranceWindowMs || Date.now() - reauthAt > assuranceWindowMs) {
    return safeJson({ status: "reauthentication_required" }, 403);
  }
  try {
    const { planKey } = selectionSchema.parse(await readJson(request));
    const result = await resolved.services.tenantCommerce.createPendingSubscription(resolved.context, {
      planKey,
      subscriptionId: randomUUID(),
      snapshotId: randomUUID(),
      quotaAccountId: randomUUID(),
      now: new Date(),
    });
    return safeJson(result, result.status === "created" ? 201 : 409);
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return safeJson({ status: "validation_failed" }, 400);
    console.error("subscription_selection_failed", { requestId: resolved.context.requestId, error: error instanceof Error ? error.name : "unknown" });
    return safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
