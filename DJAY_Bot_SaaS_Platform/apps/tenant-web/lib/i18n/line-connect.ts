import type { OnboardingLocale } from "@djay/channel-onboarding/messages";

/**
 * Wizard chrome for the guided LINE connect. Merchant-facing failure text lives in
 * `@djay/channel-onboarding/messages` so the server contract and the UI cannot drift;
 * only the surrounding labels are here. Thai is the default, English the alternate.
 */
const copy = {
  th: {
    title: "เชื่อมต่อบัญชีทางการ LINE",
    subtitle: "กรอกเพียงสองค่าจาก LINE OA Manager ระบบจะตั้งค่าที่เหลือให้ทั้งหมดและพิสูจน์ว่าใช้งานได้จริง",
    warningTitle: "อ่านก่อนเริ่ม",
    prerequisiteTitle: "หาค่าทั้งสองได้ที่ไหน",
    prerequisiteBody: "LINE OA Manager → ตั้งค่า → Messaging API แล้วคัดลอก Channel ID และ Channel Secret คุณไม่ต้องเข้า LINE Developers Console และไม่ต้องออกโทเคนเอง",
    botLabel: "บอทที่จะเชื่อมต่อ",
    nameLabel: "ชื่อการเชื่อมต่อ",
    channelIdLabel: "Channel ID",
    channelSecretLabel: "Channel Secret",
    verify: "ตรวจสอบบัญชี",
    verifying: "กำลังตรวจสอบ…",
    confirmTitle: "ใช่บัญชีนี้หรือไม่",
    confirmBody: "ตรวจสอบชื่อและไอดีให้ตรงกับบัญชีทางการของคุณก่อนยืนยัน",
    confirm: "ยืนยันและเชื่อมต่อ",
    connecting: "กำลังเชื่อมต่อ…",
    back: "แก้ไขค่าที่กรอก",
    progressTitle: "ขั้นตอนการเชื่อมต่อ",
    failedAt: "ล้มเหลวที่ขั้นตอน",
    rolledBack: "ยกเลิกการเชื่อมต่อที่สร้างไว้แล้ว คุณลองใหม่ด้วยบัญชีเดิมได้ทันที",
    successTitle: "เชื่อมต่อสำเร็จ",
    successBody: "LINE ติดต่อระบบของเราได้แล้ว บอทพร้อมตอบลูกค้า",
    webhookLabel: "Webhook URL ที่ตั้งให้อัตโนมัติ",
    advanced: "ขั้นสูง: วางโทเคนอายุยาวแทน",
    noBots: "ยังไม่มีบอทที่เผยแพร่ สร้างและเผยแพร่บอทก่อนเชื่อมต่อ LINE",
    loadFailed: "โหลดรายชื่อบอทไม่สำเร็จ",
    reauthenticate: "กรุณาเข้าสู่ระบบอีกครั้งก่อนเชื่อมต่อช่องทาง",
    unavailable: "ยังเชื่อมต่อไม่ได้ในขณะนี้ กรุณาลองใหม่ภายหลัง",
    localeToggle: "ภาษา",
    back_to_studio: "กลับไปที่สตูดิโอ FlowBot",
  },
  en: {
    title: "Connect your LINE Official Account",
    subtitle: "Give us two values from LINE OA Manager. We do the rest and prove it works.",
    warningTitle: "Read before you start",
    prerequisiteTitle: "Where to find both values",
    prerequisiteBody: "LINE OA Manager → Settings → Messaging API, then copy Channel ID and Channel Secret. You never open the LINE Developers Console and never issue a token yourself.",
    botLabel: "Bot to connect",
    nameLabel: "Connection name",
    channelIdLabel: "Channel ID",
    channelSecretLabel: "Channel Secret",
    verify: "Check this account",
    verifying: "Checking…",
    confirmTitle: "Is this the right account?",
    confirmBody: "Check the name and ID match your Official Account before you confirm.",
    confirm: "Confirm and connect",
    connecting: "Connecting…",
    back: "Change the values",
    progressTitle: "Connection steps",
    failedAt: "Failed at step",
    rolledBack: "The part-built connection was removed, so you can retry the same account immediately.",
    successTitle: "Connected",
    successBody: "LINE reached us successfully. Your bot is ready to answer customers.",
    webhookLabel: "Webhook URL we set for you",
    advanced: "Advanced: paste a long-lived token instead",
    noBots: "No published bot yet. Create and publish a bot before connecting LINE.",
    loadFailed: "Bots could not be loaded.",
    reauthenticate: "Please sign in again before connecting a channel.",
    unavailable: "Connecting is unavailable right now. Please try again later.",
    localeToggle: "Language",
    back_to_studio: "Back to FlowBot studio",
  },
} as const;

export type LineConnectCopyKey = keyof typeof copy.th;

export function lineConnectCopy(locale: OnboardingLocale): Readonly<Record<LineConnectCopyKey, string>> {
  return copy[locale] ?? copy.th;
}
