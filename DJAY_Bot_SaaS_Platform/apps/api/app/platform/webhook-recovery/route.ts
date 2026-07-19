import { platformRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../lib/http";
import { resolvePlatformRequest } from "../../../lib/platform-context";

const schema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("request"), jobId: z.uuid(),
    action: z.enum(["retry_application", "accept_unsupported", "escalate_provider"]),
    reason: z.string().trim().min(8).max(1000) }).strict(),
  z.object({ operation: z.literal("review"), caseId: z.uuid(), approve: z.boolean(),
    note: z.string().trim().min(8).max(1000) }).strict(),
]);

export async function GET(request: NextRequest) {
  const resolved = await resolvePlatformRequest(request);
  if (!resolved || !platformRoleAllows(resolved.context.role, "platform.billing.read")) {
    return safeJson({ status: "not_found" }, 404);
  }
  return safeJson({ recovery:
    await resolved.services.platformCommerce.webhookRecoveryOverview(resolved.context) });
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
    const result = input.operation === "request"
      ? await resolved.services.platformCommerce.requestWebhookRecoveryCase(resolved.context, input)
      : await resolved.services.platformCommerce.reviewWebhookRecoveryCase(resolved.context, input);
    return safeJson(result, input.operation === "request" ? 201 : 200);
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return safeJson({ status: "validation_failed" }, 400);
    }
    const code = error instanceof Error ? error.message : "unknown";
    if (code.includes("different_reviewer_required")) {
      return safeJson({ status: "different_reviewer_required" }, 409);
    }
    if (code.includes("not_reviewable") || code.includes("attention_required")) {
      return safeJson({ status: "not_reviewable" }, 409);
    }
    return safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
