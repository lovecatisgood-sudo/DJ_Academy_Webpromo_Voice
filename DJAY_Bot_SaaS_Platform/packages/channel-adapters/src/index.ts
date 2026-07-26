import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const socialChannels = ["line", "whatsapp", "messenger"] as const;
export type SocialChannel = (typeof socialChannels)[number];

const commonSecret = z.string().min(16).max(4096);
/** LINE Channel ID — an identifier, not a secret; visible in OA Manager -> Settings -> Messaging API. */
const lineChannelIdSchema = z.string().trim().min(3).max(200);
export const socialCredentialSchema = z.discriminatedUnion("channel", [
  z.object({
    channel: z.literal("line"),
    channelSecret: commonSecret,
    /** Preferred: the platform mints short-lived channel access tokens itself (see `mintLineChannelToken`). */
    channelId: lineChannelIdSchema.optional(),
    /** Advanced fallback: a long-lived token the merchant issued in the LINE Developers Console. */
    channelAccessToken: commonSecret.optional(),
  }).strict().refine(
    (value) => (value.channelId === undefined) !== (value.channelAccessToken === undefined),
    { error: "line_credentials_require_channel_id_or_access_token" },
  ),
  z.object({
    channel: z.literal("whatsapp"), accessToken: commonSecret, appSecret: commonSecret,
    verifyToken: commonSecret, phoneNumberId: z.string().min(3).max(200),
    businessAccountId: z.string().min(3).max(200),
  }).strict(),
  z.object({
    channel: z.literal("messenger"), pageAccessToken: commonSecret, appSecret: commonSecret,
    verifyToken: commonSecret, pageId: z.string().min(3).max(200),
  }).strict(),
]);
export type SocialCredentials = z.infer<typeof socialCredentialSchema>;

export type NormalizedSocialEvent = Readonly<{
  eventType: "inbound.message" | "delivery.status" | "subject.opt_out";
  externalEventId: string;
  externalMessageId: string | null;
  externalSubject: string;
  occurredAt: Date;
  text: string | null;
  replyToken: string | null;
  deliveryStatus: "sent" | "delivered" | "read" | "failed" | null;
}>;

function safeEqual(left: Buffer, right: Buffer) {
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifySocialSignature(
  channel: SocialChannel,
  rawBody: Uint8Array,
  signature: string | null,
  credentialsValue: unknown,
) {
  const credentials = socialCredentialSchema.parse(credentialsValue);
  if (credentials.channel !== channel || !signature) return false;
  const secret = credentials.channel === "line" ? credentials.channelSecret : credentials.appSecret;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  try {
    const received = channel === "line"
      ? Buffer.from(signature, "base64")
      : signature.startsWith("sha256=") ? Buffer.from(signature.slice(7), "hex") : Buffer.alloc(0);
    return safeEqual(expected, received);
  } catch { return false; }
}

export function verifySocialChallenge(
  channel: SocialChannel,
  mode: string | null,
  verifyToken: string | null,
  challenge: string | null,
  credentialsValue: unknown,
) {
  if (channel === "line" || mode !== "subscribe" || !verifyToken || !challenge) return null;
  const credentials = socialCredentialSchema.parse(credentialsValue);
  if (credentials.channel !== channel || !("verifyToken" in credentials)) return null;
  return safeEqual(Buffer.from(credentials.verifyToken), Buffer.from(verifyToken)) ? challenge : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function text(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function identifier(value: unknown) {
  const result = text(value); return result && result.length <= 500 ? result : null;
}
function epoch(value: unknown, multiplier = 1) {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  const date = new Date(numeric * multiplier); return Number.isFinite(date.getTime()) ? date : new Date(0);
}

function normalizeLine(payload: unknown): NormalizedSocialEvent[] {
  const root = record(payload); const result: NormalizedSocialEvent[] = [];
  for (const raw of array(root?.events)) {
    const event = record(raw); if (!event) continue;
    const source = record(event.source); const message = record(event.message);
    const subject = identifier(source?.userId) ?? identifier(source?.groupId) ?? identifier(source?.roomId);
    const eventId = identifier(event?.webhookEventId); if (!subject || !eventId) continue;
    if (event?.type === "unfollow") {
      result.push({ eventType: "subject.opt_out", externalEventId: eventId, externalMessageId: null,
        externalSubject: subject, occurredAt: epoch(event.timestamp), text: null, replyToken: null, deliveryStatus: null });
      continue;
    }
    const postback = record(event?.postback);
    const body = event?.type === "message" && message?.type === "text" ? text(message.text)
      : event?.type === "postback" ? text(postback?.data) : null;
    if (!body) continue;
    result.push({ eventType: "inbound.message", externalEventId: eventId,
      externalMessageId: identifier(message?.id), externalSubject: subject,
      occurredAt: epoch(event.timestamp), text: body, replyToken: identifier(event?.replyToken), deliveryStatus: null });
  }
  return result;
}

function whatsappMessageText(message: Record<string, unknown>) {
  if (message.type === "text") return text(record(message.text)?.body);
  if (message.type === "button") return text(record(message.button)?.text) ?? text(record(message.button)?.payload);
  if (message.type === "interactive") {
    const interactive = record(message.interactive);
    return text(record(interactive?.button_reply)?.title) ?? text(record(interactive?.list_reply)?.title);
  }
  return null;
}

function normalizeWhatsApp(payload: unknown): NormalizedSocialEvent[] {
  const root = record(payload); const result: NormalizedSocialEvent[] = [];
  for (const rawEntry of array(root?.entry)) for (const rawChange of array(record(rawEntry)?.changes)) {
    const value = record(record(rawChange)?.value);
    for (const rawMessage of array(value?.messages)) {
      const message = record(rawMessage); if (!message) continue;
      const subject = identifier(message.from); const messageId = identifier(message.id); const body = whatsappMessageText(message);
      if (!subject || !messageId || !body) continue;
      result.push({ eventType: "inbound.message", externalEventId: messageId, externalMessageId: messageId,
        externalSubject: subject, occurredAt: epoch(message.timestamp, 1000), text: body,
        replyToken: null, deliveryStatus: null });
    }
    for (const rawStatus of array(value?.statuses)) {
      const status = record(rawStatus); if (!status) continue;
      const subject = identifier(status.recipient_id); const messageId = identifier(status.id);
      const state = status.status === "sent" || status.status === "delivered" || status.status === "read" || status.status === "failed"
        ? status.status : null;
      if (!subject || !messageId || !state) continue;
      result.push({ eventType: "delivery.status", externalEventId: `${messageId}:${state}:${String(status.timestamp ?? "")}`,
        externalMessageId: messageId, externalSubject: subject, occurredAt: epoch(status.timestamp, 1000),
        text: null, replyToken: null, deliveryStatus: state });
    }
  }
  return result;
}

function normalizeMessenger(payload: unknown): NormalizedSocialEvent[] {
  const root = record(payload); const result: NormalizedSocialEvent[] = [];
  for (const rawEntry of array(root?.entry)) for (const rawMessaging of array(record(rawEntry)?.messaging)) {
    const event = record(rawMessaging); if (!event) continue;
    const subject = identifier(record(event.sender)?.id); if (!subject) continue;
    const message = record(event.message); const postback = record(event.postback);
    const body = text(message?.text) ?? text(postback?.payload); const messageId = identifier(message?.mid);
    if (body && (messageId || postback)) {
      const id = messageId ?? `postback:${String(event.timestamp)}:${createHmac("sha256", subject).update(body).digest("hex")}`;
      result.push({ eventType: "inbound.message", externalEventId: id, externalMessageId: messageId,
        externalSubject: subject, occurredAt: epoch(event.timestamp), text: body, replyToken: null, deliveryStatus: null });
    }
    const delivery = record(event.delivery);
    for (const mid of array(delivery?.mids)) if (identifier(mid)) result.push({
      eventType: "delivery.status", externalEventId: `${String(mid)}:delivered:${String(delivery?.watermark ?? "")}`,
      externalMessageId: String(mid), externalSubject: subject, occurredAt: epoch(delivery?.watermark),
      text: null, replyToken: null, deliveryStatus: "delivered",
    });
    const read = record(event.read);
    if (read?.watermark) result.push({ eventType: "delivery.status",
      externalEventId: `read:${subject}:${String(read.watermark)}`, externalMessageId: null,
      externalSubject: subject, occurredAt: epoch(read.watermark), text: null, replyToken: null, deliveryStatus: "read" });
  }
  return result;
}

export function normalizeSocialWebhook(channel: SocialChannel, payload: unknown) {
  return channel === "line" ? normalizeLine(payload)
    : channel === "whatsapp" ? normalizeWhatsApp(payload) : normalizeMessenger(payload);
}

function splitText(value: string, maximum: number) {
  const source = value.trim(); const chunks: string[] = [];
  for (let offset = 0; offset < source.length;) {
    let end = Math.min(offset + maximum, source.length);
    if (end < source.length) {
      const boundary = source.lastIndexOf(" ", end); if (boundary > offset + Math.floor(maximum / 2)) end = boundary;
    }
    chunks.push(source.slice(offset, end).trim()); offset = end; while (source[offset] === " ") offset += 1;
  }
  return chunks.filter(Boolean);
}

export type SocialRenderInput = Readonly<{
  recipient: string; text: string; quickReplies: readonly (string | Readonly<{ label: string; payload: string }>)[]; replyToken?: string | null;
}>;

function socialChoice(value: SocialRenderInput["quickReplies"][number]) {
  return typeof value === "string" ? { label: value, payload: value } : value;
}

export type StructuredFlowMessage = Readonly<{
  type: "text" | "media" | "card" | "carousel" | "actions" | "options" | "form" | "system";
  content: Readonly<Record<string, unknown>>;
}>;

function flowActionLines(value: unknown) {
  return array(value).flatMap((item) => {
    const action = record(item); const label = text(action?.label); const url = text(action?.url);
    return label && url ? [`${label}: ${url}`] : [];
  });
}

function flowCardLines(value: unknown) {
  const card = record(value); if (!card) return [];
  return [text(card.title), text(card.description), text(card.priceLabel), ...flowActionLines(card.actions)].filter((item): item is string => Boolean(item));
}

export function flowMessagesToSocialReplyInput(input: Readonly<{
  recipient: string; messages: readonly StructuredFlowMessage[]; replyToken?: string | null;
}>): SocialRenderInput {
  const lines: string[] = []; let quickReplies: Array<string | { label: string; payload: string }> = [];
  for (const message of input.messages) {
    if (message.type === "text" || message.type === "system") {
      const value = text(message.content.text); if (value) lines.push(value);
    } else if (message.type === "media") {
      const label = text(message.content.label); const url = text(message.content.assetRef);
      if (label) lines.push(label); if (url) lines.push(url);
    } else if (message.type === "card") {
      lines.push(...flowCardLines(message.content));
    } else if (message.type === "carousel") {
      for (const card of array(message.content.cards)) lines.push(...flowCardLines(card));
    } else if (message.type === "actions") {
      const prompt = text(message.content.text); if (prompt) lines.push(prompt);
      lines.push(...flowActionLines(message.content.actions));
    } else if (message.type === "options") {
      const prompt = text(message.content.text); if (prompt) lines.push(prompt);
      quickReplies = array(message.content.options).flatMap((item) => {
        const option = record(item); const id = identifier(option?.id); const label = text(option?.label);
        return id && label ? [{ label, payload: `djay_option:${id}` }] : [];
      });
    } else if (message.type === "form") {
      const prompt = text(message.content.text); if (prompt) lines.push(prompt);
    }
  }
  if (!lines.length && !quickReplies.length) throw new Error("empty_flow_social_reply");
  return { recipient: input.recipient, text: lines.join("\n\n") || "Please choose an option.", quickReplies, ...(input.replyToken !== undefined ? { replyToken: input.replyToken } : {}) };
}

export function renderSocialReply(channel: SocialChannel, input: SocialRenderInput) {
  if (!input.recipient || !input.text.trim()) throw new Error("invalid_social_reply");
  const maximum = channel === "line" ? 5000 : channel === "whatsapp" ? 4096 : 2000;
  const chunks = splitText(input.text, maximum);
  if (channel === "line") return {
    endpoint: input.replyToken ? "reply" as const : "push" as const,
    body: input.replyToken ? { replyToken: input.replyToken, messages: chunks.map((value, index) => ({
      type: "text", text: value, ...(index === chunks.length - 1 && input.quickReplies.length ? { quickReply: { items: input.quickReplies.slice(0, 13).map((value) => { const choice = socialChoice(value); return { type: "action", action: { type: "message", label: choice.label.slice(0, 20), text: choice.payload.slice(0, 300) } }; }) } } : {}),
    })) } : { to: input.recipient, messages: chunks.map((value) => ({ type: "text", text: value })) },
  };
  if (channel === "whatsapp") {
    const final = chunks.at(-1)!; const prefix = chunks.slice(0, -1).map((body) => ({ type: "text", text: { body } }));
    const last = input.quickReplies.length ? { type: "interactive", interactive: { type: "button", body: { text: final }, action: { buttons: input.quickReplies.slice(0, 3).map((value, index) => { const choice = socialChoice(value); return { type: "reply", reply: { id: choice.payload.slice(0, 256) || `choice_${index + 1}`, title: choice.label.slice(0, 20) } }; }) } } } : { type: "text", text: { body: final } };
    return { endpoint: "messages" as const, bodies: [...prefix, last].map((message) => ({ messaging_product: "whatsapp", recipient_type: "individual", to: input.recipient, ...message })) };
  }
  return { endpoint: "messages" as const, bodies: chunks.map((value, index) => ({
    recipient: { id: input.recipient }, messaging_type: "RESPONSE", message: {
      text: value, ...(index === chunks.length - 1 && input.quickReplies.length ? { quick_replies: input.quickReplies.slice(0, 13).map((value) => { const choice = socialChoice(value); return { content_type: "text", title: choice.label.slice(0, 20), payload: choice.payload.slice(0, 1000) }; }) } : {}),
    },
  })) };
}

export function resumeSocialReply(
  rendered: ReturnType<typeof renderSocialReply>,
  deliveredPartCount: number,
): ReturnType<typeof renderSocialReply> {
  if (!Number.isInteger(deliveredPartCount) || deliveredPartCount < 0) {
    throw new Error("invalid_social_delivery_progress");
  }
  if ("body" in rendered && rendered.body) {
    if (deliveredPartCount !== 0) throw new Error("invalid_social_delivery_progress");
    return rendered;
  }
  if (!("bodies" in rendered) || !rendered.bodies || deliveredPartCount >= rendered.bodies.length) {
    throw new Error("invalid_social_delivery_progress");
  }
  return { endpoint: rendered.endpoint, bodies: rendered.bodies.slice(deliveredPartCount) } as ReturnType<typeof renderSocialReply>;
}

export type SocialDeliveryResult = Readonly<{
  externalMessageIds: readonly string[];
  deliveredCount: number;
}>;

export class SocialDeliveryError extends Error {
  constructor(
    message: string,
    readonly attemptedCount: number,
    readonly deliveredCount: number,
    readonly externalMessageIds: readonly string[],
  ) {
    super(message);
    this.name = "SocialDeliveryError";
  }
}

// ---- LINE channel authority: server-side token minting + channel operations ----

/**
 * The merchant supplies only Channel ID + Channel Secret, both visible in LINE OA
 * Manager -> Settings -> Messaging API. The platform mints channel access tokens
 * itself, so the merchant never opens the LINE Developers Console, never needs a
 * Developers Console Admin role, and no long-lived token is ever persisted.
 *
 * Pure, DB-free, fetch-injectable, Zod-validated at the boundary, HTTPS enforced at
 * construction, explicit timeouts — same house style as `@djay/meta-connect`.
 */

const LINE_API_BASE_URL = "https://api.line.me/";
/** Re-mint at least this long before a token actually expires. */
const LINE_TOKEN_SAFETY_MS = 60_000;
const LINE_WEBHOOK_ENDPOINT_MAX_LENGTH = 500;

export const lineErrorCodes = [
  "line_https_required",
  "line_credentials_invalid",
  "line_authorization_failed",
  "line_rate_limited",
  "line_request_failed",
  "line_response_invalid",
  "line_transport_failed",
  "line_webhook_endpoint_invalid",
] as const;
export type LineErrorCode = (typeof lineErrorCodes)[number];

/** Typed failure so callers can map each cause to a specific merchant-facing message. */
export class LineChannelError extends Error {
  constructor(readonly code: LineErrorCode, readonly status: number | null = null) {
    super(code);
    this.name = "LineChannelError";
  }
}

const lineMintInputSchema = z.object({ channelId: lineChannelIdSchema, channelSecret: commonSecret }).strict();
export type LineMintInput = z.infer<typeof lineMintInputSchema>;

const lineTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
});
export type LineChannelToken = Readonly<{ accessToken: string; expiresIn: number }>;

export const lineBotInfoSchema = z.object({
  userId: z.string().min(1),
  basicId: z.string().min(1),
  premiumId: z.string().min(1).optional(),
  displayName: z.string().min(1),
  pictureUrl: z.string().min(1).optional(),
  /** `chat` = the merchant's OA auto-reply intercepts messages before the bot sees them. */
  chatMode: z.enum(["chat", "bot"]),
  markAsReadMode: z.enum(["auto", "manual"]),
});
export type LineBotInfo = z.infer<typeof lineBotInfoSchema>;

/** A distinct, nameable prerequisite failure — never conflate this with a transport error. */
export function lineAutoReplyBlocksBot(info: Readonly<Pick<LineBotInfo, "chatMode">>) {
  return info.chatMode === "chat";
}

export const lineWebhookEndpointSchema = z.object({ endpoint: z.string().min(1), active: z.boolean() });
export type LineWebhookEndpoint = z.infer<typeof lineWebhookEndpointSchema>;

const lineWebhookTestResponseSchema = z.object({
  success: z.boolean().optional(),
  timestamp: z.string().optional(),
  statusCode: z.number().int().optional(),
  reason: z.string().optional(),
  detail: z.string().optional(),
});
/** `statusCode` is 0 or negative when LINE received no response at all. */
export type LineWebhookTestResult = Readonly<{
  success: boolean; timestamp: string | null; statusCode: number | null; reason: string | null; detail: string | null;
}>;

export type LineTokenCacheEntry = Readonly<{ accessToken: string; expiresAtMs: number }>;
export type LineTokenCache = Readonly<{
  get(key: string): LineTokenCacheEntry | undefined;
  set(key: string, entry: LineTokenCacheEntry): void;
  delete(key: string): void;
  clear(): void;
}>;

/** Upper bound on cached channels per process; oldest insert is evicted first. */
const LINE_TOKEN_CACHE_MAX_ENTRIES = 5_000;

/**
 * In-process only. Minted tokens must never be persisted.
 *
 * Deliberately time-free: the owning client holds the authoritative clock (injectable
 * for tests), and a second clock in here would disagree with it. The client deletes
 * stale entries; this cache only bounds its own size, evicting the oldest insertion
 * once over the cap. Without that bound it would grow monotonically with the number of
 * connected LINE channels in a long-lived worker and never shrink.
 */
export function createLineTokenCache(): LineTokenCache {
  const store = new Map<string, LineTokenCacheEntry>();
  return {
    get: (key) => store.get(key),
    set: (key, entry) => {
      store.delete(key);
      store.set(key, entry);
      while (store.size > LINE_TOKEN_CACHE_MAX_ENTRIES) {
        const oldest = store.keys().next();
        if (oldest.done) break;
        store.delete(oldest.value);
      }
    },
    delete: (key) => { store.delete(key); },
    clear: () => { store.clear(); },
  };
}

/**
 * In-flight mint coalescing, scoped to whichever cache is in use.
 *
 * A burst of inbound events for one channel would otherwise fire one token mint per
 * event against LINE's rate-limited token endpoint, producing 429s and missed replies
 * (see the reply-window SLO). Concurrent callers share one request instead.
 */
const lineMintsInFlight = new WeakMap<LineTokenCache, Map<string, Promise<LineChannelToken>>>();

function inFlightMints(cache: LineTokenCache) {
  let pending = lineMintsInFlight.get(cache);
  if (!pending) { pending = new Map(); lineMintsInFlight.set(cache, pending); }
  return pending;
}

const sharedLineTokenCache = createLineTokenCache();
/** Drop every cached minted token (credential rotation, tests). */
export function clearLineTokenCache() { sharedLineTokenCache.clear(); }

/** Bind the cache to both halves of the credential without ever storing the secret itself. */
function lineTokenCacheKey(input: LineMintInput) {
  return createHmac("sha256", input.channelSecret).update(input.channelId).digest("base64url");
}

export type LineChannelClientConfig = Readonly<{
  apiBaseUrl?: string; timeoutMs?: number; fetchImpl?: typeof fetch;
  cache?: LineTokenCache; now?: () => number;
}>;

function lineMintErrorCode(status: number): LineErrorCode {
  if (status === 400 || status === 401 || status === 403) return "line_credentials_invalid";
  return status === 429 ? "line_rate_limited" : "line_request_failed";
}

function lineChannelErrorCode(status: number): LineErrorCode {
  if (status === 401 || status === 403) return "line_authorization_failed";
  return status === 429 ? "line_rate_limited" : "line_request_failed";
}

function lineWebhookEndpointBody(endpoint: string) {
  const value = endpoint.trim();
  if (!value || value.length > LINE_WEBHOOK_ENDPOINT_MAX_LENGTH) throw new LineChannelError("line_webhook_endpoint_invalid");
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new LineChannelError("line_webhook_endpoint_invalid"); }
  if (parsed.protocol !== "https:") throw new LineChannelError("line_webhook_endpoint_invalid");
  return value;
}

export function createLineChannelClient(config: LineChannelClientConfig = {}) {
  const raw = config.apiBaseUrl ?? LINE_API_BASE_URL;
  const base = new URL(raw.endsWith("/") ? raw : `${raw}/`);
  if (base.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(base.hostname)) throw new LineChannelError("line_https_required");
  const fetchImpl = config.fetchImpl ?? fetch;
  const timeout = config.timeoutMs ?? 15_000;
  const cache = config.cache ?? sharedLineTokenCache;
  const now = config.now ?? (() => Date.now());

  async function send(path: string, init: RequestInit, mapStatus: (status: number) => LineErrorCode) {
    let response: Response;
    try {
      response = await fetchImpl(new URL(path, base), { ...init, signal: AbortSignal.timeout(timeout) });
    } catch { throw new LineChannelError("line_transport_failed"); }
    if (!response.ok) throw new LineChannelError(mapStatus(response.status), response.status);
    return response;
  }

  async function body(response: Response): Promise<unknown> {
    try { return response.status === 204 ? {} : await response.json(); }
    catch { throw new LineChannelError("line_response_invalid", response.status); }
  }

  function authorized(accessToken: string, init: RequestInit = {}): RequestInit {
    return { ...init, headers: { ...init.headers, Authorization: `Bearer ${accessToken}` } };
  }

  const client = {
    /**
     * POST /oauth2/v3/token — stateless 15-minute channel access token, unlimited
     * issuance, no JWT and no assertion signing key. Cached in process only.
     */
    async mintChannelToken(input: LineMintInput): Promise<LineChannelToken> {
      const parsed = lineMintInputSchema.parse(input);
      const key = lineTokenCacheKey(parsed);
      const cached = cache.get(key);
      const current = now();
      if (cached) {
        if (cached.expiresAtMs - current > LINE_TOKEN_SAFETY_MS) {
          return { accessToken: cached.accessToken, expiresIn: Math.floor((cached.expiresAtMs - current) / 1000) };
        }
        // Stale against the authoritative clock — drop it rather than let it linger.
        cache.delete(key);
      }

      const pending = inFlightMints(cache);
      const existing = pending.get(key);
      if (existing) return existing;

      const request = (async () => {
        const form = new URLSearchParams({
          grant_type: "client_credentials", client_id: parsed.channelId, client_secret: parsed.channelSecret,
        });
        const response = await send("oauth2/v3/token", {
          method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString(),
        }, lineMintErrorCode);
        const result = lineTokenResponseSchema.safeParse(await body(response));
        if (!result.success) throw new LineChannelError("line_response_invalid", response.status);
        cache.set(key, { accessToken: result.data.access_token, expiresAtMs: now() + result.data.expires_in * 1000 });
        return { accessToken: result.data.access_token, expiresIn: result.data.expires_in };
      })();

      pending.set(key, request);
      try { return await request; } finally { pending.delete(key); }
    },

    /** Mint from `{channelId, channelSecret}`, or pass through a stored long-lived token. */
    async resolveAccessToken(credentialsValue: unknown): Promise<string> {
      const credentials = socialCredentialSchema.parse(credentialsValue);
      if (credentials.channel !== "line") throw new Error("credential_channel_mismatch");
      if (credentials.channelId !== undefined) {
        return (await client.mintChannelToken({ channelId: credentials.channelId, channelSecret: credentials.channelSecret })).accessToken;
      }
      if (credentials.channelAccessToken === undefined) throw new LineChannelError("line_credentials_invalid");
      return credentials.channelAccessToken;
    },

    /** GET /v2/bot/info — identity for the pre-commit confirmation panel, plus `chatMode`. */
    async getBotInfo(accessToken: string): Promise<LineBotInfo> {
      const response = await send("v2/bot/info", authorized(accessToken, { method: "GET" }), lineChannelErrorCode);
      const result = lineBotInfoSchema.safeParse(await body(response));
      if (!result.success) throw new LineChannelError("line_response_invalid", response.status);
      return result.data;
    },

    /**
     * PUT /v2/bot/channel/webhook/endpoint. LINE does not specify whether this also
     * sets `active`, so callers must read it back with `getWebhookEndpoint`.
     */
    async setWebhookEndpoint(accessToken: string, endpoint: string): Promise<void> {
      const value = lineWebhookEndpointBody(endpoint);
      await send("v2/bot/channel/webhook/endpoint", authorized(accessToken, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: value }),
      }), lineChannelErrorCode);
    },

    /** GET /v2/bot/channel/webhook/endpoint — `active` is the "Use webhook" switch. */
    async getWebhookEndpoint(accessToken: string): Promise<LineWebhookEndpoint> {
      const response = await send("v2/bot/channel/webhook/endpoint", authorized(accessToken, { method: "GET" }), lineChannelErrorCode);
      const result = lineWebhookEndpointSchema.safeParse(await body(response));
      if (!result.success) throw new LineChannelError("line_response_invalid", response.status);
      return result.data;
    },

    /**
     * POST /v2/bot/channel/webhook/test — an unreachable webhook is a *result*, not an
     * exception; only a failed call to LINE itself throws.
     */
    async testWebhook(accessToken: string, endpoint?: string): Promise<LineWebhookTestResult> {
      const payload = endpoint === undefined ? {} : { endpoint: lineWebhookEndpointBody(endpoint) };
      const response = await send("v2/bot/channel/webhook/test", authorized(accessToken, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      }), lineChannelErrorCode);
      const result = lineWebhookTestResponseSchema.safeParse(await body(response));
      if (!result.success) throw new LineChannelError("line_response_invalid", response.status);
      return {
        success: result.data.success === true,
        timestamp: text(result.data.timestamp),
        statusCode: typeof result.data.statusCode === "number" ? result.data.statusCode : null,
        reason: text(result.data.reason),
        detail: text(result.data.detail),
      };
    },
  };
  return client;
}

export type LineChannelClient = ReturnType<typeof createLineChannelClient>;

export function mintLineChannelToken(input: LineMintInput, config?: LineChannelClientConfig) {
  return createLineChannelClient(config).mintChannelToken(input);
}
export function resolveLineAccessToken(credentialsValue: unknown, config?: LineChannelClientConfig) {
  return createLineChannelClient(config).resolveAccessToken(credentialsValue);
}
export function getLineBotInfo(accessToken: string, config?: LineChannelClientConfig) {
  return createLineChannelClient(config).getBotInfo(accessToken);
}
export function setLineWebhookEndpoint(accessToken: string, endpoint: string, config?: LineChannelClientConfig) {
  return createLineChannelClient(config).setWebhookEndpoint(accessToken, endpoint);
}
export function getLineWebhookEndpoint(accessToken: string, config?: LineChannelClientConfig) {
  return createLineChannelClient(config).getWebhookEndpoint(accessToken);
}
export function testLineWebhook(accessToken: string, endpoint?: string, config?: LineChannelClientConfig) {
  return createLineChannelClient(config).testWebhook(accessToken, endpoint);
}

/**
 * Keep the delivery/health error vocabulary consumers already branch on.
 *
 * Exported so route-level health checks that call the LINE client directly translate
 * failures through exactly this mapping — one source of truth, no drifting copy.
 */
export function socialErrorFromLine(error: unknown): Error {
  if (!(error instanceof LineChannelError)) return error instanceof Error ? error : new Error("channel_delivery_failed");
  if (error.code === "line_credentials_invalid" || error.code === "line_authorization_failed") return new Error("credential_reauthorization_required");
  if (error.code === "line_rate_limited") return new Error("channel_rate_limited");
  return new Error("channel_delivery_failed");
}

export function createSocialDeliveryClient(config: Readonly<{
  lineApiBaseUrl: string; metaGraphBaseUrl: string; timeoutMs?: number; fetchImpl?: typeof fetch;
  lineTokenCache?: LineTokenCache;
}>) {
  const lineBase = new URL(config.lineApiBaseUrl); const metaBase = new URL(config.metaGraphBaseUrl);
  for (const url of [lineBase, metaBase]) if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("social_gateway_https_required");
  const fetchImpl = config.fetchImpl ?? fetch; const timeout = config.timeoutMs ?? 15_000;
  const lineClient = createLineChannelClient({
    apiBaseUrl: lineBase.toString(), fetchImpl, timeoutMs: timeout,
    ...(config.lineTokenCache ? { cache: config.lineTokenCache } : {}),
  });
  async function lineAccessToken(credentials: SocialCredentials) {
    try { return await lineClient.resolveAccessToken(credentials); }
    catch (error) { throw socialErrorFromLine(error); }
  }
  async function request(url: URL, init: RequestInit) {
    const response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeout) });
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "credential_reauthorization_required" : response.status === 429 ? "channel_rate_limited" : "channel_delivery_failed");
    return response.status === 204 ? {} : await response.json() as Record<string, unknown>;
  }
  return {
    async deliver(channel: SocialChannel, credentialsValue: unknown, rendered: ReturnType<typeof renderSocialReply>): Promise<SocialDeliveryResult> {
      const credentials = socialCredentialSchema.parse(credentialsValue); if (credentials.channel !== channel) throw new Error("credential_channel_mismatch");
      if (channel === "line" && credentials.channel === "line") {
        if (!("body" in rendered) || !rendered.body) throw new Error("invalid_social_render");
        const path = rendered.endpoint === "reply" ? "v2/bot/message/reply" : "v2/bot/message/push";
        const accessToken = await lineAccessToken(credentials);
        const result = await request(new URL(path, lineBase), { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(rendered.body) });
        return {
          externalMessageIds: array(result.sentMessages).map((item) => identifier(record(item)?.id)).filter((item): item is string => Boolean(item)),
          deliveredCount: rendered.body.messages.length,
        };
      }
      if (!("bodies" in rendered)) throw new Error("invalid_social_render");
      if (credentials.channel === "line") throw new Error("credential_channel_mismatch");
      const token = credentials.channel === "whatsapp" ? credentials.accessToken : credentials.pageAccessToken;
      const target = credentials.channel === "whatsapp" ? credentials.phoneNumberId : "me"; const ids: string[] = [];
      let deliveredCount = 0;
      for (const body of rendered.bodies) {
        try {
          const result = await request(new URL(`${target}/messages`, metaBase), { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
          for (const item of array(result.messages)) { const id = identifier(record(item)?.id); if (id) ids.push(id); }
          const messageId = identifier(result.message_id); if (messageId) ids.push(messageId);
          deliveredCount += 1;
        } catch (error) {
          throw new SocialDeliveryError(
            error instanceof Error ? error.message : "channel_delivery_failed",
            deliveredCount + 1,
            deliveredCount,
            ids,
          );
        }
      }
      return { externalMessageIds: ids, deliveredCount };
    },
    async health(channel: SocialChannel, credentialsValue: unknown) {
      const credentials = socialCredentialSchema.parse(credentialsValue); if (credentials.channel !== channel) throw new Error("credential_channel_mismatch");
      if (credentials.channel === "line") {
        const accessToken = await lineAccessToken(credentials);
        await request(new URL("v2/bot/info", lineBase), { headers: { Authorization: `Bearer ${accessToken}` } });
      } else {
        const token = credentials.channel === "whatsapp" ? credentials.accessToken : credentials.pageAccessToken;
        const target = credentials.channel === "whatsapp" ? credentials.phoneNumberId : credentials.pageId;
        await request(new URL(`${target}?fields=id`, metaBase), { headers: { Authorization: `Bearer ${token}` } });
      }
      return { status: "healthy" as const, checkedAt: new Date() };
    },
  };
}
