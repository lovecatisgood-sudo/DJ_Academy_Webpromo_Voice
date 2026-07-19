import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../lib/http";
import { resolveTenantRequest } from "../../../lib/tenant-context";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("request_add_on"), subscriptionId: z.uuid().optional(),
    addOnKey: z.enum(["additional_administrator","additional_workspace","additional_social_channel","starter_branding_removal"]),
    quantity: z.number().int().min(1).max(100), requestedScope: z.record(z.string(), z.unknown()).default({}), idempotencyKey: z.uuid() }).strict(),
  z.object({ action: z.literal("request_service"), serviceKind: z.enum(["flow_starter_setup","flow_advanced_design","flow_complex_automation","knowledge_base_setup","ai_sales_configuration","ai_advanced_sales_system","voice_agent_setup","telephone_integration","custom_voice_automation","enterprise"]),
    productKey: z.enum(["flowbot","ai_chat","voice"]).optional(), brief: z.string().trim().min(20).max(10000), idempotencyKey: z.uuid() }).strict(),
  z.object({ action: z.literal("engagement_update"), engagementId: z.uuid(), body: z.string().trim().min(2).max(5000), idempotencyKey: z.uuid() }).strict(),
  z.object({ action: z.literal("tutorial"), tutorialKey: z.string().regex(/^[a-z][a-z0-9_.-]{1,99}$/), status: z.enum(["started","completed","dismissed"]), lastStepKey: z.string().max(100).optional() }).strict(),
]);

export async function GET(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "tenant.read")) return safeJson({ status: "not_found" }, 404);
  return safeJson({ operations: await resolved.services.tenantSharedOperations.overview(resolved.context) });
}
export async function POST(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  try {
    const body = schema.parse(await readJson(request));
    if (body.action === "tutorial") {
      return safeJson(await resolved.services.tenantSharedOperations.updateTutorial(resolved.context, {
        tutorialKey: body.tutorialKey,
        status: body.status,
        ...(body.lastStepKey ? { lastStepKey: body.lastStepKey } : {}),
      }));
    }
    if (!tenantRoleAllows(resolved.context.role, "subscriptions.manage")) return safeJson({ status: "not_found" }, 404);
    if (body.action === "request_add_on") {
      const result = await resolved.services.tenantSharedOperations.requestAddOn(resolved.context, {
        addOnKey: body.addOnKey, quantity: body.quantity, requestedScope: body.requestedScope, idempotencyKey: body.idempotencyKey,
        ...(body.subscriptionId ? { subscriptionId: body.subscriptionId } : {}),
      });
      return safeJson(result, result.status === "requested" ? 201 : result.status === "idempotency_conflict" ? 409 : 400);
    }
    if (body.action === "engagement_update") {
      const result = await resolved.services.tenantSharedOperations.addEngagementUpdate(resolved.context, body);
      return safeJson(result, result.status === "updated" ? 200 : result.status === "idempotency_conflict" ? 409 : result.status === "not_found" ? 404 : 400);
    }
    const result = await resolved.services.tenantSharedOperations.requestService(resolved.context, {
      serviceKind: body.serviceKind, brief: body.brief, idempotencyKey: body.idempotencyKey,
      ...(body.productKey ? { productKey: body.productKey } : {}),
    });
    return safeJson(result, result.status === "requested" ? 201 : 409);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError ? safeJson({ status: "validation_failed" }, 400) : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
