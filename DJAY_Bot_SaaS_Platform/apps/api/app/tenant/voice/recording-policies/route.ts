import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../../lib/http";
import { resolveTenantRequest } from "../../../../lib/tenant-context";
import { hasSensitiveTenantAssurance } from "../../../../lib/tenant-assurance";

const schema = z.discriminatedUnion("recordingMode", [
  z.object({ deploymentId: z.uuid(), recordingMode: z.literal("disabled") }).strict(),
  z.object({ deploymentId: z.uuid(), recordingMode: z.literal("consent_required"), retentionDays: z.number().int().min(1).max(365),
    disclosureTh: z.string().trim().min(8).max(500), disclosureEn: z.string().trim().min(8).max(500), legalApprovalReference: z.string().trim().min(3).max(500) }).strict(),
]);
export async function POST(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "voice.deploy") || !(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  if (!hasSensitiveTenantAssurance(resolved.session)) return safeJson({ status: "reauthentication_required" }, 403);
  try {
    const result = await resolved.services.tenantVoiceTelephony.setRecordingPolicy(resolved.context, schema.parse(await readJson(request)));
    return safeJson(result, result.status === "created" ? 201 : 404);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError ? safeJson({ status: "validation_failed" }, 400) : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
