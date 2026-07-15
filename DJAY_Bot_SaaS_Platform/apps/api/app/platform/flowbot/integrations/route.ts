import { openJson } from "@djay/auth";
import { platformRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { safeJson } from "../../../../lib/http";
import { resolvePlatformRequest } from "../../../../lib/platform-context";

export async function GET(request: NextRequest) {
  const resolved = await resolvePlatformRequest(request);
  if (!resolved || !platformRoleAllows(resolved.context.role, "platform.routing.read")) return safeJson({ status: "not_found" }, 404);
  const key = resolved.services.flowbotIntegrationEnvelopeKey;
  if (!key) return safeJson({ status: "not_available" }, 503);
  const profiles = await resolved.services.platformFlowbotIntegrations.list(resolved.context);
  return safeJson({ integrations: profiles.map(({ endpointCiphertext, ...profile }) => ({
    ...profile, endpoint: openJson<{ url: string }>(endpointCiphertext, key).url,
  })) });
}
