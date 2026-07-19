import { randomUUID } from "node:crypto";
import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../../../lib/http";
import { hasSensitiveTenantAssurance } from "../../../../../lib/tenant-assurance";
import { resolveTenantRequest } from "../../../../../lib/tenant-context";

const requestSchema = z.object({ accepted: z.literal(true) }).strict();
const idSchema = z.uuid();

export async function POST(request: NextRequest, context: { params: Promise<{ subscriptionId: string }> }) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "billing.checkout")) {
    return safeJson({ status: "not_found" }, 404);
  }
  if (!(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  if (!hasSensitiveTenantAssurance(resolved.session)) {
    return safeJson({ status: "reauthentication_required" }, 403);
  }
  try {
    requestSchema.parse(await readJson(request));
    const { subscriptionId } = await context.params;
    const result = await resolved.services.tenantCommerce.createContractSnapshot(resolved.context, {
      subscriptionId: idSchema.parse(subscriptionId), contractId: randomUUID(), acceptedAt: new Date(),
    });
    return safeJson(result, result.status === "subscription_not_found" ? 404 : 200);
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return safeJson({ status: "validation_failed" }, 400);
    }
    console.error("subscription_contract_acceptance_failed", {
      requestId: resolved.context.requestId, error: error instanceof Error ? error.name : "unknown",
    });
    return safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
