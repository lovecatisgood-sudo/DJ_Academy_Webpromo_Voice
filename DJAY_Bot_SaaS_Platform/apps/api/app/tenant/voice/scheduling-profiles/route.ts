import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../../lib/http";
import { resolveTenantRequest } from "../../../../lib/tenant-context";
import { hasSensitiveTenantAssurance } from "../../../../lib/tenant-assurance";

const endpoint = z.url().refine((value) => new URL(value).protocol === "https:");
const schema = z.discriminatedUnion("providerKind", [
  z.object({ name: z.string().trim().min(2).max(160), providerKind: z.literal("google_calendar"), config: z.object({
    calendarId: z.string().trim().min(3).max(500), serviceAccountEmail: z.email(), privateKey: z.string().min(100).max(10000),
  }).strict() }).strict(),
  z.object({ name: z.string().trim().min(2).max(160), providerKind: z.literal("webhook"), config: z.object({ endpoint, bearerToken: z.string().min(16).max(4096).optional() }).strict() }).strict(),
]);
export async function POST(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "integrations.manage") || !(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  if (!hasSensitiveTenantAssurance(resolved.session)) return safeJson({ status: "reauthentication_required" }, 403);
  if (!resolved.services.voiceTelephonyEnvelopeKey) return safeJson({ status: "not_available" }, 503);
  try {
    const result = await resolved.services.tenantVoiceTelephony.createSchedulingProfile(resolved.context, { ...schema.parse(await readJson(request)), envelopeKey: resolved.services.voiceTelephonyEnvelopeKey });
    return safeJson(result, result.status === "created" ? 201 : 403);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError ? safeJson({ status: "validation_failed" }, 400) : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
