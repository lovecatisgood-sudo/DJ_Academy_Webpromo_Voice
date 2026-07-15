import type { NextRequest } from "next/server";
import { getServices } from "../../../../lib/container";
import { flowbotCorsHeaders, flowbotRequestCredentials } from "../../../../lib/flowbot-http";
import { clientAddress, enforceRateLimit, safeJson } from "../../../../lib/http";

export async function POST(request: NextRequest) {
  const credentials = flowbotRequestCredentials(request);
  if (!credentials) return safeJson({ status: "not_found" }, 404);
  const services = await getServices();
  if (!services.flowbotRuntime) return safeJson({ status: "not_found" }, 404);
  const allowed = await enforceRateLimit("flowbot_install", `${credentials.deploymentKey}:${clientAddress(request)}`, 30, 60_000);
  if (!allowed.allowed) return safeJson({ status: "rate_limited" }, 429, flowbotCorsHeaders(credentials.origin));
  const verified = await services.flowbotRuntime.reportInstall(credentials.deploymentKey, credentials.origin);
  return safeJson({ status: "recorded", verified }, 200, flowbotCorsHeaders(credentials.origin));
}

export { OPTIONS } from "../config/route";
