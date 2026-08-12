import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../lib/http";
import { resolveTenantRequest } from "../../../lib/tenant-context";

const recordVoiceSchema = z.object({ action: z.literal("record_voice_test"), deploymentId: z.uuid() }).strict();

export async function GET(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved) return safeJson({ status: "not_found" }, 404);
  return safeJson({ runs: await resolved.services.tenantBotRegression.list(resolved.context) });
}

export async function POST(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "voice.deploy") || !(await hasTrustedOrigin(request))) {
    return safeJson({ status: "not_found" }, 404);
  }
  try {
    const body = recordVoiceSchema.parse(await readJson(request));
    const result = await resolved.services.tenantBotRegression.recordLatestCompletedVoiceSession(
      resolved.context, body.deploymentId,
    );
    return safeJson(result, result.status === "recorded" ? 200 : 404);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400)
      : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
