import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../lib/http";
import { resolveTenantRequest } from "../../../lib/tenant-context";

const readSchema = z.object({ notificationId: z.uuid() }).strict();

export async function GET(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "contacts.read")) return safeJson({ status: "not_found" }, 404);
  return safeJson({ notifications: await resolved.services.sharedDomain.listTenantNotifications(resolved.context) });
}

export async function PATCH(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "contacts.read") || !(await hasTrustedOrigin(request))) {
    return safeJson({ status: "not_found" }, 404);
  }
  try {
    const input = readSchema.parse(await readJson(request));
    const result = await resolved.services.sharedDomain.markTenantNotificationRead(resolved.context, input.notificationId);
    return safeJson(result, result.status === "accepted" ? 200 : 404);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400) : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
