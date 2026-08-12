import { tenantRoleAllows } from "@djay/authorization";
import { uuidSchema } from "@djay/shared";
import type { NextRequest } from "next/server";
import { safeJson } from "../../../../../../lib/http";
import { resolveTenantRequest } from "../../../../../../lib/tenant-context";

export async function GET(request: NextRequest, route: { params: Promise<{ agentId: string }> }) {
  const resolved = await resolveTenantRequest(request); const agentId = uuidSchema.safeParse((await route.params).agentId);
  if (!resolved || !agentId.success || !tenantRoleAllows(resolved.context.role, "ai_chat.read")) return safeJson({ status: "not_found" }, 404);
  return safeJson({ versions: await resolved.services.aiChat.listVersions(resolved.context, agentId.data) });
}
