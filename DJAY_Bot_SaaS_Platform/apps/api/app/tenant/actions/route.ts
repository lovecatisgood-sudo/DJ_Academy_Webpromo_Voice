import { actionRequestSchema } from "@djay/action-gateway";
import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../lib/http";
import { resolveTenantRequest } from "../../../lib/tenant-context";

const commandSchema = z.object({ entitlementSnapshotId: z.uuid(), action: actionRequestSchema }).strict();

export async function POST(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "actions.execute") || !(await hasTrustedOrigin(request))) {
    return safeJson({ status: "not_found" }, 404);
  }
  try {
    const body = commandSchema.parse(await readJson(request));
    const result = await resolved.services.sharedDomain.executeAction(resolved.context, body.entitlementSnapshotId, body.action);
    return safeJson(result, result.status === "denied" ? 403 : 200);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400) : safeJson({ status: "action_failed" }, 409);
  }
}
