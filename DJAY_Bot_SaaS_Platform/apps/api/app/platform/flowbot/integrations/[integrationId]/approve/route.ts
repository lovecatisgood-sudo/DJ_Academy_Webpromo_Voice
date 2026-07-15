import { platformRoleAllows } from "@djay/authorization";
import { uuidSchema } from "@djay/shared";
import type { NextRequest } from "next/server";
import { hasTrustedOrigin, safeJson } from "../../../../../../lib/http";
import { resolvePlatformRequest } from "../../../../../../lib/platform-context";

const assuranceWindowMs = 10 * 60 * 1000;
export async function POST(request: NextRequest, route: { params: Promise<{ integrationId: string }> }) {
  const resolved = await resolvePlatformRequest(request); const parsed = uuidSchema.safeParse((await route.params).integrationId);
  if (!resolved || !parsed.success || !platformRoleAllows(resolved.context.role, "platform.routing.change") || !(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  if (Date.now() - resolved.session.reauthenticatedAt.getTime() > assuranceWindowMs) return safeJson({ status: "reauthentication_required" }, 403);
  const result = await resolved.services.platformFlowbotIntegrations.approve(resolved.context, parsed.data);
  return safeJson(result, result.status === "approved" ? 200 : 409);
}
