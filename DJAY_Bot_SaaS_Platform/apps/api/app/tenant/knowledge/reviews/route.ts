import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../../lib/http";
import { resolveTenantRequest } from "../../../../lib/tenant-context";

const updateSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), reviewId: z.uuid(), ownerMembershipId: z.uuid() }).strict(),
  z.object({ action: z.literal("complete"), reviewId: z.uuid(), ownerMembershipId: z.uuid(),
    note: z.string().trim().min(8).max(2000) }).strict(),
]);

export async function GET(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "knowledge.read")) return safeJson({ status: "not_found" }, 404);
  return safeJson(await resolved.services.knowledgeIngestion.listKnowledgeReviews(resolved.context));
}

export async function PATCH(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "knowledge.write") || !(await hasTrustedOrigin(request))) {
    return safeJson({ status: "not_found" }, 404);
  }
  try {
    const input = updateSchema.parse(await readJson(request));
    const result = await resolved.services.knowledgeIngestion.updateKnowledgeReview(resolved.context, input.reviewId, input);
    const status = result.status === "not_entitled" ? 403
      : result.status === "invalid_owner" ? 400 : result.status === "not_found_or_completed" ? 409 : 200;
    return safeJson(result, status);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400) : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
