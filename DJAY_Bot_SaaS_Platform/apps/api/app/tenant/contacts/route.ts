import { tenantRoleAllows } from "@djay/authorization";
import { contactInputSchema } from "@djay/domain";
import type { NextRequest } from "next/server";
import { ZodError } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../lib/http";
import { resolveTenantRequest } from "../../../lib/tenant-context";
import { csvResponse } from "../../../lib/csv";

export async function GET(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "contacts.read")) return safeJson({ status: "not_found" }, 404);
  const [contacts, identityReviewCandidates] = await Promise.all([
    resolved.services.sharedDomain.listContacts(resolved.context),
    resolved.services.sharedDomain.listIdentityReviewCandidates(resolved.context),
  ]);
  if (request.nextUrl.searchParams.get("format") === "csv") {
    return csvResponse("djay-customers.csv", [
      ["contact_id", "name", "locale", "consent_status", "email", "phone", "tags", "lead_count", "updated_at"],
      ...contacts.map((contact) => [
        contact.id, contact.displayName, contact.locale, contact.consentStatus,
        contact.identities.filter((identity) => identity.kind === "email").map((identity) => identity.value).join("; "),
        contact.identities.filter((identity) => identity.kind === "phone").map((identity) => identity.value).join("; "),
        contact.tags.map((tag) => tag.label).join("; "), contact.leadCount, contact.updatedAt.toISOString(),
      ]),
    ]);
  }
  return safeJson({ contacts, identityReviewCandidates });
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
