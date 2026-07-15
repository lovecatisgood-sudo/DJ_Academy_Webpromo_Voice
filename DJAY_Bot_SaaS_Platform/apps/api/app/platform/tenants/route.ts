import { platformRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { safeJson } from "../../../lib/http";
import { resolvePlatformRequest } from "../../../lib/platform-context";

export async function GET(request: NextRequest) {
  const resolved = await resolvePlatformRequest(request);
  if (!resolved || !platformRoleAllows(resolved.context.role, "platform.tenants.read")) return safeJson({ status: "not_found" }, 404);
  return safeJson({ tenants: await resolved.services.platformSupport.listTenants(resolved.context) });
}
