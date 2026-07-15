import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../../lib/http";
import { resolveTenantRequest } from "../../../../lib/tenant-context";

const teamSchema = z.object({
  teamKey: z.string().regex(/^[a-z][a-z0-9_-]{0,99}$/),
  name: z.string().trim().min(2).max(160),
  membershipIds: z.array(z.uuid()).min(1).max(100),
}).strict();

export async function GET(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "flowbot.read")) return safeJson({ status: "not_found" }, 404);
  return safeJson({ teams: await resolved.services.flowbot.listRoutingTeams(resolved.context) });
}

export async function PUT(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "flowbot.author") || !(await hasTrustedOrigin(request))) {
    return safeJson({ status: "not_found" }, 404);
  }
  try {
    const result = await resolved.services.flowbot.upsertRoutingTeam(resolved.context, teamSchema.parse(await readJson(request)));
    return safeJson(result, result.status === "saved" ? 200 : result.status === "not_entitled" ? 403 : 400);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400)
      : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
