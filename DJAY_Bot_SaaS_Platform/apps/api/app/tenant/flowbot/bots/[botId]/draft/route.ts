import { tenantRoleAllows } from "@djay/authorization";
import { flowSnapshotSchema } from "@djay/flowbot-domain";
import { uuidSchema } from "@djay/shared";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../../../../lib/http";
import { resolveTenantRequest } from "../../../../../../lib/tenant-context";

const updateSchema = z.object({ revision: z.number().int().positive(), definition: flowSnapshotSchema }).strict();

export async function GET(request: NextRequest, route: { params: Promise<{ botId: string }> }) {
  const resolved = await resolveTenantRequest(request); const botId = uuidSchema.safeParse((await route.params).botId);
  if (!resolved || !botId.success || !tenantRoleAllows(resolved.context.role, "flowbot.read")) return safeJson({ status: "not_found" }, 404);
  const draft = await resolved.services.flowbot.getDraft(resolved.context, botId.data);
  return draft ? safeJson({ draft }) : safeJson({ status: "not_found" }, 404);
}

export async function PATCH(request: NextRequest, route: { params: Promise<{ botId: string }> }) {
  const resolved = await resolveTenantRequest(request); const botId = uuidSchema.safeParse((await route.params).botId);
  if (!resolved || !botId.success || !tenantRoleAllows(resolved.context.role, "flowbot.author") || !(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  try {
    const result = await resolved.services.flowbot.updateDraft(resolved.context, botId.data, updateSchema.parse(await readJson(request)));
    return safeJson(result, result.status === "updated" ? 200 : result.status === "revision_conflict" ? 409 : result.status === "validation_failed" ? 422 : 403);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError ? safeJson({ status: "validation_failed" }, 400) : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
