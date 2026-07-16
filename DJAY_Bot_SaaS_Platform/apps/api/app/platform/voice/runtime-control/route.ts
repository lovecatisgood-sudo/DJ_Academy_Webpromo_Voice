import { platformRoleAllows } from "@djay/authorization";
import { voiceRuntimeReasonSchema } from "@djay/shared";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { hasTrustedOrigin, readJson, safeJson } from "../../../../lib/http";
import { resolvePlatformRequest } from "../../../../lib/platform-context";

const assuranceWindowMs = 10 * 60 * 1_000;
const schema = z.object({
  mode: z.enum(["running", "paused", "emergency_stop"]),
  reasonCode: voiceRuntimeReasonSchema,
}).strict();

export async function GET(request: NextRequest) {
  const resolved = await resolvePlatformRequest(request);
  if (!resolved || !platformRoleAllows(resolved.context.role, "platform.routing.read")) {
    return safeJson({ status: "not_found" }, 404);
  }
  try {
    return safeJson({ control: await resolved.services.platformVoiceOperations.getControl(resolved.context) });
  } catch {
    return safeJson({ status: "not_found" }, 404);
  }
}

export async function PATCH(request: NextRequest) {
  const resolved = await resolvePlatformRequest(request);
  if (!resolved || !platformRoleAllows(resolved.context.role, "platform.routing.change")
      || !(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  if (Date.now() - resolved.session.reauthenticatedAt.getTime() > assuranceWindowMs) {
    return safeJson({ status: "reauthentication_required" }, 403);
  }
  try {
    const control = await resolved.services.platformVoiceOperations.setControl(
      resolved.context, schema.parse(await readJson(request, 1_000)),
    );
    return safeJson({ control });
  } catch (error) {
    return error instanceof z.ZodError
      ? safeJson({ status: "validation_failed" }, 400)
      : safeJson({ status: "not_available" }, 503);
  }
}
