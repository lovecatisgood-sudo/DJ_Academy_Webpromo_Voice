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

export async function GET(request: NextRequest, route: { params: Promise<{ agentId: string }> }) {
  const resolved = await resolveTenantRequest(request);
  const agentId = uuidSchema.safeParse((await route.params).agentId);
  if (!resolved || !agentId.success || !tenantRoleAllows(resolved.context.role, "ai_chat.read")) {
    return safeJson({ status: "not_found" }, 404);
  }
  const draft = await resolved.services.aiChat.getDraft(resolved.context, agentId.data);
  return draft ? safeJson({ draft }) : safeJson({ status: "not_found" }, 404);
}

export async function PATCH(request: NextRequest, route: { params: Promise<{ agentId: string }> }) {
  const resolved = await resolveTenantRequest(request);
  const agentId = uuidSchema.safeParse((await route.params).agentId);
  if (!resolved || !agentId.success || !tenantRoleAllows(resolved.context.role, "ai_chat.author") || !(await hasTrustedOrigin(request))) {
    return safeJson({ status: "not_found" }, 404);
  }
  try {
    const result = await resolved.services.aiChat.updateDraft(resolved.context, agentId.data, updateSchema.parse(await readJson(request, 128_000)));
    return safeJson(result,
      result.status === "updated" ? 200
        : result.status === "conflict" ? 409
          : result.status === "validation_failed" ? 422
            : result.status === "limit_reached" ? 409 : 403,
    );
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400)
      : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
