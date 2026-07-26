import { tenantRoleAllows } from "@djay/authorization";
import { socialCredentialSchema } from "@djay/channel-adapters";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../../lib/http";
import { resolveTenantRequest } from "../../../../lib/tenant-context";
import { hasSensitiveTenantAssurance } from "../../../../lib/tenant-assurance";

const lineConnectionSchema = z.object({
  channel: z.literal("line"),
  agentId: z.uuid(),
  name: z.string().trim().min(2).max(160),
  externalAccountRef: z.string().trim().min(3).max(200),
  channelAccessToken: z.string().min(16).max(4096),
  channelSecret: z.string().min(16).max(4096),
}).strict();
const whatsappConnectionSchema = z.object({
  channel: z.literal("whatsapp"), agentId: z.uuid(),
  name: z.string().trim().min(2).max(160),
  externalAccountRef: z.string().trim().min(3).max(200),
  accessToken: z.string().min(16).max(4096), appSecret: z.string().min(16).max(4096),
  verifyToken: z.string().min(16).max(4096), phoneNumberId: z.string().trim().min(3).max(200),
  businessAccountId: z.string().trim().min(3).max(200),
}).strict();
const messengerConnectionSchema = z.object({
  channel: z.literal("messenger"), agentId: z.uuid(),
  name: z.string().trim().min(2).max(160),
  externalAccountRef: z.string().trim().min(3).max(200),
  pageAccessToken: z.string().min(16).max(4096), appSecret: z.string().min(16).max(4096),
  verifyToken: z.string().min(16).max(4096), pageId: z.string().trim().min(3).max(200),
}).strict();
const socialConnectionSchema = z.discriminatedUnion("channel", [
  lineConnectionSchema, whatsappConnectionSchema, messengerConnectionSchema,
]);

export async function GET(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "ai_chat.read")) {
    return safeJson({ status: "not_found" }, 404);
  }
  return safeJson({ connections: await resolved.services.tenantAiSocial.list(resolved.context) });
}

export async function POST(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "ai_chat.channels.manage")
    || !(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  if (!hasSensitiveTenantAssurance(resolved.session)) return safeJson({ status: "reauthentication_required" }, 403);
  const envelopeKey = resolved.services.aiSocialCredentialKey;
  if (!envelopeKey) return safeJson({ status: "not_available" }, 503);
  try {
    const input = socialConnectionSchema.parse(await readJson(request));
    const credentials = socialCredentialSchema.parse(input.channel === "line"
      ? { channel: "line", channelAccessToken: input.channelAccessToken, channelSecret: input.channelSecret }
      : input.channel === "whatsapp" ? { channel: "whatsapp", accessToken: input.accessToken, appSecret: input.appSecret,
        verifyToken: input.verifyToken, phoneNumberId: input.phoneNumberId,
        businessAccountId: input.businessAccountId }
      : { channel: "messenger", pageAccessToken: input.pageAccessToken,
        appSecret: input.appSecret, verifyToken: input.verifyToken, pageId: input.pageId });
    const create = input.channel === "line"
      ? resolved.services.tenantAiSocial.createLine.bind(resolved.services.tenantAiSocial)
      : input.channel === "whatsapp"
        ? resolved.services.tenantAiSocial.createWhatsApp.bind(resolved.services.tenantAiSocial)
        : resolved.services.tenantAiSocial.createMessenger.bind(resolved.services.tenantAiSocial);
    const result = await create(resolved.context, {
      agentId: input.agentId,
      name: input.name,
      externalAccountRef: input.externalAccountRef,
      credentials,
      envelopeKey,
    });
    const status = result.status === "created" ? 201
      : result.status === "not_entitled" ? 403
      : result.status === "not_found" ? 404
      : result.status === "limit_reached" || result.status === "conflict"
        || result.status === "channel_not_admitted" ? 409 : 422;
    return safeJson(result, status);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400)
      : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
