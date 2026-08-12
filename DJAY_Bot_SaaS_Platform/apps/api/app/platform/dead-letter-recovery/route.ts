import { platformRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../lib/http";
import { resolvePlatformRequest } from "../../../lib/platform-context";

const requestSchema = z.object({
  queueKind: z.enum(["system_email", "flowbot_email", "ai_chat_email", "appointment_calendar"]),
  itemId: z.uuid(), attemptCount: z.number().int().nonnegative(),
  reason: z.string().trim().min(12).max(500),
}).strict();

export async function GET(request: NextRequest) {
  const resolved = await resolvePlatformRequest(request);
  if (!resolved || !platformRoleAllows(resolved.context.role, "platform.recovery.read")) {
    return safeJson({ status: "not_found" }, 404);
  }
  try {
    return safeJson({ recovery: await resolved.services.platformRecovery.overview(resolved.context) });
  } catch {
    return safeJson({ status: "temporarily_unavailable" }, 503);
  }
}

export async function POST(request: NextRequest) {
  const resolved = await resolvePlatformRequest(request);
  if (!resolved || !platformRoleAllows(resolved.context.role, "platform.recovery.request")
      || !(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  try {
    const result = await resolved.services.platformRecovery.request(
      resolved.context, requestSchema.parse(await readJson(request)),
    );
    return safeJson(result, result.status === "requested" ? 202 : 409);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400)
      : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
