import { platformRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../lib/http";
import { resolvePlatformRequest } from "../../../lib/platform-context";

const requestSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("request"), resultId: z.uuid(),
    action: z.enum(["investigate", "retry_provider_retrieval", "request_stripe_correction", "issue_customer_credit"]),
    reason: z.string().trim().min(8).max(1000) }).strict(),
  z.object({ operation: z.literal("review"), caseId: z.uuid(), approve: z.boolean(),
    note: z.string().trim().min(3).max(1000) }).strict(),
]);

export async function GET(request: NextRequest) {
  const resolved = await resolvePlatformRequest(request);
  if (!resolved || !platformRoleAllows(resolved.context.role, "platform.billing.read")) {
    return safeJson({ status: "not_found" }, 404);
  }
  return safeJson({ financialEventReconciliation:
    await resolved.services.platformCommerce.financialEventReconciliationOverview(resolved.context) });
}

export async function POST(request: NextRequest) {
  const resolved = await resolvePlatformRequest(request);
  if (!resolved || !platformRoleAllows(resolved.context.role, "platform.billing.manage")
    || !(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  if (Date.now() - resolved.session.reauthenticatedAt.getTime() > 10 * 60_000) {
    return safeJson({ status: "reauthentication_required" }, 403);
  }
  try {
    const input = requestSchema.parse(await readJson(request));
    const result = input.operation === "request"
      ? await resolved.services.platformCommerce.requestFinancialEventReconciliationCase(resolved.context, input)
      : await resolved.services.platformCommerce.reviewFinancialEventReconciliationCase(resolved.context, input);
    return safeJson(result, input.operation === "request" ? 201 : 200);
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return safeJson({ status: "validation_failed" }, 400);
    const code = error instanceof Error ? error.message : "unknown";
    if (code.includes("different_reviewer_required")) return safeJson({ status: "different_reviewer_required" }, 409);
    if (code.includes("already_reviewed")) return safeJson({ status: "already_reviewed" }, 409);
    return safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
