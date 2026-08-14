"use client";

import Image from "next/image";
import { useTenantLocale } from "./LocaleBoundary";

export function BrandLockup() {
  return <span className="brand-lockup">
    <Image className="brand-logo" src="/djbot-blue-wordmark.png" alt="DJay Bot by DJAI" width={1322} height={748} priority sizes="96px" />
  </span>;
}

export function LocaleSwitch({ className = "" }: Readonly<{ className?: string }>) {
  const { locale, chooseLocale } = useTenantLocale();
  const next = locale === "th" ? "en" : "th";
  return <button
    className={`language-switch ${className}`.trim()}
    type="button"
    onClick={() => chooseLocale(next)}
    lang={next}
    aria-label={locale === "th" ? "เปลี่ยนเป็นภาษาอังกฤษ" : "Switch to Thai"}
  >
    {locale === "th" ? "EN" : "ไทย"}
  </button>;
}
