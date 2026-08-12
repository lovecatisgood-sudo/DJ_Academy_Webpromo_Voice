import { tenantRoleAllows } from "@djay/authorization";
import { leadInputSchema, leadStatusSchema } from "@djay/domain";
import type { NextRequest } from "next/server";
import { ZodError } from "zod";
import { z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../lib/http";
import { resolveTenantRequest } from "../../../lib/tenant-context";
import { csvResponse } from "../../../lib/csv";

export async function POST(request: NextRequest) {
const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "leads.write") || !(await hasTrustedOrigin(request))) {
    return safeJson({ status: "not_found" }, 404);
  }
  try {
    const result = await resolved.services.sharedDomain.createLead(resolved.context, leadInputSchema.parse(await readJson(request)));
    return safeJson(result, result.status === "created" ? 201 : 404);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400) : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}

export async function GET(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "leads.read")) return safeJson({ status: "not_found" }, 404);
  const leads = await resolved.services.sharedDomain.listLeads(resolved.context);
  if (request.nextUrl.searchParams.get("format") === "csv") {
    return csvResponse("djay-leads.csv", [
      ["lead_id", "contact_name", "title", "source", "status", "created_at", "updated_at"],
      ...leads.map((lead) => [lead.id, lead.contactName, lead.title, lead.source, lead.status, lead.createdAt.toISOString(), lead.updatedAt.toISOString()]),
    ]);
  }
  return safeJson({ leads });
}

const updateLeadSchema = z.object({ leadId: z.uuid(), status: leadStatusSchema }).strict();

export async function PATCH(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "leads.write") || !(await hasTrustedOrigin(request))) {
    return safeJson({ status: "not_found" }, 404);
  }
  try {
    const input = updateLeadSchema.parse(await readJson(request));
    const result = await resolved.services.sharedDomain.updateLeadStatus(resolved.context, input.leadId, input.status);
    return safeJson(result, result.status === "accepted" ? 200 : 404);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400) : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
