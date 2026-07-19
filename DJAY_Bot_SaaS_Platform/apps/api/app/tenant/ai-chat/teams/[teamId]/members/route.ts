import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../../../../lib/http";
import { resolveTenantRequest } from "../../../../../../lib/tenant-context";

const bodySchema = z.object({ membershipId: z.uuid() }).strict();
export async function POST(request: NextRequest, route: { params: Promise<{ teamId: string }> }) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "team.manage_roles") || !(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  try {
    const { teamId } = await route.params;
    const result = await resolved.services.tenantAiOperations.addTeamMember(resolved.context, z.uuid().parse(teamId), bodySchema.parse(await readJson(request)).membershipId);
    return safeJson(result, result.status === "added" ? 201 : 409);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError ? safeJson({ status: "validation_failed" }, 400) : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
