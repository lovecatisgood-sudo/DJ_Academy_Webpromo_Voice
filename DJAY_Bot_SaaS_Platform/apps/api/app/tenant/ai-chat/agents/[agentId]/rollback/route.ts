import { tenantRoleAllows } from "@djay/authorization";
import { uuidSchema } from "@djay/shared";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../../../../lib/http";
import { resolveTenantRequest } from "../../../../../../lib/tenant-context";

const bodySchema = z.object({ sourceVersionId: z.uuid() }).strict();
export async function POST(request: NextRequest, route: { params: Promise<{ agentId: string }> }) {
  const resolved = await resolveTenantRequest(request); const agentId = uuidSchema.safeParse((await route.params).agentId);
  if (!resolved || !agentId.success || !tenantRoleAllows(resolved.context.role, "ai_chat.publish") || !(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  try {
    const body = bodySchema.parse(await readJson(request)); const result = await resolved.services.aiChat.rollback(resolved.context, agentId.data, body.sourceVersionId);
    return safeJson(result, result.status === "published" ? 200 : result.status === "limit_reached" ? 409 : result.status === "not_found" ? 404 : 403);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError ? safeJson({ status: "validation_failed" }, 400) : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
