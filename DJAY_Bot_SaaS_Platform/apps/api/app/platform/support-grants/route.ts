import { platformRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../lib/http";
import { resolvePlatformRequest } from "../../../lib/platform-context";

const requestSchema = z.object({
  tenantId: z.uuid(), reason: z.string().trim().min(12).max(500),
  durationMinutes: z.number().int().min(15).max(240),
}).strict();

export async function GET(request: NextRequest) {
  const resolved = await resolvePlatformRequest(request);
  if (!resolved || !platformRoleAllows(resolved.context.role, "platform.audit.read")) return safeJson({ status: "not_found" }, 404);
  return safeJson({ grants: await resolved.services.platformSupport.listGrants(resolved.context) });
}

export async function POST(request: NextRequest) {
  const resolved = await resolvePlatformRequest(request);
  if (!resolved || !platformRoleAllows(resolved.context.role, "platform.support.request") || !(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  try {
    const result = await resolved.services.platformSupport.requestGrant(resolved.context, requestSchema.parse(await readJson(request)));
    return safeJson(result, result.status === "requested" ? 202 : 404);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError ? safeJson({ status: "validation_failed" }, 400) : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
