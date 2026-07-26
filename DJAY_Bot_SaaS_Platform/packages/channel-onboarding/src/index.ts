import {
  lineAutoReplyBlocksBot, LineChannelError,
  type LineBotInfo, type LineChannelClient,
} from "@djay/channel-adapters";
import { z } from "zod";
import type { LineConnectReason, LineConnectStep } from "./messages";

/**
 * @djay/channel-onboarding — mode-agnostic orchestration for attaching a merchant's
 * external account to a bot. This increment implements LINE `assisted_handoff`.
 *
 * Pure and DB-free: persistence arrives as injected callbacks, so the whole flow is
 * unit-testable with no database and no network. House style matches
 * `@djay/meta-connect` and `@djay/channel-adapters`.
 */

export const lineConnectInputSchema = z.object({
  channelId: z.string().trim().min(3).max(200),
  channelSecret: z.string().min(16).max(4096),
}).strict();
export type LineConnectInput = z.infer<typeof lineConnectInputSchema>;

/** Public Official Account identity, shown for confirmation before commit. Never a secret. */
export type LineConnectBot = Readonly<{
  userId: string; basicId: string; displayName: string; pictureUrl: string | null;
  chatMode: LineBotInfo["chatMode"];
}>;

export type LineConnectFailure = Readonly<{
  status: "failed";
  step: LineConnectStep;
  reason: LineConnectReason;
  /** HTTP status LINE reported when probing our webhook, for the reachability message. */
  statusCode: number | null;
  /** True when a connection row was created during this attempt and has been discarded. */
  rolledBack: boolean;
  bot: LineConnectBot | null;
}>;

export type LineConnectSuccess = Readonly<{
  status: "connected";
  connectionId: string;
  webhookKey: string;
  webhookUrl: string;
  bot: LineConnectBot;
}>;

export type LineConnectResult = LineConnectSuccess | LineConnectFailure;

export type LineConnectionCreateResult =
  | Readonly<{ status: "created"; connectionId: string; webhookKey: string }>
  | Readonly<{ status: "conflict" | "not_entitled" | "limit_reached" | "not_found" | "channel_not_admitted" }>;

export type LineConnectDependencies = Readonly<{
  client: Pick<LineChannelClient,
    "mintChannelToken" | "getBotInfo" | "setWebhookEndpoint" | "getWebhookEndpoint" | "testWebhook">;
  /** Build the per-connection public webhook URL from the key the store just minted. */
  webhookUrl: (webhookKey: string) => string;
  createConnection: (input: Readonly<{
    bot: LineConnectBot; channelId: string; channelSecret: string;
  }>) => Promise<LineConnectionCreateResult>;
  /**
   * Undo `createConnection` when a later step fails. Must remove the row entirely (not
   * revoke it), so the merchant can retry the same Official Account immediately.
   */
  discardConnection: (connectionId: string) => Promise<void>;
}>;

function botFrom(info: LineBotInfo): LineConnectBot {
  return {
    userId: info.userId, basicId: info.basicId, displayName: info.displayName,
    pictureUrl: info.pictureUrl ?? null, chatMode: info.chatMode,
  };
}

/** Transport-level LINE failures share one mapping; step-specific reasons are passed in. */
function transportReason(error: unknown, fallback: LineConnectReason): LineConnectReason {
  if (!(error instanceof LineChannelError)) return fallback;
  if (error.code === "line_credentials_invalid" || error.code === "line_authorization_failed") return "invalid_credentials";
  if (error.code === "line_rate_limited") return "line_rate_limited";
  if (error.code === "line_transport_failed") return "line_unreachable";
  return fallback;
}

function fail(
  step: LineConnectStep, reason: LineConnectReason,
  extra?: Readonly<{ statusCode?: number | null; rolledBack?: boolean; bot?: LineConnectBot | null }>,
): LineConnectFailure {
  return {
    status: "failed", step, reason,
    statusCode: extra?.statusCode ?? null,
    rolledBack: extra?.rolledBack ?? false,
    bot: extra?.bot ?? null,
  };
}

/**
 * Two merchant-supplied values in, a proven-working connection out.
 *
 * Ordering note (deliberate, see the design spec): the webhook URL embeds the webhook
 * key, which only exists once the connection row is created — so the row must precede
 * `setWebhookEndpoint`, and LINE's reachability probe only answers 200 for a routable
 * connection. The row is therefore created before the last three checks, and any
 * failure from that point on discards it, so no half-built connection ever persists.
 * Until `setWebhookEndpoint` succeeds, LINE does not know the URL, so the row is not
 * reachable in practice even though it is routable in principle.
 */
export async function connectLineChannel(
  inputValue: LineConnectInput,
  deps: LineConnectDependencies,
): Promise<LineConnectResult> {
  const input = lineConnectInputSchema.parse(inputValue);

  let accessToken: string;
  try {
    accessToken = (await deps.client.mintChannelToken(input)).accessToken;
  } catch (error) {
    return fail("mint", transportReason(error, "invalid_credentials"));
  }

  let info: LineBotInfo;
  try {
    info = await deps.client.getBotInfo(accessToken);
  } catch (error) {
    return fail("bot_info", transportReason(error, "bot_info_unavailable"));
  }
  const bot = botFrom(info);

  // Auto-reply intercepts inbound messages before the bot ever sees them. Refuse to
  // create a connection that would silently never answer.
  if (lineAutoReplyBlocksBot(info)) return fail("auto_reply", "auto_reply_enabled", { bot });

  const created = await deps.createConnection({ bot, channelId: input.channelId, channelSecret: input.channelSecret });
  if (created.status !== "created") {
    const reason: LineConnectReason = created.status === "conflict" ? "already_connected"
      : created.status === "not_entitled" ? "not_entitled"
        : created.status === "limit_reached" ? "limit_reached"
          : created.status === "channel_not_admitted" ? "channel_not_admitted" : "bot_unavailable";
    return fail("create_connection", reason, { bot });
  }

  const webhookUrl = deps.webhookUrl(created.webhookKey);
  const abandon = async (
    step: LineConnectStep, reason: LineConnectReason, statusCode: number | null = null,
  ): Promise<LineConnectFailure> => {
    await deps.discardConnection(created.connectionId);
    return fail(step, reason, { statusCode, rolledBack: true, bot });
  };

  try {
    await deps.client.setWebhookEndpoint(accessToken, webhookUrl);
  } catch (error) {
    return abandon("set_webhook", transportReason(error, "webhook_set_failed"));
  }

  // PUT does not promise to activate the endpoint, so the state is read back rather
  // than assumed.
  try {
    const confirmed = await deps.client.getWebhookEndpoint(accessToken);
    if (!confirmed.active) return await abandon("confirm_webhook", "webhook_inactive");
  } catch (error) {
    return abandon("confirm_webhook", transportReason(error, "webhook_inactive"));
  }

  try {
    const probe = await deps.client.testWebhook(accessToken, webhookUrl);
    // A 2xx is required as well as `success`: LINE reports a reachable-but-failing
    // endpoint as a response too, and that is not a working connection.
    const reachable = probe.success && probe.statusCode !== null
      && probe.statusCode >= 200 && probe.statusCode < 300;
    if (!reachable) return await abandon("test_webhook", "webhook_unreachable", probe.statusCode);
  } catch (error) {
    return abandon("test_webhook", transportReason(error, "webhook_unreachable"));
  }

  return {
    status: "connected", connectionId: created.connectionId,
    webhookKey: created.webhookKey, webhookUrl, bot,
  };
}


export * from "./messages";
