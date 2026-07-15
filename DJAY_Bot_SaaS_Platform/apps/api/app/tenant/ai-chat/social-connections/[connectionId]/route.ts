import { tenantRoleAllows } from "@djay/authorization";
import { socialCredentialSchema } from "@djay/channel-adapters";
import { uuidSchema } from "@djay/shared";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../../../lib/http";
import { resolveTenantRequest } from "../../../../../lib/tenant-context";

export async function DELETE(request: NextRequest, route: { params: Promise<{ connectionId: string }> }) {
  const resolved = await resolveTenantRequest(request);
  const connectionId = uuidSchema.safeParse((await route.params).connectionId);
  if (!resolved || !connectionId.success
    || !tenantRoleAllows(resolved.context.role, "ai_chat.channels.manage")
    || !(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  const result = await resolved.services.tenantAiSocial.revoke(resolved.context, connectionId.data);
  return safeJson(result, result.status === "revoked" ? 200 : 404);
}

const lineCredentialRotationSchema = z.object({
  channel: z.literal("line"),
  channelAccessToken: z.string().min(16).max(4096),
  channelSecret: z.string().min(16).max(4096),
}).strict();
const whatsappCredentialRotationSchema = z.object({
  channel: z.literal("whatsapp"), accessToken: z.string().min(16).max(4096),
  appSecret: z.string().min(16).max(4096), verifyToken: z.string().min(16).max(4096),
  phoneNumberId: z.string().trim().min(3).max(200),
  businessAccountId: z.string().trim().min(3).max(200),
}).strict();
const credentialRotationSchema = z.discriminatedUnion("channel", [
  lineCredentialRotationSchema, whatsappCredentialRotationSchema,
]);

export async function PATCH(request: NextRequest, route: { params: Promise<{ connectionId: string }> }) {
  const resolved = await resolveTenantRequest(request);
  const connectionId = uuidSchema.safeParse((await route.params).connectionId);
  if (!resolved || !connectionId.success
    || !tenantRoleAllows(resolved.context.role, "ai_chat.channels.manage")
    || !(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  const envelopeKey = resolved.services.aiSocialCredentialKey;
  if (!envelopeKey) return safeJson({ status: "not_available" }, 503);
  try {
    const input = credentialRotationSchema.parse(await readJson(request));
    const credentials = socialCredentialSchema.parse(input);
    const rotate = input.channel === "line"
      ? resolved.services.tenantAiSocial.rotateLine.bind(resolved.services.tenantAiSocial)
      : resolved.services.tenantAiSocial.rotateWhatsApp.bind(resolved.services.tenantAiSocial);
    const result = await rotate(resolved.context, {
      connectionId: connectionId.data, credentials, envelopeKey,
    });
    return safeJson(result, result.status === "rotated" ? 200 : 404);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400)
      : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
