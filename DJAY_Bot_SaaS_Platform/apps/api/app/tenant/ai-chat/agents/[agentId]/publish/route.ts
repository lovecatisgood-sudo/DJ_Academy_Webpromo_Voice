import { tenantRoleAllows } from "@djay/authorization";
import { uuidSchema } from "@djay/shared";
import type { NextRequest } from "next/server";
import { hasTrustedOrigin, safeJson } from "../../../../../../lib/http";
import { resolveTenantRequest } from "../../../../../../lib/tenant-context";

export async function POST(request: NextRequest, route: { params: Promise<{ agentId: string }> }) {
  const resolved = await resolveTenantRequest(request);
  const agentId = uuidSchema.safeParse((await route.params).agentId);
  if (!resolved || !agentId.success || !tenantRoleAllows(resolved.context.role, "ai_chat.publish") || !(await hasTrustedOrigin(request))) {
    return safeJson({ status: "not_found" }, 404);
  }
  try {
    const result = await resolved.services.aiChat.publish(resolved.context, agentId.data);
    return safeJson(result, result.status === "published" ? 200 : result.status === "not_found" ? 404 : 403);
  } catch {
    return safeJson({ status: "validation_failed" }, 422);
  }
}
