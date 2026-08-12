"use client";

import { useEffect, useId, useState } from "react";

const landingLinks = [
  { href: "#features", label: "ฟีเจอร์" },
  { href: "#benefits", label: "ประโยชน์" },
  { href: "/templates", label: "เทมเพลต" },
  { href: "/pricing", label: "แพ็กเกจ" },
  { href: "/help", label: "ช่วยเหลือ" },
  { href: "/login", label: "เข้าสู่ระบบ" },
] as const;

const informationLinks = [
  { href: "/templates", label: "เทมเพลต" },
  { href: "/pricing", label: "แพ็กเกจ" },
  { href: "/help", label: "ศูนย์ช่วยเหลือ" },
  { href: "/status", label: "สถานะระบบ" },
  { href: "/login", label: "เข้าสู่ระบบ" },
] as const;

export function PublicHeader({ variant = "information" }: Readonly<{ variant?: "landing" | "information" }>) {
  const [open, setOpen] = useState(false);
  const navigationId = useId();
  const landing = variant === "landing";
  const links = landing ? landingLinks : informationLinks;

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <header className={landing ? "landing-nav public-header" : "info-header public-header"}>
      <a className="skip-link public-skip-link" href="#main-content">ข้ามไปยังเนื้อหาหลัก</a>
      <a className="brand-lockup public-brand" href="/">
        <span className="brand-mark" aria-hidden="true">D</span>
        <span>DJBOT</span>
      </a>
      <button
        type="button"
        className="public-menu-toggle"
        aria-expanded={open}
        aria-controls={navigationId}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? "ปิด" : "เมนู"}
      </button>
      <nav id={navigationId} className={open ? "public-navigation open" : "public-navigation"} aria-label={landing ? "เมนูหลัก" : "เมนูข้อมูลสาธารณะ"}>
        {links.map((link) => <a href={link.href} key={link.href} onClick={() => setOpen(false)}>{link.label}</a>)}
        {landing ? <a className="nav-cta" href="#start" onClick={() => setOpen(false)}>สร้างพื้นที่ทำงาน</a> : null}
      </nav>
    </header>
  );
}
