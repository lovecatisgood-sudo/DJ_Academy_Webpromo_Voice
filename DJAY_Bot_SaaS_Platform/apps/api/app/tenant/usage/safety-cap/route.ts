import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../../lib/http";
import { hasSensitiveTenantAssurance } from "../../../../lib/tenant-assurance";
import { resolveTenantRequest } from "../../../../lib/tenant-context";

const schema = z.object({
  subscriptionId: z.uuid(),
  safetyCapQuantity: z.number().int().nonnegative().max(1_000_000_000).nullable(),
}).strict();

export async function POST(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "billing.overage.manage")
    || !(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  if (!hasSensitiveTenantAssurance(resolved.session)) {
    return safeJson({ status: "reauthentication_required" }, 403);
  }
  try {
    const result = await resolved.services.tenantCommerce.updateSafetyCap(
      resolved.context, schema.parse(await readJson(request)),
    );
    return safeJson(result, result.status === "updated" ? 200
      : result.status === "not_found" ? 404 : 409);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400)
      : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
