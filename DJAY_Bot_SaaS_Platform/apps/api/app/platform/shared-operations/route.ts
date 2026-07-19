import { platformRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../lib/http";
import { resolvePlatformRequest } from "../../../lib/platform-context";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("provision_add_on"), requestId: z.uuid() }).strict(),
  z.object({ action: z.literal("create_engagement"), serviceRequestId: z.uuid(), title: z.string().trim().min(3).max(200),
    scope: z.string().trim().min(20).max(20000), nextActionOwner: z.enum(["customer","djai","shared"]), targetAt: z.iso.datetime().optional() }).strict(),
  z.object({ action: z.literal("update_engagement"), engagementId: z.uuid(),
    status: z.enum(["awaiting_customer","scheduled","in_progress","review","completed","cancelled"]),
    nextActionOwner: z.enum(["customer","djai","shared"]), body: z.string().trim().min(2).max(5000), idempotencyKey: z.uuid() }).strict(),
]);
export async function GET(request: NextRequest) {
  const resolved = await resolvePlatformRequest(request);
  if (!resolved || !platformRoleAllows(resolved.context.role, "platform.fulfillment.read")) return safeJson({ status: "not_found" }, 404);
  return safeJson({ queue: await resolved.services.platformSharedOperations.queue(resolved.context) });
}
export async function POST(request: NextRequest) {
  const resolved = await resolvePlatformRequest(request);
  if (!resolved || !platformRoleAllows(resolved.context.role, "platform.fulfillment.manage") || !(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  if (Date.now() - resolved.session.reauthenticatedAt.getTime() > 10 * 60_000) return safeJson({ status: "reauthentication_required" }, 403);
  try {
    const body = schema.parse(await readJson(request));
    if (body.action === "provision_add_on") {
      if (!platformRoleAllows(resolved.context.role, "platform.billing.manage")) return safeJson({ status: "not_found" }, 404);
      return safeJson(await resolved.services.platformSharedOperations.provisionAddOn(resolved.context, body.requestId));
    }
    if (body.action === "update_engagement") {
      const result = await resolved.services.platformSharedOperations.updateEngagement(resolved.context, body);
      return safeJson(result, result.status === "updated" ? 200 : result.status === "idempotency_conflict" ? 409 : result.status === "not_found" ? 404 : 400);
    }
    return safeJson(await resolved.services.platformSharedOperations.createEngagement(resolved.context, {
      serviceRequestId: body.serviceRequestId, title: body.title, scope: body.scope, nextActionOwner: body.nextActionOwner,
      ...(body.targetAt ? { targetAt: new Date(body.targetAt) } : {}),
    }));
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError ? safeJson({ status: "validation_failed" }, 400) : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
