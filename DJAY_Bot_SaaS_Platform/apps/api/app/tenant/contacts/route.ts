import { tenantRoleAllows } from "@djay/authorization";
import { contactInputSchema } from "@djay/domain";
import type { NextRequest } from "next/server";
import { ZodError } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../lib/http";
import { resolveTenantRequest } from "../../../lib/tenant-context";

export async function GET(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "contacts.read")) return safeJson({ status: "not_found" }, 404);
  return safeJson({ contacts: await resolved.services.sharedDomain.listContacts(resolved.context) });
}

export async function POST(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "contacts.write") || !(await hasTrustedOrigin(request))) {
    return safeJson({ status: "not_found" }, 404);
  }
  try {
    const result = await resolved.services.sharedDomain.createContact(resolved.context, contactInputSchema.parse(await readJson(request)));
    return safeJson(result, result.status === "created" ? 201 : 409);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400) : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
