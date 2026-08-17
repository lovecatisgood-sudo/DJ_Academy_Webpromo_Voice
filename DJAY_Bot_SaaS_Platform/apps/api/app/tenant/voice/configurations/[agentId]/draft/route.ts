import { tenantRoleAllows } from "@djay/authorization";
import { aiPlaybookSchema } from "@djay/sales-core";
import { uuidSchema } from "@djay/shared";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../../../../lib/http";
import { resolveTenantRequest } from "../../../../../../lib/tenant-context";

const updateSchema = z.object({
  revision: z.number().int().positive(),
  definition: aiPlaybookSchema,
  knowledgeRevisionIds: z.array(z.uuid()).max(1000).default([]),
}).strict();

async function agentId(route: { params: Promise<{ agentId: string }> }) {
  return uuidSchema.safeParse((await route.params).agentId);
}

export async function GET(request: NextRequest, route: { params: Promise<{ agentId: string }> }) {
  const resolved = await resolveTenantRequest(request);
  const id = await agentId(route);
  if (!resolved || !id.success || !tenantRoleAllows(resolved.context.role, "voice.read")) {
    return safeJson({ status: "not_found" }, 404);
  }
  const configuration = await resolved.services.voiceDeployments.getConfigurationDraft(resolved.context, id.data);
  return configuration ? safeJson({ configuration }) : safeJson({ status: "not_found" }, 404);
}

export async function PATCH(request: NextRequest, route: { params: Promise<{ agentId: string }> }) {
  const resolved = await resolveTenantRequest(request);
  const id = await agentId(route);
  if (!resolved || !id.success || !tenantRoleAllows(resolved.context.role, "voice.deploy")
    || !(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  try {
    const result = await resolved.services.voiceDeployments.updateConfigurationDraft(
      resolved.context, id.data, updateSchema.parse(await readJson(request, 192_000)),
    );
    return safeJson(result, result.status === "updated" ? 200
      : result.status === "conflict" ? 409
        : result.status === "not_found" ? 404
          : result.status === "not_entitled" ? 403 : 422);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400)
      : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
