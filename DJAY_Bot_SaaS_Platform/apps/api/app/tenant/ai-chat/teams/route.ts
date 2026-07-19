import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../../lib/http";
import { resolveTenantRequest } from "../../../../lib/tenant-context";

const teamSchema = z.object({ teamKey: z.string().regex(/^[a-z][a-z0-9_-]{1,63}$/), name: z.string().trim().min(2).max(160) }).strict();

export async function GET(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "team.read")) return safeJson({ status: "not_found" }, 404);
  return safeJson({ teams: await resolved.services.tenantAiOperations.listTeams(resolved.context) });
}

export async function POST(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "team.manage_roles") || !(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  try {
    const result = await resolved.services.tenantAiOperations.createTeam(resolved.context, teamSchema.parse(await readJson(request)));
    return safeJson(result, result.status === "created" ? 201 : 409);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError ? safeJson({ status: "validation_failed" }, 400) : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
