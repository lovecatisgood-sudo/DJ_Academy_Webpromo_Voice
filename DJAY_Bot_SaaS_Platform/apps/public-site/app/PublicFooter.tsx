"use client";

import { localeText, usePublicLocale } from "./LocaleBoundary";
import { BrandLockup } from "./PublicHeader";

export function PublicFooter() {
  const { locale } = usePublicLocale();
  return <footer className="public-footer">
    <div><a className="public-brand" href="/" aria-label={localeText(locale, "หน้าแรก DJBOT", "DJBOT home")}><BrandLockup /></a><p>{localeText(locale, "ระบบสนทนาเพื่อช่วยธุรกิจเปลี่ยนความสนใจให้เป็นขั้นตอนถัดไปที่ชัดเจน", "Conversation tools that turn customer interest into a clear next step.")}</p></div>
    <nav aria-label={localeText(locale, "ลิงก์ท้ายเว็บไซต์", "Footer links")}>
      <a href="/pricing">{localeText(locale, "แพ็กเกจ", "Pricing")}</a><a href="/templates">{localeText(locale, "ตัวอย่างใช้งาน", "Use cases")}</a><a href="/help">{localeText(locale, "ช่วยเหลือ", "Help")}</a><a href="/status">{localeText(locale, "สถานะระบบ", "Status")}</a><a href="/terms">{localeText(locale, "ข้อกำหนด", "Terms")}</a><a href="/privacy">{localeText(locale, "ความเป็นส่วนตัว", "Privacy")}</a>
    </nav>
  </footer>;
}
