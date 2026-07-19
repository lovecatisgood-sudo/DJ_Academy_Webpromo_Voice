import { tenantRoleAllows } from "@djay/authorization";
import { socialCredentialSchema } from "@djay/channel-adapters";
import type { NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../../lib/http";
import { hasSensitiveTenantAssurance } from "../../../../lib/tenant-assurance";
import { resolveTenantRequest } from "../../../../lib/tenant-context";

const connectionSchema = z.discriminatedUnion("channel", [
  z.object({ channel: z.literal("line"), botId: z.uuid(), name: z.string().trim().min(2).max(160),
    externalAccountRef: z.string().trim().min(3).max(200), channelAccessToken: z.string().min(16).max(4096),
    channelSecret: z.string().min(16).max(4096) }).strict(),
  z.object({ channel: z.literal("messenger"), botId: z.uuid(), name: z.string().trim().min(2).max(160),
    externalAccountRef: z.string().trim().min(3).max(200), pageAccessToken: z.string().min(16).max(4096),
    appSecret: z.string().min(16).max(4096), verifyToken: z.string().min(16).max(4096),
    pageId: z.string().trim().min(3).max(200) }).strict(),
]);

export async function GET(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "flowbot.read")) return safeJson({ status: "not_found" }, 404);
  return safeJson({ connections: await resolved.services.tenantFlowSocial.list(resolved.context) });
}

export async function POST(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "integrations.manage") || !(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  if (!hasSensitiveTenantAssurance(resolved.session)) return safeJson({ status: "reauthentication_required" }, 403);
  if (!resolved.services.flowSocialCredentialKey) return safeJson({ status: "not_available" }, 503);
  try {
    const input = connectionSchema.parse(await readJson(request));
    const credentials = socialCredentialSchema.parse(input.channel === "line"
      ? { channel: "line", channelAccessToken: input.channelAccessToken, channelSecret: input.channelSecret }
      : { channel: "messenger", pageAccessToken: input.pageAccessToken, appSecret: input.appSecret,
        verifyToken: input.verifyToken, pageId: input.pageId });
    const result = await resolved.services.tenantFlowSocial.create(resolved.context, {
      botId: input.botId, channel: input.channel, name: input.name,
      externalAccountRef: input.externalAccountRef, credentials,
      envelopeKey: resolved.services.flowSocialCredentialKey,
    });
    const status = result.status === "created" ? 201 : result.status === "not_entitled" ? 403
      : result.status === "not_found" ? 404 : result.status === "limit_reached" || result.status === "conflict" ? 409 : 422;
    return safeJson(result, status);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400) : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
