import { tenantRoleAllows } from "@djay/authorization";
import { socialCredentialSchema } from "@djay/channel-adapters";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../../lib/http";
import { resolveTenantRequest } from "../../../../lib/tenant-context";

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
const socialConnectionSchema = z.discriminatedUnion("channel", [lineConnectionSchema, whatsappConnectionSchema]);

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
  const envelopeKey = resolved.services.aiSocialCredentialKey;
  if (!envelopeKey) return safeJson({ status: "not_available" }, 503);
  try {
    const input = socialConnectionSchema.parse(await readJson(request));
    const credentials = socialCredentialSchema.parse(input.channel === "line"
      ? { channel: "line", channelAccessToken: input.channelAccessToken, channelSecret: input.channelSecret }
      : { channel: "whatsapp", accessToken: input.accessToken, appSecret: input.appSecret,
        verifyToken: input.verifyToken, phoneNumberId: input.phoneNumberId,
        businessAccountId: input.businessAccountId });
    const create = input.channel === "line"
      ? resolved.services.tenantAiSocial.createLine.bind(resolved.services.tenantAiSocial)
      : resolved.services.tenantAiSocial.createWhatsApp.bind(resolved.services.tenantAiSocial);
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
      : result.status === "limit_reached" || result.status === "conflict" ? 409 : 422;
    return safeJson(result, status);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400)
      : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
