"use client";

import { useEffect, useId, useState } from "react";
import Image from "next/image";
import { localeText, usePublicLocale } from "./LocaleBoundary";

export function BrandLockup() {
  return <span className="brand-lockup-inner">
    <Image className="brand-logo-mark" src="/djbot-blue-wordmark.png" alt="DJay Bot by DJAI" width={1322} height={748} priority sizes="112px" />
  </span>;
}

export function PublicHeader({ variant = "information" }: Readonly<{ variant?: "landing" | "information" }>) {
  const [open, setOpen] = useState(false);
  const navigationId = useId();
  const { locale, chooseLocale } = usePublicLocale();
  const landing = variant === "landing";
  const links = [
    { href: landing ? "#solutions" : "/#solutions", th: "โซลูชัน", en: "Solutions" },
    { href: landing ? "#how-it-works" : "/#how-it-works", th: "วิธีทำงาน", en: "How it works" },
    { href: "/templates", th: "ตัวอย่างใช้งาน", en: "Use cases" },
    { href: "/pricing", th: "แพ็กเกจ", en: "Pricing" },
    { href: "/help", th: "ช่วยเหลือ", en: "Help" },
  ];

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return <header className="public-header">
    <a className="skip-link public-skip-link" href="#main-content">{localeText(locale, "ข้ามไปยังเนื้อหาหลัก", "Skip to main content")}</a>
    <a className="public-brand" href="/" aria-label={localeText(locale, "หน้าแรก DJBOT", "DJBOT home")}><BrandLockup /></a>
    <button type="button" className="public-menu-toggle" aria-expanded={open} aria-controls={navigationId} onClick={() => setOpen((current) => !current)}>
      {open ? localeText(locale, "ปิด", "Close") : localeText(locale, "เมนู", "Menu")}
    </button>
    <nav id={navigationId} className={open ? "public-navigation open" : "public-navigation"} aria-label={localeText(locale, "เมนูหลัก", "Main navigation")}>
      {links.map((link) => <a href={link.href} key={link.href} onClick={() => setOpen(false)}>{localeText(locale, link.th, link.en)}</a>)}
      <a href="/login" onClick={() => setOpen(false)}>{localeText(locale, "เข้าสู่ระบบ", "Log in")}</a>
      <button className="language-switch" type="button" onClick={() => chooseLocale(locale === "th" ? "en" : "th")} lang={locale === "th" ? "en" : "th"} aria-label={localeText(locale, "เปลี่ยนเป็นภาษาอังกฤษ", "Switch to Thai")}>
        {locale === "th" ? "EN" : "ไทย"}
      </button>
      <a className="nav-cta" href="/pricing" onClick={() => setOpen(false)}>{localeText(locale, "ดูแพ็กเกจ", "View packages")}</a>
    </nav>
  </header>;
}
