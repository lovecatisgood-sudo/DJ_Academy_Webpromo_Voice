import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../../lib/http";
import { resolveTenantRequest } from "../../../../lib/tenant-context";
import { hasSensitiveTenantAssurance } from "../../../../lib/tenant-assurance";

const eventSchema = z.enum(["conversation_updated", "lead_qualified", "handover_requested", "appointment_requested"]);
const endpointSchema = z.url().refine((value) => {
  const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443") && url.hostname !== "localhost";
});
const requestSchema = z.discriminatedUnion("integrationKind", [
  z.object({ integrationKind: z.literal("google_sheets"), name: z.string().trim().min(2).max(160), eventTypes: z.array(eventSchema).min(1).max(4),
    config: z.object({ spreadsheetId: z.string().regex(/^[a-zA-Z0-9_-]{20,200}$/), range: z.string().trim().min(1).max(200),
      serviceAccountEmail: z.email(), privateKey: z.string().min(100).max(10000) }).strict() }).strict(),
  z.object({ integrationKind: z.enum(["webhook", "crm"]), name: z.string().trim().min(2).max(160), eventTypes: z.array(eventSchema).min(1).max(4),
    config: z.object({ endpoint: endpointSchema, bearerToken: z.string().min(16).max(4096).optional() }).strict() }).strict(),
]);

export async function GET(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "ai_chat.read")) return safeJson({ status: "not_found" }, 404);
  return safeJson({ integrations: await resolved.services.tenantAiOperations.listIntegrations(resolved.context) });
}

export async function POST(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "integrations.manage") || !(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  if (!hasSensitiveTenantAssurance(resolved.session)) return safeJson({ status: "reauthentication_required" }, 403);
  if (!resolved.services.aiIntegrationEnvelopeKey) return safeJson({ status: "not_available" }, 503);
  try {
    const body = requestSchema.parse(await readJson(request));
    const result = await resolved.services.tenantAiOperations.createIntegration(resolved.context, { ...body, envelopeKey: resolved.services.aiIntegrationEnvelopeKey });
    return safeJson(result, result.status === "created" ? 201 : 403);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError ? safeJson({ status: "validation_failed" }, 400) : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
