"use client";

import { PublicInfoHeader } from "../PublicInfoHeader";
import { PublicFooter } from "../PublicFooter";
import { localeText, usePublicLocale } from "../LocaleBoundary";

const guides = [
  ["เริ่มต้นโดยไม่ต้องทำงานเชิงเทคนิค", "เลือกเป้าหมายธุรกิจ ใช้เทมเพลตบอตที่แนะนำ เพิ่มรายละเอียดธุรกิจ และทดสอบเส้นทางลูกค้าจริงหนึ่งรอบ"],
  ["เชื่อมต่อเว็บไซต์", "คัดลอกโค้ดเว็บไซต์ที่ตรวจสอบแล้วจากหน้าตั้งค่า วางก่อนแท็กปิดของ body แล้วใช้ศูนย์ทดสอบเพื่อยืนยันการติดตั้ง"],
  ["ตรวจสถานะบริการ", "เปิดหน้าสถานะเพื่อตรวจความพร้อมของเว็บไซต์ ระบบบัญชี และบริการบอตก่อนเริ่มแก้ไขการตั้งค่า"],
  ["สอนข้อมูลให้บอต", "วางข้อความที่อนุมัติ อัปโหลดเอกสารที่รองรับ สแกนหน้า HTTPS หรือดูแลแคตตาล็อกสินค้าและบริการแบบมีโครงสร้าง"],
  ["ขอความช่วยเหลือจากทีมงาน", "ผู้ค้าที่เข้าสู่ระบบเปิดหน้าสนับสนุนได้จากทุกหน้าในเวิร์กสเปซ ระบุหน้าและรหัสข้อผิดพลาด แต่ห้ามส่งรหัสผ่านหรือกุญแจลับ"],
  ["เข้าใจความพร้อมก่อนเปิดใช้", "ศูนย์ทดสอบใช้หลักฐานจากเซิร์ฟเวอร์ ผลสีเขียวหมายถึงมีการตั้งค่าและบันทึกการทดสอบที่จำเป็น จึงไม่สามารถติ๊กผ่านเองได้"],
] as const;

export default function HelpPage() {
  const { locale } = usePublicLocale();
  const t = (th: string, en: string) => localeText(locale, th, en);
  const englishGuides = [
    ["Start without technical work", "Choose a business goal, apply a recommended bot template, add business details and test one real customer journey."],
    ["Connect your website", "Copy the verified website code from settings, place it before the closing body tag and use the Test Center to confirm installation."],
    ["Check service status", "Review website, account and bot service availability before changing your configuration."],
    ["Teach the bot", "Add approved text, supported documents, HTTPS pages or a structured product and service catalog."],
    ["Ask the support team", "Signed-in merchants can open contextual support from the workspace. Include the page and error code, but never send passwords or secret keys."],
    ["Understand launch readiness", "The Test Center uses server evidence. A green result means the required configuration and test record exist, so readiness cannot be manually checked off."],
  ] as const;
  const localizedGuides = locale === "th" ? guides : englishGuides;
  return <main className="info-page" id="main-content"><PublicInfoHeader />
    <section className="info-hero"><p>{t("ศูนย์ช่วยเหลือ", "HELP CENTER")}</p><h1>{t("คำตอบที่ชัดเจนทั้งก่อนและหลังสมัคร", "Clear answers before and after signup")}</h1><span>{t("ใช้ขั้นตอนแนะนำ อ่านคู่มือสั้น ๆ หรือติดต่อทีมสนับสนุนจากภายในเวิร์กสเปซ", "Follow guided steps, read short guides or contact support from inside your workspace.")}</span></section>
    <section className="info-content"><div className="info-grid">{localizedGuides.map(([title, copy]) => <article key={title}><h2>{title}</h2><p>{copy}</p></article>)}</div>
      <aside className="info-callout"><div><strong>{t("มีบัญชีแล้วใช่ไหม", "Already have an account?")}</strong><span>{t("เปิดกระดานสนับสนุนตามบริบท เพื่อให้ทีมได้รับข้อมูลเวิร์กสเปซและหน้าปัจจุบันอย่างปลอดภัย", "Open contextual support so the team receives your workspace and current-page context safely.")}</span></div><a className="primary-link" href="/login">{t("เข้าสู่ระบบเพื่อขอความช่วยเหลือ", "Log in for support")}</a></aside>
    </section><PublicFooter />
  </main>;
}
