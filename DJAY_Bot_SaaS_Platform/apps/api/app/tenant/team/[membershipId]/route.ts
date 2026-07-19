import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../../lib/http";
import { hasSensitiveTenantAssurance } from "../../../../lib/tenant-assurance";
import { resolveTenantRequest } from "../../../../lib/tenant-context";

const membershipIdSchema = z.uuid();
const roleSchema = z.object({
  role: z.enum([
    "tenant_admin", "tenant_operator", "tenant_conversation_manager",
    "tenant_human_agent", "tenant_analyst", "tenant_billing_manager",
  ]),
}).strict();

async function authorize(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "team.manage_roles")
    || !(await hasTrustedOrigin(request))) return null;
  return resolved;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ membershipId: string }> },
) {
  const resolved = await authorize(request);
  if (!resolved) return safeJson({ status: "not_found" }, 404);
  if (!hasSensitiveTenantAssurance(resolved.session)) return safeJson({ status: "reauthentication_required" }, 403);
  try {
    const membershipId = membershipIdSchema.parse((await params).membershipId);
    const { role } = roleSchema.parse(await readJson(request));
    const result = await resolved.services.tenantWorkspace.changeMembershipRole(
      resolved.context, { membershipId, role },
    );
    return safeJson(result, result.status === "role_changed" ? 200
      : result.status === "owner_protected" ? 409 : 404);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400)
      : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ membershipId: string }> },
) {
  const resolved = await authorize(request);
  if (!resolved) return safeJson({ status: "not_found" }, 404);
  if (!hasSensitiveTenantAssurance(resolved.session)) return safeJson({ status: "reauthentication_required" }, 403);
  try {
    const membershipId = membershipIdSchema.parse((await params).membershipId);
    const result = await resolved.services.tenantWorkspace.revokeMembership(resolved.context, membershipId);
    return safeJson(result, result.status === "revoked" ? 200
      : result.status === "owner_protected" ? 409 : 404);
  } catch (error) {
    return error instanceof ZodError ? safeJson({ status: "validation_failed" }, 400)
      : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
