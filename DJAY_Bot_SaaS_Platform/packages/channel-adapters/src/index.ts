import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const socialChannels = ["line", "whatsapp", "messenger"] as const;
export type SocialChannel = (typeof socialChannels)[number];

const commonSecret = z.string().min(16).max(4096);
export const socialCredentialSchema = z.discriminatedUnion("channel", [
  z.object({
    channel: z.literal("line"), channelAccessToken: commonSecret, channelSecret: commonSecret,
  }).strict(),
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
  recipient: string; text: string; quickReplies: readonly string[]; replyToken?: string | null;
}>;

export function renderSocialReply(channel: SocialChannel, input: SocialRenderInput) {
  if (!input.recipient || !input.text.trim()) throw new Error("invalid_social_reply");
  const maximum = channel === "line" ? 5000 : channel === "whatsapp" ? 4096 : 2000;
  const chunks = splitText(input.text, maximum);
  if (channel === "line") return {
    endpoint: input.replyToken ? "reply" as const : "push" as const,
    body: input.replyToken ? { replyToken: input.replyToken, messages: chunks.map((value, index) => ({
      type: "text", text: value, ...(index === chunks.length - 1 && input.quickReplies.length ? { quickReply: { items: input.quickReplies.slice(0, 13).map((label) => ({ type: "action", action: { type: "message", label: label.slice(0, 20), text: label.slice(0, 300) } })) } } : {}),
    })) } : { to: input.recipient, messages: chunks.map((value) => ({ type: "text", text: value })) },
  };
  if (channel === "whatsapp") {
    const final = chunks.at(-1)!; const prefix = chunks.slice(0, -1).map((body) => ({ type: "text", text: { body } }));
    const last = input.quickReplies.length ? { type: "interactive", interactive: { type: "button", body: { text: final }, action: { buttons: input.quickReplies.slice(0, 3).map((label, index) => ({ type: "reply", reply: { id: `choice_${index + 1}`, title: label.slice(0, 20) } })) } } } : { type: "text", text: { body: final } };
    return { endpoint: "messages" as const, bodies: [...prefix, last].map((message) => ({ messaging_product: "whatsapp", recipient_type: "individual", to: input.recipient, ...message })) };
  }
  return { endpoint: "messages" as const, bodies: chunks.map((value, index) => ({
    recipient: { id: input.recipient }, messaging_type: "RESPONSE", message: {
      text: value, ...(index === chunks.length - 1 && input.quickReplies.length ? { quick_replies: input.quickReplies.slice(0, 13).map((title) => ({ content_type: "text", title: title.slice(0, 20), payload: title.slice(0, 1000) })) } : {}),
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

export function createSocialDeliveryClient(config: Readonly<{
  lineApiBaseUrl: string; metaGraphBaseUrl: string; timeoutMs?: number; fetchImpl?: typeof fetch;
}>) {
  const lineBase = new URL(config.lineApiBaseUrl); const metaBase = new URL(config.metaGraphBaseUrl);
  for (const url of [lineBase, metaBase]) if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("social_gateway_https_required");
  const fetchImpl = config.fetchImpl ?? fetch; const timeout = config.timeoutMs ?? 15_000;
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
        const result = await request(new URL(path, lineBase), { method: "POST", headers: { Authorization: `Bearer ${credentials.channelAccessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(rendered.body) });
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
        await request(new URL("v2/bot/info", lineBase), { headers: { Authorization: `Bearer ${credentials.channelAccessToken}` } });
      } else {
        const token = credentials.channel === "whatsapp" ? credentials.accessToken : credentials.pageAccessToken;
        const target = credentials.channel === "whatsapp" ? credentials.phoneNumberId : credentials.pageId;
        await request(new URL(`${target}?fields=id`, metaBase), { headers: { Authorization: `Bearer ${token}` } });
      }
      return { status: "healthy" as const, checkedAt: new Date() };
    },
  };
}
