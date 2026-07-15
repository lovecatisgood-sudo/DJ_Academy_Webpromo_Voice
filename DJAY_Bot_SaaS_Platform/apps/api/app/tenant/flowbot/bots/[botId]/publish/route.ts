import { tenantRoleAllows } from "@djay/authorization";
import { uuidSchema } from "@djay/shared";
import type { NextRequest } from "next/server";
import { hasTrustedOrigin, safeJson } from "../../../../../../lib/http";
import { resolveTenantRequest } from "../../../../../../lib/tenant-context";

export async function POST(request: NextRequest, route: { params: Promise<{ botId: string }> }) {
  const resolved = await resolveTenantRequest(request); const botId = uuidSchema.safeParse((await route.params).botId);
  if (!resolved || !botId.success || !tenantRoleAllows(resolved.context.role, "flowbot.publish") || !(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  const result = await resolved.services.flowbot.publish(resolved.context, botId.data);
  return safeJson(result, result.status === "published" ? 200 : result.status === "validation_failed" ? 422 : 403);
}
