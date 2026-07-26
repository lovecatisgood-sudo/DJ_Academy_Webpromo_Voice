/**
 * Channel/conversation SRE metrics (`docs/runbooks/sre-slos.md`).
 *
 * Same transport as `commerce_metric`: one structured JSON line per event on stdout,
 * parsed into Cloud Logging log-based metrics. No metrics library, no dependency, no
 * network, no buffering.
 *
 * Three rules this module enforces rather than documents:
 *  1. **Never throw into the request or turn path.** Emission is wrapped; a logging
 *     fault must never fail a customer's message.
 *  2. **Never carry PII, secrets, or message content.** Only the fields declared below
 *     are emitted, all of them low-cardinality enums or numbers. There is deliberately
 *     no free-text field and no way to pass a message body, recipient, or token.
 *  3. **Never name a provider or model.** Provider confidentiality is load-bearing, so
 *     `errorClass` is drawn from our own internal vocabulary, never a provider string.
 */

export const channelMetricNames = [
  "conversation_first_response_ms",
  "webhook_ack_ms",
  "channel_delivery_result",
  "line_reply_window_hit",
  "onboarding_step",
] as const;
export type ChannelMetricName = (typeof channelMetricNames)[number];

export type MetricProduct = "flowbot" | "ai_chat";
export type MetricChannel = "line" | "messenger" | "whatsapp" | "website";

/**
 * Our own error vocabulary. Provider error strings are never emitted — they leak both
 * provider identity and, occasionally, request content.
 */
export const deliveryErrorClasses = [
  "reauthorization_required",
  "rate_limited",
  "invalid_request",
  "authority_unavailable",
  "transport_failed",
  "unknown",
] as const;
export type DeliveryErrorClass = (typeof deliveryErrorClasses)[number];

/** Map an internal safe error code to a metric error class. Never accepts provider text. */
export function deliveryErrorClass(safeErrorCode: string | null | undefined): DeliveryErrorClass {
  if (!safeErrorCode) return "unknown";
  if (safeErrorCode === "credential_reauthorization_required" || safeErrorCode === "line_credentials_invalid"
    || safeErrorCode === "line_authorization_failed") return "reauthorization_required";
  if (safeErrorCode === "channel_rate_limited" || safeErrorCode === "line_rate_limited") return "rate_limited";
  if (safeErrorCode === "invalid_social_render" || safeErrorCode === "invalid_social_reply"
    || safeErrorCode === "credential_channel_mismatch" || safeErrorCode === "invalid_social_delivery_progress"
    || safeErrorCode === "line_webhook_endpoint_invalid") return "invalid_request";
  if (safeErrorCode === "flow_social_authority_unavailable" || safeErrorCode === "social_authority_unavailable"
    || safeErrorCode === "ai_social_authority_unavailable") return "authority_unavailable";
  if (safeErrorCode === "channel_delivery_failed" || safeErrorCode === "line_transport_failed"
    || safeErrorCode === "line_request_failed") return "transport_failed";
  return "unknown";
}

/** LINE issues a `replyToken` with each inbound event; it is valid for roughly 60 seconds. */
export const lineReplyWindowMs = 60_000;

type MetricFields = Readonly<Record<string, string | number | boolean | null | undefined>>;

function emit(metric: ChannelMetricName, fields: MetricFields) {
  try {
    console.info(JSON.stringify({ severity: "INFO", message: "commerce_metric", metric, ...fields }));
  } catch {
    // A metric must never break a turn. Intentionally swallowed and not retried.
  }
}

/**
 * Wall-clock from the customer's inbound event to our reply leaving the platform.
 * Only emit when the true inbound timestamp is known — never a proxy.
 */
export function emitConversationFirstResponse(fields: Readonly<{
  product: MetricProduct; channel: MetricChannel; elapsedMs: number;
}>) {
  emit("conversation_first_response_ms", {
    product: fields.product, channel: fields.channel, elapsedMs: Math.max(0, Math.round(fields.elapsedMs)),
  });
}

/** Time to acknowledge a provider webhook. Providers retry on a slow ACK. */
export function emitWebhookAck(fields: Readonly<{
  product: MetricProduct; channel: MetricChannel; elapsedMs: number; httpStatus: number;
}>) {
  emit("webhook_ack_ms", {
    product: fields.product, channel: fields.channel,
    elapsedMs: Math.max(0, Math.round(fields.elapsedMs)), httpStatus: fields.httpStatus,
  });
}

export function emitChannelDeliveryResult(fields: Readonly<{
  product: MetricProduct; channel: MetricChannel; outcome: "succeeded" | "failed";
  errorClass?: DeliveryErrorClass; deadLetter?: boolean; attemptCount?: number;
}>) {
  emit("channel_delivery_result", {
    product: fields.product, channel: fields.channel, outcome: fields.outcome,
    errorClass: fields.outcome === "failed" ? fields.errorClass ?? "unknown" : null,
    deadLetter: fields.deadLetter ?? false,
    attemptCount: fields.attemptCount ?? null,
  });
}

/**
 * Commercially critical: a miss converts a free LINE reply into a metered push.
 * `elapsedMs` is measured from the inbound event LINE timestamped, which is when the
 * `replyToken` was issued.
 */
export function emitLineReplyWindowHit(fields: Readonly<{
  product: MetricProduct; elapsedMs: number; usedReplyToken: boolean;
}>) {
  emit("line_reply_window_hit", {
    product: fields.product, channel: "line",
    hit: fields.usedReplyToken && fields.elapsedMs <= lineReplyWindowMs,
    elapsedMs: Math.max(0, Math.round(fields.elapsedMs)),
    usedReplyToken: fields.usedReplyToken,
  });
}

export function emitOnboardingStep(fields: Readonly<{
  product: MetricProduct; channel: MetricChannel; step: string;
  outcome: "succeeded" | "failed"; reason?: string | null;
}>) {
  emit("onboarding_step", {
    product: fields.product, channel: fields.channel, step: fields.step,
    outcome: fields.outcome, reason: fields.reason ?? null,
  });
}
