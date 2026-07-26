/**
 * Merchant-facing vocabulary for channel onboarding (design spec 5.2).
 *
 * Deliberately free of any dependency on `@djay/channel-adapters` so browser bundles
 * can import these strings without pulling in `node:crypto`. Thai is the default;
 * English is the alternate. Every reason names the exact thing to change - there is no
 * generic failure message.
 */

/** Ordered exactly as executed, so a caller can render progress without duplicating the list. */
export const lineConnectSteps = [
  "mint",
  "bot_info",
  "auto_reply",
  "create_connection",
  "set_webhook",
  "confirm_webhook",
  "test_webhook",
] as const;
export type LineConnectStep = (typeof lineConnectSteps)[number];

export const lineConnectReasons = [
  "invalid_credentials",
  "line_unreachable",
  "line_rate_limited",
  "bot_info_unavailable",
  "auto_reply_enabled",
  "already_connected",
  "not_entitled",
  "limit_reached",
  "channel_not_admitted",
  "bot_unavailable",
  "webhook_set_failed",
  "webhook_inactive",
  "webhook_unreachable",
] as const;
export type LineConnectReason = (typeof lineConnectReasons)[number];


export type OnboardingLocale = "th" | "en";

export function resolveOnboardingLocale(value: string | null | undefined): OnboardingLocale {
  return value === "en" ? "en" : "th";
}

/** The minimum a caller must supply to render a failure; the full result type extends it. */
export type LineConnectFailureSummary = Readonly<{
  reason: LineConnectReason;
  statusCode: number | null;
}>;


const stepLabels: Readonly<Record<OnboardingLocale, Readonly<Record<LineConnectStep, string>>>> = {
  th: {
    mint: "ตรวจสอบ Channel ID และ Channel Secret",
    bot_info: "อ่านข้อมูลบัญชีทางการ",
    auto_reply: "ตรวจสอบการตอบกลับอัตโนมัติ",
    create_connection: "สร้างการเชื่อมต่อ",
    set_webhook: "ตั้งค่า Webhook",
    confirm_webhook: "ยืนยันว่าเปิดใช้ Webhook",
    test_webhook: "ทดสอบว่า LINE ติดต่อเรากลับได้",
  },
  en: {
    mint: "Verify Channel ID and Channel Secret",
    bot_info: "Read Official Account details",
    auto_reply: "Check auto-reply setting",
    create_connection: "Create the connection",
    set_webhook: "Set the webhook",
    confirm_webhook: "Confirm the webhook is on",
    test_webhook: "Prove LINE can reach us",
  },
};

const reasonMessages: Readonly<Record<OnboardingLocale, Readonly<Record<LineConnectReason, string>>>> = {
  th: {
    invalid_credentials: "Channel ID หรือ Channel Secret ไม่ถูกต้อง คัดลอกทั้งสองค่าใหม่จาก LINE OA Manager → ตั้งค่า → Messaging API",
    line_unreachable: "ติดต่อ LINE ไม่ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง",
    line_rate_limited: "LINE จำกัดจำนวนคำขอชั่วคราว กรุณารอสักครู่แล้วลองใหม่",
    bot_info_unavailable: "เชื่อมต่อ LINE ได้ แต่อ่านข้อมูลบัญชีทางการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
    auto_reply_enabled: "บัญชีนี้เปิด “แชท” อยู่ ระบบตอบกลับอัตโนมัติจะตอบลูกค้าก่อนบอท ปิดที่ OA Manager → ตั้งค่า → การตอบกลับ → ตั้ง “แชท” เป็นปิด",
    already_connected: "บัญชีทางการ LINE นี้เชื่อมต่ออยู่แล้ว",
    not_entitled: "แพ็กเกจของคุณยังไม่รวมช่องทางโซเชียล",
    limit_reached: "คุณใช้ช่องทางโซเชียลครบตามแพ็กเกจแล้ว",
    channel_not_admitted: "แพ็กเกจของคุณรวมช่องทางโซเชียลได้หนึ่งช่องทาง ซึ่งถูกใช้กับอีกช่องทางไปแล้ว หากต้องการเพิ่มช่องทางนี้ กรุณาซื้อส่วนเสริมช่องทางเพิ่ม หรือรอครบกำหนดเปลี่ยนช่องทาง",
    bot_unavailable: "เลือกบอทที่เผยแพร่แล้วก่อนเชื่อมต่อ LINE",
    webhook_set_failed: "ตั้งค่า Webhook บนแชนแนล LINE ไม่สำเร็จ",
    webhook_inactive: "ตั้งค่า Webhook แล้วแต่ยังไม่เปิดใช้ เปิด “Use webhook” ที่ OA Manager → ตั้งค่า → Messaging API",
    webhook_unreachable: "LINE ติดต่อระบบของเราไม่ได้ (HTTP {statusCode}) กรุณาลองใหม่อีกครั้ง หรือติดต่อฝ่ายสนับสนุน",
  },
  en: {
    invalid_credentials: "Channel ID or Channel Secret is incorrect. Copy both again from LINE OA Manager → Settings → Messaging API.",
    line_unreachable: "We could not reach LINE just now. Please try again.",
    line_rate_limited: "LINE is temporarily limiting requests. Wait a moment and try again.",
    bot_info_unavailable: "We reached LINE but could not read your Official Account details. Please try again.",
    auto_reply_enabled: "Chat is On for this account, so auto-reply answers customers before the bot can. Turn it off in OA Manager → Settings → Response settings → set Chat to Off.",
    already_connected: "This LINE Official Account is already connected.",
    not_entitled: "Your plan does not include a social channel yet.",
    limit_reached: "You have used every social channel included in your plan.",
    channel_not_admitted: "Your plan includes one social channel and it is already used by a different channel. Add the additional-social-channel add-on, or wait until the change cooldown ends.",
    bot_unavailable: "Select a published bot before connecting LINE.",
    webhook_set_failed: "We could not set the webhook on your LINE channel.",
    webhook_inactive: "The webhook is set but Use webhook is off. Turn on Use webhook in OA Manager → Settings → Messaging API.",
    webhook_unreachable: "LINE could not reach us (HTTP {statusCode}). Please try again, or contact support.",
  },
};

/** Warning shown *before* the merchant is asked for anything (permanent Provider choice). */
export const lineProviderWarning: Readonly<Record<OnboardingLocale, string>> = {
  th: "ก่อนเริ่ม: บัญชีทางการของคุณต้องเปิดใช้ Messaging API และการเลือก “Provider” ตอนเปิดใช้เป็นการเลือกถาวร เปลี่ยนภายหลังไม่ได้ กรุณาเลือกให้ถูกต้องตั้งแต่ครั้งแรก",
  en: "Before you start: your Official Account must have the Messaging API enabled, and enabling it asks you to choose a Provider. That choice is permanent and cannot be changed later, so choose carefully.",
};

export function lineConnectStepLabel(step: LineConnectStep, locale: OnboardingLocale): string {
  return stepLabels[locale][step];
}

/** Never a generic failure: every reason names the exact thing to change. */
export function lineConnectFailureMessage(failure: LineConnectFailureSummary, locale: OnboardingLocale): string {
  return reasonMessages[locale][failure.reason]
    .replace("{statusCode}", failure.statusCode === null ? "?" : String(failure.statusCode));
}
