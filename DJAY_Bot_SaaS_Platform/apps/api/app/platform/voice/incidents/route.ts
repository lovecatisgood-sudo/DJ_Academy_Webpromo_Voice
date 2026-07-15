import { platformRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { safeJson } from "../../../../lib/http";
import { resolvePlatformRequest } from "../../../../lib/platform-context";

export async function GET(request: NextRequest) {
  const resolved = await resolvePlatformRequest(request);
  const canRead = resolved && (
    platformRoleAllows(resolved.context.role, "platform.routing.read")
    || platformRoleAllows(resolved.context.role, "platform.billing.read")
  );
  if (!resolved || !canRead) return safeJson({ status: "not_found" }, 404);
  try {
    return safeJson({ incidents: await resolved.services.platformVoiceOperations.getIncidents(resolved.context) });
  } catch {
    return safeJson({ status: "not_found" }, 404);
  }
}
