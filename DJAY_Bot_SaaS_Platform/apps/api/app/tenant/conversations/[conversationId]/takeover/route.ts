import { tenantRoleAllows } from "@djay/authorization";
import { uuidSchema } from "@djay/shared";
import type { NextRequest } from "next/server";
import { hasTrustedOrigin, safeJson } from "../../../../../lib/http";
import { resolveTenantRequest } from "../../../../../lib/tenant-context";

export async function POST(request: NextRequest, route: { params: Promise<{ conversationId: string }> }) {
  const resolved = await resolveTenantRequest(request);
  const parsed = uuidSchema.safeParse((await route.params).conversationId);
  if (!resolved || !parsed.success || !tenantRoleAllows(resolved.context.role, "conversations.assign") || !(await hasTrustedOrigin(request))) {
    return safeJson({ status: "not_found" }, 404);
  }
  const result = await resolved.services.sharedDomain.takeOverConversation(resolved.context, parsed.data);
  return safeJson(result, result.status === "accepted" ? 200 : result.status === "transition_denied" ? 409 : 404);
}
