import { openJson } from "@djay/auth";
import { z } from "zod";

export type EmailOutboxItem = Readonly<{
  id: string;
  topic: string;
  payloadCiphertext: string;
  attemptCount: number;
}>;

export interface EmailOutboxStore {
  claimBatch(now: Date, limit: number, staleBefore: Date): Promise<readonly EmailOutboxItem[]>;
  markSent(id: string, now: Date): Promise<void>;
  markFailed(id: string, now: Date, errorCode: string, retryAt: Date, deadLetter: boolean): Promise<void>;
}

export type EmailMessage = Readonly<{
  to: string;
  subject: string;
  text: string;
  html: string;
}>;

export interface EmailDelivery {
  send(message: EmailMessage, idempotencyKey: string): Promise<void>;
}

export type FlowbotMerchantEmailItem = Readonly<{
  id: string;
  recipientCiphertext: string | null;
  payload: unknown;
  attemptCount: number;
  deliveryAllowed: boolean;
}>;

export interface FlowbotMerchantEmailStore {
  claim(now: Date, staleBefore: Date): Promise<FlowbotMerchantEmailItem | null>;
  finish(id: string, delivered: boolean, errorCode: string | null, deadLetter: boolean): Promise<void>;
}

const payloadSchema = z.object({
  template: z.enum(["verify-email", "recover-password", "tenant-invitation", "ownership-transfer"]),
  to: z.email().max(320),
  verificationUrl: z.url().optional(),
  recoveryUrl: z.url().optional(),
  invitationUrl: z.url().optional(),
  transferUrl: z.url().optional(),
  expiresAt: z.string().optional(),
}).strict();

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

const merchantRecipientSchema = z.object({ email: z.email().max(320) }).strict();
const merchantLeadPayloadSchema = z.object({
  notificationProfileId: z.uuid(),
  templateKey: z.literal("flowbot.lead_captured"),
  leadId: z.uuid(),
  contactId: z.uuid(),
}).strict();
const aiMerchantLeadPayloadSchema = z.object({
  notificationProfileId: z.uuid(),
  templateKey: z.literal("ai_chat.lead_qualified"),
  leadId: z.uuid(),
  contactId: z.uuid(),
  turnId: z.uuid(),
}).strict();

function renderMerchantLead(to: string, payload: z.infer<typeof merchantLeadPayloadSchema>): EmailMessage {
  const leadId = escapeHtml(payload.leadId);
  return {
    to,
    subject: "New website lead captured by DJAY Bot",
    text: `A new website lead was captured. Lead ID: ${payload.leadId}`,
    html: `<p>A new website lead was captured by DJAY Bot.</p><p>Lead ID: <strong>${leadId}</strong></p>`,
  };
}

export async function runFlowbotMerchantEmail(
  store: FlowbotMerchantEmailStore,
  delivery: EmailDelivery,
  envelopeKey: Buffer,
  options: Readonly<{ now?: Date; maxAttempts?: number }> = {},
) {
  const now = options.now ?? new Date();
  const item = await store.claim(now, new Date(now.getTime() - 5 * 60 * 1000));
  if (!item) return Object.freeze({ status: "idle" as const });
  try {
    if (!item.deliveryAllowed || !item.recipientCiphertext) throw new Error("notification_profile_disabled");
    const recipient = merchantRecipientSchema.parse(openJson<unknown>(item.recipientCiphertext, envelopeKey));
    const payload = merchantLeadPayloadSchema.parse(item.payload);
    await delivery.send(renderMerchantLead(recipient.email, payload), item.id);
    await store.finish(item.id, true, null, false);
    return Object.freeze({ status: "sent" as const, outboxId: item.id });
  } catch (error) {
    const errorCode = error instanceof z.ZodError ? "payload_validation_failed"
      : error instanceof Error && error.message === "notification_profile_disabled" ? "notification_profile_disabled"
      : error instanceof Error && error.message === "delivery_rejected" ? "delivery_rejected"
      : "delivery_failed";
    const deadLetter = errorCode === "notification_profile_disabled"
      || errorCode === "payload_validation_failed"
      || item.attemptCount >= (options.maxAttempts ?? 8);
    await store.finish(item.id, false, errorCode, deadLetter);
    return Object.freeze({ status: deadLetter ? "dead_letter" as const : "retrying" as const, outboxId: item.id, errorCode });
  }
}

export async function runAiChatMerchantEmail(
  store: FlowbotMerchantEmailStore,
  delivery: EmailDelivery,
  envelopeKey: Buffer,
  options: Readonly<{ now?: Date; maxAttempts?: number }> = {},
) {
  const now = options.now ?? new Date();
  const item = await store.claim(now, new Date(now.getTime() - 5 * 60 * 1000));
  if (!item) return Object.freeze({ status: "idle" as const });
  try {
    if (!item.deliveryAllowed || !item.recipientCiphertext) throw new Error("notification_profile_disabled");
    const recipient = merchantRecipientSchema.parse(openJson<unknown>(item.recipientCiphertext, envelopeKey));
    const payload = aiMerchantLeadPayloadSchema.parse(item.payload);
    const leadId = escapeHtml(payload.leadId);
    await delivery.send({
      to: recipient.email,
      subject: "Qualified website lead from DJAY Bot",
      text: `A website visitor completed an AI sales conversation. Lead ID: ${payload.leadId}`,
      html: `<p>A website visitor completed an AI sales conversation.</p><p>Lead ID: <strong>${leadId}</strong></p>`,
    }, item.id);
    await store.finish(item.id, true, null, false);
    return Object.freeze({ status: "sent" as const, outboxId: item.id });
  } catch (error) {
    const errorCode = error instanceof z.ZodError ? "payload_validation_failed"
      : error instanceof Error && error.message === "notification_profile_disabled" ? "notification_profile_disabled"
        : error instanceof Error && error.message === "delivery_rejected" ? "delivery_rejected"
          : "delivery_failed";
    const deadLetter = errorCode === "notification_profile_disabled"
      || errorCode === "payload_validation_failed"
      || item.attemptCount >= (options.maxAttempts ?? 8);
    await store.finish(item.id, false, errorCode, deadLetter);
    return Object.freeze({ status: deadLetter ? "dead_letter" as const : "retrying" as const, outboxId: item.id, errorCode });
  }
}

function render(payload: z.infer<typeof payloadSchema>): EmailMessage {
  const configurations = {
    "verify-email": { subject: "Verify your DJAY Bot account", action: "Verify account", url: payload.verificationUrl },
    "recover-password": { subject: "Reset your DJAY Bot password", action: "Reset password", url: payload.recoveryUrl },
    "tenant-invitation": { subject: "You are invited to a DJAY Bot workspace", action: "Accept invitation", url: payload.invitationUrl },
    "ownership-transfer": { subject: "DJAY Bot ownership transfer request", action: "Review transfer", url: payload.transferUrl },
  } as const;
  const selected = configurations[payload.template];
  if (!selected.url) throw new Error("notification_payload_invalid");
  const url = escapeHtml(selected.url);
  return {
    to: payload.to,
    subject: selected.subject,
    text: `${selected.action}: ${selected.url}`,
    html: `<p>${selected.action}</p><p><a href="${url}">${selected.action}</a></p>`,
  };
}

function safeErrorCode(error: unknown): string {
  if (error instanceof z.ZodError) return "payload_validation_failed";
  if (error instanceof Error && error.message === "notification_payload_invalid") return "payload_validation_failed";
  if (error instanceof Error && error.message === "delivery_rejected") return "delivery_rejected";
  return "delivery_failed";
}

export async function runEmailBatch(
  store: EmailOutboxStore,
  delivery: EmailDelivery,
  envelopeKey: Buffer,
  options: Readonly<{ now?: Date; batchSize?: number; maxAttempts?: number }> = {},
) {
  const now = options.now ?? new Date();
  const maxAttempts = options.maxAttempts ?? 8;
  const items = await store.claimBatch(now, options.batchSize ?? 25, new Date(now.getTime() - 5 * 60 * 1000));
  let sent = 0;
  let failed = 0;
  for (const item of items) {
    try {
      const payload = payloadSchema.parse(openJson<unknown>(item.payloadCiphertext, envelopeKey));
      await delivery.send(render(payload), item.id);
      await store.markSent(item.id, now);
      sent += 1;
    } catch (error) {
      const deadLetter = item.attemptCount >= maxAttempts;
      const retrySeconds = Math.min(3600, 30 * (2 ** Math.min(item.attemptCount, 7)));
      await store.markFailed(
        item.id,
        now,
        safeErrorCode(error),
        new Date(now.getTime() + retrySeconds * 1000),
        deadLetter,
      );
      failed += 1;
    }
  }
  return Object.freeze({ claimed: items.length, sent, failed });
}

export function createHttpEmailDelivery(config: Readonly<{
  endpoint: string;
  apiToken: string;
  from: string;
}>): EmailDelivery {
  return {
    async send(message, idempotencyKey) {
      const response = await fetch(config.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiToken}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ from: config.from, ...message }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error("delivery_rejected");
    },
  };
}
