import {
  lineAutoReplyBlocksBot, LineChannelError, socialErrorFromLine,
  type LineBotInfo, type LineChannelClient, type LineWebhookEndpoint,
} from "@djay/channel-adapters";

/**
 * Shared social channel-health vocabulary (CHN-007).
 *
 * The route boundary exposes exactly the codes the AI Chat health route already
 * emits — the delivery client's own vocabulary plus its `channel_health_failed`
 * fallback. LINE prerequisite findings are reported as structured booleans, never
 * as new error codes, so operator and merchant surfaces stay on one contract.
 */
export const socialHealthErrorCodes = [
  "credential_reauthorization_required",
  "channel_rate_limited",
  "channel_delivery_failed",
  "channel_health_failed",
] as const;
export type SocialHealthErrorCode = (typeof socialHealthErrorCodes)[number];

export function safeSocialHealthError(error: unknown): SocialHealthErrorCode {
  // LINE client failures are translated through the delivery client's own mapping so
  // there is a single definition of "this credential needs reauthorizing".
  const code = error instanceof LineChannelError
    ? socialErrorFromLine(error).message
    : error instanceof Error ? error.message : "channel_health_failed";
  return code === "credential_reauthorization_required" || code === "channel_rate_limited"
    || code === "channel_delivery_failed" ? code : "channel_health_failed";
}

/**
 * A LINE connection can be perfectly reachable and still never see a message:
 * `chatMode: "chat"` means the merchant's OA auto-reply intercepts inbound messages
 * before the bot, and an inactive webhook means LINE never calls us at all. Both are
 * the most common real-world failures, so both are reported explicitly.
 */
export type LineChannelHealth = Readonly<{
  healthy: boolean;
  chatMode: LineBotInfo["chatMode"];
  autoReplyBlocksBot: boolean;
  webhookConfigured: boolean;
  webhookEndpointActive: boolean;
  displayName: string;
  basicId: string;
}>;

export function evaluateLineChannelHealth(
  info: LineBotInfo,
  webhook: LineWebhookEndpoint | null,
): LineChannelHealth {
  const autoReplyBlocksBot = lineAutoReplyBlocksBot(info);
  const webhookEndpointActive = webhook?.active === true;
  return {
    healthy: !autoReplyBlocksBot && webhookEndpointActive,
    chatMode: info.chatMode,
    autoReplyBlocksBot,
    webhookConfigured: webhook !== null,
    webhookEndpointActive,
    displayName: info.displayName,
    basicId: info.basicId,
  };
}

/** Reachability + prerequisite inspection for one LINE connection. */
export async function inspectLineChannelHealth(
  client: LineChannelClient,
  credentials: unknown,
): Promise<LineChannelHealth> {
  const accessToken = await client.resolveAccessToken(credentials);
  const info = await client.getBotInfo(accessToken);
  let webhook: LineWebhookEndpoint | null = null;
  try {
    webhook = await client.getWebhookEndpoint(accessToken);
  } catch (error) {
    // 404 is "no webhook endpoint has ever been set" — a reportable finding, not a fault.
    if (!(error instanceof LineChannelError) || error.status !== 404) throw error;
  }
  return evaluateLineChannelHealth(info, webhook);
}
