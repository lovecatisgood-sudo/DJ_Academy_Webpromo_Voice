import { platformRoleAllows } from "@djay/authorization";
import { uuidSchema } from "@djay/shared";
import type { NextRequest } from "next/server";
import { hasTrustedOrigin, safeJson } from "../../../../../lib/http";
import { resolvePlatformRequest } from "../../../../../lib/platform-context";

export async function POST(request: NextRequest, route: { params: Promise<{ grantId: string }> }) {
  const resolved = await resolvePlatformRequest(request); const parsed = uuidSchema.safeParse((await route.params).grantId);
  if (!resolved || !parsed.success || !platformRoleAllows(resolved.context.role, "platform.support.revoke") || !(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  const result = await resolved.services.platformSupport.revokeGrant(resolved.context, parsed.data);
  return safeJson(result, result.status === "revoked" ? 200 : 404);
}
