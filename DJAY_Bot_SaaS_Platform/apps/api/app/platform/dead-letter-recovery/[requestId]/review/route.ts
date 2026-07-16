import { platformRoleAllows } from "@djay/authorization";
import { uuidSchema } from "@djay/shared";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../../../lib/http";
import { resolvePlatformRequest } from "../../../../../lib/platform-context";

const assuranceWindowMs = 10 * 60 * 1000;
const reviewSchema = z.object({ decision: z.enum(["approve", "reject"]) }).strict();

export async function POST(request: NextRequest, route: { params: Promise<{ requestId: string }> }) {
  const resolved = await resolvePlatformRequest(request);
  const parsedId = uuidSchema.safeParse((await route.params).requestId);
  if (!resolved || !parsedId.success
      || !platformRoleAllows(resolved.context.role, "platform.recovery.review")
      || !(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  if (Date.now() - resolved.session.reauthenticatedAt.getTime() > assuranceWindowMs) {
    return safeJson({ status: "reauthentication_required" }, 403);
  }
  try {
    const input = reviewSchema.parse(await readJson(request));
    const result = await resolved.services.platformRecovery.review(resolved.context, parsedId.data, input.decision);
    return safeJson(result, ["applied", "rejected"].includes(result.status) ? 200 : 409);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400)
      : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
