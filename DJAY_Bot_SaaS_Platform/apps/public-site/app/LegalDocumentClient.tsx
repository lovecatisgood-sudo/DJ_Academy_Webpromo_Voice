"use client";

import { useEffect, useState } from "react";
import type { LegalDocument } from "@djay/shared/legal-documents";
import { BrandLockup } from "./PublicHeader";

type LegalKind = "terms" | "privacy";

function isLegalDocument(value: unknown): value is LegalDocument {
  if (!value || typeof value !== "object") return false;
  const document = value as Partial<LegalDocument>;
  return typeof document.version === "string"
    && typeof document.title === "string"
    && typeof document.effectiveDate === "string"
    && typeof document.summary === "string"
    && Array.isArray(document.sections)
    && document.sections.every((section) => section
      && typeof section.heading === "string"
      && Array.isArray(section.paragraphs)
      && section.paragraphs.every((paragraph) => typeof paragraph === "string"));
}

export function LegalDocumentClient({ kind }: { kind: LegalKind }) {
  const [stage, setStage] = useState<"loading" | "ready" | "error">("loading");
  const [document, setDocument] = useState<LegalDocument | null>(null);
  const other = kind === "terms" ? { href: "/privacy", label: "ประกาศความเป็นส่วนตัว" } : { href: "/terms", label: "ข้อกำหนดบริการ" };

  async function load() {
    setStage("loading");
    try {
      const locale = /(?:^|;\s*)djay-locale=en(?:;|$)/.test(globalThis.document.cookie) ? "en" : "th";
      const response = await fetch(`/public/legal/${kind}?lang=${locale}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok || body.status !== "available" || !isLegalDocument(body.document)) throw new Error("legal_unavailable");
      setDocument(body.document);
      setStage("ready");
    } catch {
      setDocument(null);
      setStage("error");
    }
  }

  useEffect(() => { void load(); }, [kind]);

  return <main className="legal-page">
    <header className="legal-header">
      <a className="status-brand" href="/" aria-label="หน้าแรก DJBOT"><BrandLockup /></a>
      <nav aria-label="เมนูสาธารณะ"><a href="/">สร้างพื้นที่ทำงาน</a><a href="/status">สถานะบริการ</a></nav>
    </header>
    <section className="legal-hero">
      <p className="step-label">เอกสารลูกค้าที่อนุมัติแล้ว</p>
      <h1 id="legal-title">{stage === "ready" ? document?.title : kind === "terms" ? "ข้อกำหนดบริการ" : "ประกาศความเป็นส่วนตัว"}</h1>
      {document ? <p>{document.summary}</p> : <p>โปรดตรวจสอบเอกสารฉบับอนุมัติปัจจุบันก่อนสร้างพื้นที่ทำงาน</p>}
    </section>
    <section className="legal-content" aria-labelledby="legal-title" aria-busy={stage === "loading"}>
      {stage === "loading" ? <div className="legal-state" role="status">กำลังโหลดเอกสารฉบับอนุมัติปัจจุบัน...</div> : null}
      {stage === "error" ? <div className="legal-state error" role="alert"><div><strong>เอกสารนี้ไม่พร้อมใช้งานชั่วคราว</strong><span>การสมัครจะหยุดไว้จนกว่าจะตรวจสอบเวอร์ชันที่อนุมัติได้ (Registration remains paused.)</span></div><button type="button" onClick={() => void load()}>ลองอีกครั้ง</button></div> : null}
      {stage === "ready" && document ? <article className="legal-document">
        <div className="legal-meta"><span>เวอร์ชัน {document.version}</span><span>มีผลวันที่ {document.effectiveDate}</span></div>
        {document.sections.map((section, index) => <section key={section.heading + index}>
          <h2>{section.heading}</h2>
          {section.paragraphs.map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}
        </section>)}
      </article> : null}
    </section>
    <footer className="status-footer"><span>DJAY Bot</span><a href={other.href}>{other.label}</a><a href="/">สร้างพื้นที่ทำงาน</a></footer>
  </main>;
}
