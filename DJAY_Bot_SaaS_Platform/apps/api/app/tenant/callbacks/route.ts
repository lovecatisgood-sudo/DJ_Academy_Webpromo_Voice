import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../lib/http";
import { resolveTenantRequest } from "../../../lib/tenant-context";
import { csvResponse } from "../../../lib/csv";

const updateSchema = z.object({ callbackId: z.uuid(), status: z.enum(["completed", "cancelled"]) }).strict();

export async function GET(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "leads.read")) return safeJson({ status: "not_found" }, 404);
  const callbacks = await resolved.services.sharedDomain.listCallbacks(resolved.context);
  if (request.nextUrl.searchParams.get("format") === "csv") {
    return csvResponse("djay-callbacks.csv", [
      ["callback_id", "contact_name", "lead_title", "status", "due_at", "created_at", "completed_at", "conversation_reference"],
      ...callbacks.map((item) => [item.id, item.contactName, item.leadTitle, item.status, item.dueAt.toISOString(), item.createdAt.toISOString(), item.completedAt?.toISOString(), item.conversationId]),
    ]);
  }
  return safeJson({ callbacks });
}

export async function PATCH(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "leads.write") || !(await hasTrustedOrigin(request))) {
    return safeJson({ status: "not_found" }, 404);
  }
  try {
    const input = updateSchema.parse(await readJson(request));
    const result = await resolved.services.sharedDomain.updateCallback(resolved.context, input.callbackId, input.status);
    return safeJson(result, result.status === "accepted" ? 200 : result.status === "invalid_transition" ? 409 : 404);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400) : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
