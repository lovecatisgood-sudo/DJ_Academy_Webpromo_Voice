import { tenantRoleAllows } from "@djay/authorization";
import { socialCredentialSchema } from "@djay/channel-adapters";
import { connectLineChannel, lineConnectSteps, type LineConnectReason } from "@djay/channel-onboarding";
import { emitOnboardingStep } from "@djay/shared";
import type { NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../../lib/http";
import { hasSensitiveTenantAssurance } from "../../../../lib/tenant-assurance";
import { resolveTenantRequest } from "../../../../lib/tenant-context";

const connectionSchema = z.discriminatedUnion("channel", [
  z.object({ channel: z.literal("line"), botId: z.uuid(), name: z.string().trim().min(2).max(160),
    // Guided connect derives the account reference from the Official Account's basic ID,
    // so it is only required on the advanced paste-a-token path.
    externalAccountRef: z.string().trim().min(3).max(200).optional(),
    channelId: z.string().trim().min(3).max(200).optional(),
    channelAccessToken: z.string().min(16).max(4096).optional(),
    channelSecret: z.string().min(16).max(4096) }).strict()
    .refine((value) => (value.channelId === undefined) !== (value.channelAccessToken === undefined),
      { error: "supply_either_channel_id_or_channel_access_token" })
    .refine((value) => value.channelId !== undefined || value.externalAccountRef !== undefined,
      { error: "external_account_ref_required" }),
  z.object({ channel: z.literal("messenger"), botId: z.uuid(), name: z.string().trim().min(2).max(160),
    externalAccountRef: z.string().trim().min(3).max(200), pageAccessToken: z.string().min(16).max(4096),
    appSecret: z.string().min(16).max(4096), verifyToken: z.string().min(16).max(4096),
    pageId: z.string().trim().min(3).max(200) }).strict(),
]);

/** Named failures map to specific HTTP semantics; the merchant-facing text is localized client-side. */
const connectFailureStatus: Readonly<Record<LineConnectReason, number>> = {
  invalid_credentials: 422,
  line_unreachable: 503,
  line_rate_limited: 429,
  bot_info_unavailable: 502,
  auto_reply_enabled: 422,
  already_connected: 409,
  not_entitled: 403,
  limit_reached: 409,
  bot_unavailable: 404,
  webhook_set_failed: 502,
  webhook_inactive: 422,
  webhook_unreachable: 422,
  // The included social channel is spent on a different channel (CHN-004).
  channel_not_admitted: 409,
};

export async function GET(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "flowbot.read")) return safeJson({ status: "not_found" }, 404);
  return safeJson({ connections: await resolved.services.tenantFlowSocial.list(resolved.context) });
}

export async function POST(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "integrations.manage") || !(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  if (!hasSensitiveTenantAssurance(resolved.session)) return safeJson({ status: "reauthentication_required" }, 403);
  const envelopeKey = resolved.services.flowSocialCredentialKey;
  if (!envelopeKey) return safeJson({ status: "not_available" }, 503);
  try {
    const input = connectionSchema.parse(await readJson(request));

    // Guided path: the merchant supplied Channel ID + Channel Secret only, so the
    // platform mints tokens, configures the webhook, and proves LINE can reach us.
    if (input.channel === "line" && input.channelId !== undefined) {
      const channelId = input.channelId;
      const apiOrigin = resolved.services.apiAppUrl;
      // Without our own public origin we cannot hand LINE a webhook URL, and trusting
      // the request Host header would let a caller point LINE somewhere else.
      if (!apiOrigin) return safeJson({ status: "not_available" }, 503);
      const result = await connectLineChannel(
        { channelId, channelSecret: input.channelSecret },
        {
          client: resolved.services.lineChannel,
          webhookUrl: (webhookKey) => new URL(`/public/flowbot/social/line/${webhookKey}`, apiOrigin).toString(),
          createConnection: async ({ bot }) => {
            const created = await resolved.services.tenantFlowSocial.create(resolved.context, {
              botId: input.botId, channel: "line", name: input.name,
              externalAccountRef: input.externalAccountRef ?? bot.basicId,
              credentials: socialCredentialSchema.parse({
                channel: "line", channelId, channelSecret: input.channelSecret,
              }),
              envelopeKey,
            });
            return created.status === "created"
              ? { status: "created" as const, connectionId: created.connectionId, webhookKey: created.webhookKey }
              : { status: created.status };
          },
          discardConnection: async (connectionId) => {
            await resolved.services.tenantFlowSocial.discardUnverified(resolved.context, connectionId);
          },
        },
      );
      // Onboarding SLO: every step up to the failure counts as succeeded, so completion
      // rate and the step merchants actually get stuck on are both measurable. No
      // identifiers, no credentials - only the step name and outcome.
      const reachedIndex = result.status === "connected"
        ? lineConnectSteps.length : lineConnectSteps.indexOf(result.step);
      for (const [index, step] of lineConnectSteps.entries()) {
        if (index > reachedIndex) break;
        const failedHere = result.status === "failed" && index === reachedIndex;
        emitOnboardingStep({
          product: "flowbot", channel: "line", step,
          outcome: failedHere ? "failed" : "succeeded",
          reason: failedHere ? result.reason : null,
        });
      }
      return result.status === "connected"
        ? safeJson({ status: "created", connectionId: result.connectionId, webhookKey: result.webhookKey,
          webhookUrl: result.webhookUrl, bot: result.bot }, 201)
        : safeJson({ status: "connect_failed", step: result.step, reason: result.reason,
          statusCode: result.statusCode, rolledBack: result.rolledBack, bot: result.bot },
        connectFailureStatus[result.reason]);
    }

    const credentials = socialCredentialSchema.parse(input.channel === "line"
      ? { channel: "line", channelAccessToken: input.channelAccessToken, channelSecret: input.channelSecret }
      : { channel: "messenger", pageAccessToken: input.pageAccessToken, appSecret: input.appSecret,
        verifyToken: input.verifyToken, pageId: input.pageId });
    const externalAccountRef = input.externalAccountRef;
    if (externalAccountRef === undefined) return safeJson({ status: "validation_failed" }, 400);
    const result = await resolved.services.tenantFlowSocial.create(resolved.context, {
      botId: input.botId, channel: input.channel, name: input.name,
      externalAccountRef, credentials, envelopeKey,
    });
    const status = result.status === "created" ? 201 : result.status === "not_entitled" ? 403
      : result.status === "not_found" ? 404
        : result.status === "limit_reached" || result.status === "conflict"
          || result.status === "channel_not_admitted" ? 409 : 422;
    return safeJson(result, status);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400) : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
