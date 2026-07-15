import { tenantRoleAllows } from "@djay/authorization";
import { leadInputSchema } from "@djay/domain";
import type { NextRequest } from "next/server";
import { ZodError } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../lib/http";
import { resolveTenantRequest } from "../../../lib/tenant-context";

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
  return safeJson({ leads: await resolved.services.sharedDomain.listLeads(resolved.context) });
}
