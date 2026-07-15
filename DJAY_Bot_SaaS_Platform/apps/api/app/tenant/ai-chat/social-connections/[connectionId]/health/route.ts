import { tenantRoleAllows } from "@djay/authorization";
import { uuidSchema } from "@djay/shared";
import type { NextRequest } from "next/server";
import { hasTrustedOrigin, safeJson } from "../../../../../../lib/http";
import { resolveTenantRequest } from "../../../../../../lib/tenant-context";

function safeHealthError(error: unknown) {
  const code = error instanceof Error ? error.message : "channel_health_failed";
  return ["credential_reauthorization_required", "channel_rate_limited", "channel_delivery_failed"].includes(code)
    ? code : "channel_health_failed";
}

export async function POST(request: NextRequest, route: { params: Promise<{ connectionId: string }> }) {
  const resolved = await resolveTenantRequest(request);
  const connectionId = uuidSchema.safeParse((await route.params).connectionId);
  if (!resolved || !connectionId.success
    || !tenantRoleAllows(resolved.context.role, "ai_chat.channels.manage")
    || !(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  const envelopeKey = resolved.services.aiSocialCredentialKey;
  if (!envelopeKey) return safeJson({ status: "not_available" }, 503);
  const runtime = await resolved.services.tenantAiSocial.runtimeCredentials(
    resolved.context, connectionId.data, envelopeKey,
  );
  if (!runtime) return safeJson({ status: "not_found" }, 404);
  try {
    await resolved.services.aiSocialDelivery.health(runtime.channel, runtime.credentials);
    const result = await resolved.services.tenantAiSocial.recordHealth(resolved.context, {
      connectionId: connectionId.data, healthy: true,
      reauthorizationRequired: false, safeErrorCode: null,
    });
    return safeJson(result, 200);
  } catch (error) {
    const safeErrorCode = safeHealthError(error);
    const result = await resolved.services.tenantAiSocial.recordHealth(resolved.context, {
      connectionId: connectionId.data, healthy: false,
      reauthorizationRequired: safeErrorCode === "credential_reauthorization_required",
      safeErrorCode,
    });
    return safeJson(result, result.status === "checked" ? 200 : 404);
  }
}
