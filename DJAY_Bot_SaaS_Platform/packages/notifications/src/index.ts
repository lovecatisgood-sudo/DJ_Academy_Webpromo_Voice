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
  locale: z.enum(["th", "en"]).default("th"),
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
const usageAlertPayloadSchema = z.object({
  alertId: z.uuid(),
  notificationProfileId: z.uuid(),
  templateKey: z.literal("usage.allowance_alert"),
  alertKey: z.string().regex(/^(allowance_(50|75|90|100)|projected_exhaustion|usage_anomaly)$/),
  forecast: z.record(z.string(), z.unknown()),
}).strict();
const billingNotificationPayloadSchema = z.object({
  notificationId: z.uuid(),
  templateKey: z.enum([
    "subscription.active", "subscription.past_due", "subscription.grace_period",
    "subscription.restricted", "subscription.cancelled",
    "cancellation.scheduled", "cancellation.revoked", "cancellation.failed",
    "payment.succeeded", "payment.failed", "refund.updated", "credit_note.issued",
  ]),
  subscriptionId: z.uuid().nullable(),
  facts: z.record(z.string(), z.unknown()),
  locale: z.enum(["en", "th"]),
}).strict();

function renderMerchantLead(to: string, payload: z.infer<typeof merchantLeadPayloadSchema>): EmailMessage {
  const leadId = escapeHtml(payload.leadId);
  return {
    to,
    subject: "DJAY Bot เก็บข้อมูลผู้สนใจรายใหม่จากเว็บไซต์แล้ว",
    text: `มีผู้สนใจรายใหม่จากเว็บไซต์ รหัสผู้สนใจ: ${payload.leadId}`,
    html: `<p>DJAY Bot เก็บข้อมูลผู้สนใจรายใหม่จากเว็บไซต์แล้ว</p><p>รหัสผู้สนใจ: <strong>${leadId}</strong></p>`,
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
      subject: "ผู้สนใจที่ผ่านการคัดกรองจาก DJAY Bot",
      text: `ผู้เข้าชมเว็บไซต์สนทนากับผู้ช่วยฝ่ายขาย AI จบแล้ว รหัสผู้สนใจ: ${payload.leadId}`,
      html: `<p>ผู้เข้าชมเว็บไซต์สนทนากับผู้ช่วยฝ่ายขาย AI จบแล้ว</p><p>รหัสผู้สนใจ: <strong>${leadId}</strong></p>`,
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

export async function runUsageAlertEmail(
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
    const payload = usageAlertPayloadSchema.parse(item.payload);
    const alertLabels: Record<string, string> = {
      allowance_50: "ใช้โควตาที่รวมในแผนแล้ว 50%",
      allowance_75: "ใช้โควตาที่รวมในแผนแล้ว 75%",
      allowance_90: "ใช้โควตาที่รวมในแผนแล้ว 90%",
      allowance_100: "ใช้โควตาที่รวมในแผนครบแล้ว",
      projected_exhaustion: "คาดว่าการใช้งานจะเกินโควตาที่รวมในแผน",
      usage_anomaly: "ตรวจพบการใช้งานเพิ่มขึ้นผิดปกติ",
    };
    const summary = alertLabels[payload.alertKey] ?? "มีการแจ้งเตือนการใช้งานที่ต้องตรวจสอบ";
    await delivery.send({
      to: recipient.email,
      subject: `การแจ้งเตือนการใช้งาน DJAY Bot: ${summary}`,
      text: `${summary} โปรดตรวจการใช้งานและขีดจำกัดความปลอดภัยในเวิร์กสเปซ DJAY Bot รหัสการแจ้งเตือน: ${payload.alertId}`,
      html: `<p><strong>${escapeHtml(summary)}</strong></p><p>โปรดตรวจการใช้งานและขีดจำกัดความปลอดภัยในเวิร์กสเปซ DJAY Bot</p><p>รหัสการแจ้งเตือน: ${escapeHtml(payload.alertId)}</p>`,
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

export async function runCustomerBillingEmail(
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
    const payload = billingNotificationPayloadSchema.parse(item.payload);
    const english: Record<typeof payload.templateKey, string> = {
      "subscription.active": "Your DJAY Bot subscription is active",
      "subscription.past_due": "Your DJAY Bot payment needs attention",
      "subscription.grace_period": "Your DJAY Bot subscription is in its grace period",
      "subscription.restricted": "Your DJAY Bot subscription access is restricted",
      "subscription.cancelled": "Your DJAY Bot subscription has ended",
      "cancellation.scheduled": "Your DJAY Bot cancellation is scheduled",
      "cancellation.revoked": "Your DJAY Bot cancellation was withdrawn",
      "cancellation.failed": "Your DJAY Bot cancellation request needs attention",
      "payment.succeeded": "Your DJAY Bot payment was successful",
      "payment.failed": "Your DJAY Bot payment failed",
      "refund.updated": "Your DJAY Bot refund was updated",
      "credit_note.issued": "A DJAY Bot credit note was issued",
    };
    const thai: Record<typeof payload.templateKey, string> = {
      "subscription.active": "การสมัคร DJAY Bot ของคุณเปิดใช้งานแล้ว",
      "subscription.past_due": "การชำระเงิน DJAY Bot ของคุณต้องได้รับการตรวจสอบ",
      "subscription.grace_period": "การสมัคร DJAY Bot ของคุณอยู่ในช่วงผ่อนผัน",
      "subscription.restricted": "การเข้าถึง DJAY Bot ของคุณถูกจำกัด",
      "subscription.cancelled": "การสมัคร DJAY Bot ของคุณสิ้นสุดแล้ว",
      "cancellation.scheduled": "กำหนดการยกเลิก DJAY Bot ของคุณแล้ว",
      "cancellation.revoked": "คำขอยกเลิก DJAY Bot ของคุณถูกถอนแล้ว",
      "cancellation.failed": "คำขอยกเลิก DJAY Bot ของคุณต้องได้รับการตรวจสอบ",
      "payment.succeeded": "ชำระเงิน DJAY Bot สำเร็จแล้ว",
      "payment.failed": "การชำระเงิน DJAY Bot ไม่สำเร็จ",
      "refund.updated": "สถานะการคืนเงิน DJAY Bot ได้รับการอัปเดตแล้ว",
      "credit_note.issued": "มีการออกใบลดหนี้ DJAY Bot แล้ว",
    };
    const subject = payload.locale === "th" ? thai[payload.templateKey] : english[payload.templateKey];
    const review = payload.locale === "th"
      ? "โปรดลงชื่อเข้าใช้พื้นที่ทำงาน DJAY Bot เพื่อตรวจสอบรายละเอียดการเรียกเก็บเงิน"
      : "Sign in to your DJAY Bot workspace to review the billing details.";
    const notificationIdLabel = payload.locale === "th" ? "รหัสการแจ้งเตือน" : "Notification ID";
    await delivery.send({
      to: recipient.email,
      subject,
      text: `${subject}. ${review} ${notificationIdLabel}: ${payload.notificationId}`,
      html: `<p><strong>${escapeHtml(subject)}</strong></p><p>${escapeHtml(review)}</p><p>${notificationIdLabel}: ${escapeHtml(payload.notificationId)}</p>`,
    }, item.id);
    await store.finish(item.id, true, null, false);
    return Object.freeze({ status: "sent" as const, outboxId: item.id });
  } catch (error) {
    const errorCode = error instanceof z.ZodError ? "payload_validation_failed"
      : error instanceof Error && error.message === "notification_profile_disabled" ? "notification_profile_disabled"
        : error instanceof Error && error.message === "delivery_rejected" ? "delivery_rejected" : "delivery_failed";
    const deadLetter = errorCode === "notification_profile_disabled"
      || errorCode === "payload_validation_failed" || item.attemptCount >= (options.maxAttempts ?? 8);
    await store.finish(item.id, false, errorCode, deadLetter);
    return Object.freeze({ status: deadLetter ? "dead_letter" as const : "retrying" as const,
      outboxId: item.id, errorCode });
  }
}

function render(payload: z.infer<typeof payloadSchema>): EmailMessage {
  const configurations = payload.locale === "en" ? {
    "verify-email": { subject: "Verify your DJAY Bot account", action: "Verify account", url: payload.verificationUrl },
    "recover-password": { subject: "Reset your DJAY Bot password", action: "Reset password", url: payload.recoveryUrl },
    "tenant-invitation": { subject: "You are invited to a DJAY Bot workspace", action: "Accept invitation", url: payload.invitationUrl },
    "ownership-transfer": { subject: "DJAY Bot ownership transfer request", action: "Review transfer", url: payload.transferUrl },
  } as const : {
    "verify-email": { subject: "ยืนยันบัญชี DJAY Bot", action: "ยืนยันบัญชี", url: payload.verificationUrl },
    "recover-password": { subject: "รีเซ็ตรหัสผ่าน DJAY Bot", action: "รีเซ็ตรหัสผ่าน", url: payload.recoveryUrl },
    "tenant-invitation": { subject: "คำเชิญเข้าเวิร์กสเปซ DJAY Bot", action: "ยอมรับคำเชิญ", url: payload.invitationUrl },
    "ownership-transfer": { subject: "คำขอโอนสิทธิ์เจ้าของ DJAY Bot", action: "ตรวจสอบการโอนสิทธิ์", url: payload.transferUrl },
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
