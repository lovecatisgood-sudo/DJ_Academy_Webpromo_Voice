import { platformRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../lib/http";
import { resolvePlatformRequest } from "../../../lib/platform-context";

export async function GET(request: NextRequest) {
  const resolved = await resolvePlatformRequest(request);
  if (!resolved || !platformRoleAllows(resolved.context.role, "platform.billing.read")) {
    return safeJson({ status: "not_found" }, 404);
  }
  return safeJson({
    reconciliation: await resolved.services.platformCommerce.reconciliationOverview(resolved.context),
  });
}

const actionSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("request"), tenantId: z.uuid(), resultId: z.uuid(),
    action: z.enum(["investigate", "accept_provider_only", "correct_correlation", "request_provider_credit"]),
    reason: z.string().trim().min(8).max(1000),
  }).strict(),
  z.object({
    operation: z.literal("review"), caseId: z.uuid(), approve: z.boolean(),
    note: z.string().trim().min(1).max(1000),
  }).strict(),
]);

export async function POST(request: NextRequest) {
  const resolved = await resolvePlatformRequest(request);
  if (!resolved || !platformRoleAllows(resolved.context.role, "platform.billing.manage")
    || !(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  if (Date.now() - resolved.session.reauthenticatedAt.getTime() > 10 * 60 * 1000) {
    return safeJson({ status: "reauthentication_required" }, 403);
  }
  try {
    const input = actionSchema.parse(await readJson(request));
    const result = input.operation === "request"
      ? await resolved.services.platformCommerce.requestUsageReconciliationCase(resolved.context, input)
      : await resolved.services.platformCommerce.reviewUsageReconciliationCase(resolved.context, input);
    return safeJson(result);
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return safeJson({ status: "validation_failed" }, 400);
    }
    const code = error instanceof Error ? error.message : "operation_failed";
    return safeJson({ status: ["different_reviewer_required", "usage_reconciliation_case_already_reviewed"]
      .some((known) => code.includes(known)) ? code.match(/different_reviewer_required|usage_reconciliation_case_already_reviewed/)?.[0]
        : "operation_failed" }, 409);
  }
}
