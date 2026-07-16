"use client";

import { useEffect, useState } from "react";
import type { LegalDocument } from "@djay/shared/legal-documents";

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
  const other = kind === "terms" ? { href: "/privacy", label: "Privacy Notice" } : { href: "/terms", label: "Service Terms" };

  async function load() {
    setStage("loading");
    try {
      const response = await fetch("/public/legal/" + kind, { cache: "no-store" });
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
      <a className="status-brand" href="/"><span className="brand-mark" aria-hidden="true">D</span><strong>DJAY BOT</strong></a>
      <nav aria-label="Public navigation"><a href="/">Create workspace</a><a href="/status">Service status</a></nav>
    </header>
    <section className="legal-hero">
      <p className="step-label">Approved customer document</p>
      <h1 id="legal-title">{stage === "ready" ? document?.title : kind === "terms" ? "Service Terms" : "Privacy Notice"}</h1>
      {document ? <p>{document.summary}</p> : <p>Review the current approved document before creating a workspace.</p>}
    </section>
    <section className="legal-content" aria-labelledby="legal-title" aria-busy={stage === "loading"}>
      {stage === "loading" ? <div className="legal-state" role="status">Loading the current approved document…</div> : null}
      {stage === "error" ? <div className="legal-state error" role="alert"><div><strong>This document is temporarily unavailable.</strong><span>Registration remains paused until the approved version can be reviewed.</span></div><button type="button" onClick={() => void load()}>Try again</button></div> : null}
      {stage === "ready" && document ? <article className="legal-document">
        <div className="legal-meta"><span>Version {document.version}</span><span>Effective {document.effectiveDate}</span></div>
        {document.sections.map((section, index) => <section key={section.heading + index}>
          <h2>{section.heading}</h2>
          {section.paragraphs.map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}
        </section>)}
      </article> : null}
    </section>
    <footer className="status-footer"><span>DJAY Bot</span><a href={other.href}>{other.label}</a><a href="/">Create workspace</a></footer>
  </main>;
}
