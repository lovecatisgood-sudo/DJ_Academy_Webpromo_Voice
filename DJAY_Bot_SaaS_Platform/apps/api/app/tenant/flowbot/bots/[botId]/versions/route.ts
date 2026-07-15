import { tenantRoleAllows } from "@djay/authorization";
import { uuidSchema } from "@djay/shared";
import type { NextRequest } from "next/server";
import { safeJson } from "../../../../../../lib/http";
import { resolveTenantRequest } from "../../../../../../lib/tenant-context";

export async function GET(request: NextRequest, route: { params: Promise<{ botId: string }> }) {
  const resolved = await resolveTenantRequest(request); const botId = uuidSchema.safeParse((await route.params).botId);
  if (!resolved || !botId.success || !tenantRoleAllows(resolved.context.role, "flowbot.read")) return safeJson({ status: "not_found" }, 404);
  return safeJson({ versions: await resolved.services.flowbot.listVersions(resolved.context, botId.data) });
}
