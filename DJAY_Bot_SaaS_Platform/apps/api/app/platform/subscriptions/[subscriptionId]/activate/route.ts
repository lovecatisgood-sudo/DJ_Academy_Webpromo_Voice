import { randomUUID } from "node:crypto";
import { platformRoleAllows } from "@djay/authorization";
import { uuidSchema } from "@djay/shared";
import type { NextRequest } from "next/server";
import { hasTrustedOrigin, safeJson } from "../../../../../lib/http";
import { resolvePlatformRequest } from "../../../../../lib/platform-context";

const assuranceWindowMs = 10 * 60 * 1000;

export async function POST(request: NextRequest, context: { params: Promise<{ subscriptionId: string }> }) {
  const resolved = await resolvePlatformRequest(request);
  if (!resolved || !platformRoleAllows(resolved.context.role, "platform.billing.manage")) {
    return safeJson({ status: "not_found" }, 404);
  }
  if (!(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  if (Date.now() - resolved.session.reauthenticatedAt.getTime() > assuranceWindowMs) {
    return safeJson({ status: "reauthentication_required" }, 403);
  }
  const { subscriptionId } = await context.params;
  const parsedId = uuidSchema.safeParse(subscriptionId);
  if (!parsedId.success) return safeJson({ status: "not_found" }, 404);
  const result = await resolved.services.platformCommerce.activatePilot(resolved.context, {
    subscriptionId: parsedId.data,
    snapshotId: randomUUID(),
    now: new Date(),
  });
  return safeJson(result, result.status === "activated" ? 200 : 404);
}
