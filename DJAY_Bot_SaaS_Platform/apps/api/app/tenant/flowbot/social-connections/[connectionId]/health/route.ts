import { tenantRoleAllows } from "@djay/authorization";
import { uuidSchema } from "@djay/shared";
import type { NextRequest } from "next/server";
import { hasTrustedOrigin, safeJson } from "../../../../../../lib/http";
import { inspectLineChannelHealth, safeSocialHealthError } from "../../../../../../lib/social-health";
import { resolveTenantRequest } from "../../../../../../lib/tenant-context";

/**
 * CHN-007 self-test for a FlowBot social connection, mirroring the AI Chat route at
 * `tenant/ai-chat/social-connections/[connectionId]/health` — same auth, same role
 * gate shape, same response shape, same error vocabulary.
 *
 * LINE additionally reports `chatMode` and the webhook `active` flag: a connection can
 * be reachable and still never receive a message, which is the failure merchants hit
 * most and previously had no way to see.
 */
export async function POST(request: NextRequest, route: { params: Promise<{ connectionId: string }> }) {
  const resolved = await resolveTenantRequest(request);
  const connectionId = uuidSchema.safeParse((await route.params).connectionId);
  if (!resolved || !connectionId.success
    || !tenantRoleAllows(resolved.context.role, "integrations.manage")
    || !(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  const envelopeKey = resolved.services.flowSocialCredentialKey;
  if (!envelopeKey) return safeJson({ status: "not_available" }, 503);
  const runtime = await resolved.services.tenantFlowSocial.runtimeCredentials(
    resolved.context, connectionId.data, envelopeKey,
  );
  if (!runtime) return safeJson({ status: "not_found" }, 404);
  try {
    await resolved.services.flowSocialDelivery.health(runtime.channel, runtime.credentials);
    const line = runtime.channel === "line"
      ? await inspectLineChannelHealth(resolved.services.lineChannel, runtime.credentials)
      : null;
    const healthy = line ? line.healthy : true;
    const result = await resolved.services.tenantFlowSocial.recordHealth(resolved.context, {
      connectionId: connectionId.data, healthy,
      reauthorizationRequired: false, safeErrorCode: healthy ? null : "channel_health_failed",
    });
    return safeJson(line ? { ...result, line } : result, 200);
  } catch (error) {
    const safeErrorCode = safeSocialHealthError(error);
    const result = await resolved.services.tenantFlowSocial.recordHealth(resolved.context, {
      connectionId: connectionId.data, healthy: false,
      reauthorizationRequired: safeErrorCode === "credential_reauthorization_required",
      safeErrorCode,
    });
    return safeJson(result, result.status === "checked" ? 200 : 404);
  }
}
