import { platformRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../lib/http";
import { resolvePlatformRequest } from "../../../lib/platform-context";

const schema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("request"),
    gracePeriodHours: z.number().int().min(0).max(2160),
    restrictAfterHours: z.number().int().min(0).max(4320),
    customerNoticeOffsetsHours: z.array(z.number().int().min(0).max(4320)).max(20),
    reason: z.string().trim().min(8).max(1000) }).strict(),
  z.object({ operation: z.literal("review"), policyId: z.uuid(), approve: z.boolean(),
    note: z.string().trim().min(8).max(1000) }).strict(),
]);

export async function GET(request: NextRequest) {
  const resolved = await resolvePlatformRequest(request);
  if (!resolved || !platformRoleAllows(resolved.context.role, "platform.billing.read")) {
    return safeJson({ status: "not_found" }, 404);
  }
  return safeJson({ policies:
    await resolved.services.platformCommerce.listSubscriptionDunningPolicies(resolved.context) });
}

export async function POST(request: NextRequest) {
  const resolved = await resolvePlatformRequest(request);
  if (!resolved || !platformRoleAllows(resolved.context.role, "platform.billing.manage")
    || !(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  if (Date.now() - resolved.session.reauthenticatedAt.getTime() > 10 * 60_000) {
    return safeJson({ status: "reauthentication_required" }, 403);
  }
  try {
    const input = schema.parse(await readJson(request));
    if (input.operation === "request" && input.restrictAfterHours < input.gracePeriodHours) {
      return safeJson({ status: "validation_failed" }, 400);
    }
    const result = input.operation === "request"
      ? await resolved.services.platformCommerce.requestSubscriptionDunningPolicy(resolved.context, input)
      : await resolved.services.platformCommerce.reviewSubscriptionDunningPolicy(resolved.context, input);
    return safeJson(result, input.operation === "request" ? 201 : 200);
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return safeJson({ status: "validation_failed" }, 400);
    }
    const code = error instanceof Error ? error.message : "unknown";
    if (code.includes("different_reviewer_required")) {
      return safeJson({ status: "different_reviewer_required" }, 409);
    }
    if (code.includes("not_reviewable")) return safeJson({ status: "not_reviewable" }, 409);
    return safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
