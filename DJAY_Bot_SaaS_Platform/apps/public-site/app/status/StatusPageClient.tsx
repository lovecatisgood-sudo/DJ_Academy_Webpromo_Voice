"use client";

import { useEffect, useState } from "react";

type PublicStatus = {
  asOf: string;
  overall: "operational" | "degraded" | "outage" | "unknown";
  services: Array<{
    label: string;
    status: "operational" | "degraded" | "outage" | "unknown";
    lastUpdatedAt: string | null;
  }>;
};

const overallCopy = {
  operational: ["All systems operational", "Live evidence is within every published operating objective."],
  degraded: ["Some systems are degraded", "The operations team is reviewing one or more service objectives."],
  outage: ["Service interruption", "One or more services are currently below the minimum availability threshold."],
  unknown: ["Status evidence unavailable", "We cannot confirm current service health. Treat availability as unverified."],
} as const;

export default function StatusPageClient() {
  const [stage, setStage] = useState<"loading" | "ready" | "error">("loading");
  const [status, setStatus] = useState<PublicStatus | null>(null);

  async function load() {
    setStage("loading");
    try {
      const response = await fetch("/public/status", { cache: "no-store" });
      if (!response.ok) throw new Error("status_unavailable");
      setStatus((await response.json()).status);
      setStage("ready");
    } catch {
      setStatus(null);
      setStage("error");
    }
  }

  useEffect(() => { void load(); }, []);
  const overall = status?.overall ?? "unknown";
  const copy = overallCopy[overall];

  return (
    <main className="status-page">
      <header className="status-header">
        <a className="status-brand" href="/" aria-label="DJAY Bot home"><span className="brand-mark" aria-hidden="true">D</span><strong>DJAY BOT</strong></a>
        <nav aria-label="Account links"><a href="/login">Sign in</a><a className="status-primary-link" href="/">Create workspace</a></nav>
      </header>
      <section className={`status-hero status-${overall}`} aria-labelledby="status-title">
        <div>
          <p className="step-label">Service status</p>
          <h1 id="status-title">{stage === "loading" ? "Checking current systems…" : stage === "error" ? overallCopy.unknown[0] : copy[0]}</h1>
          <p>{stage === "error" ? overallCopy.unknown[1] : copy[1]}</p>
        </div>
        <span className="overall-status" role="status">{stage === "loading" ? "Checking" : stage === "error" ? "Unknown" : overall}</span>
      </section>
      <section className="status-content" aria-labelledby="services-title">
        <div className="status-section-heading"><div><p>Customer-facing systems</p><h2 id="services-title">Current availability</h2></div>{status ? <small>Updated {new Date(status.asOf).toLocaleString()}</small> : null}</div>
        {stage === "error" ? <div className="status-error" role="alert"><strong>Current evidence could not be loaded.</strong><span>No operational claim is being made.</span><button type="button" onClick={() => void load()}>Try again</button></div> : null}
        <div className="service-status-grid" aria-live="polite">
          {stage === "loading" ? Array.from({ length: 7 }, (_, index) => <div className="service-status-card loading" key={index}><span>Checking service</span><strong>—</strong></div>) : null}
          {stage === "ready" ? status?.services.map((service) => <article className={`service-status-card ${service.status}`} key={service.label}>
            <div><span className="status-dot" aria-hidden="true" /><strong>{service.label}</strong></div>
            <span>{service.status}</span>
            <small>{service.lastUpdatedAt ? `Evidence ${new Date(service.lastUpdatedAt).toLocaleString()}` : "No current evidence"}</small>
          </article>) : null}
        </div>
        <div className="status-disclosure"><strong>Clear, provider-neutral updates</strong><span>This page reports the DJAY Bot services customers use. It does not expose infrastructure vendors, internal routing, customer data, or security-sensitive incident details.</span></div>
      </section>
      <footer className="status-footer"><span>DJAY Bot service status</span><a href="/">Workspace registration</a><a href="/login">Account sign in</a></footer>
    </main>
  );
}
