"use client";

import { useEffect, useState } from "react";
import { currentIntlLocale } from "@djay/shared";

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
  operational: ["ทุกระบบทำงานตามปกติ", "หลักฐานการทำงานล่าสุดอยู่ในเป้าหมายการดำเนินงานที่เผยแพร่ไว้"],
  degraded: ["บางระบบมีประสิทธิภาพลดลง", "ทีมปฏิบัติการกำลังตรวจสอบเป้าหมายบริการอย่างน้อยหนึ่งรายการ"],
  outage: ["บริการขัดข้อง", "บริการอย่างน้อยหนึ่งรายการต่ำกว่าเกณฑ์ความพร้อมใช้งานขั้นต่ำในขณะนี้"],
  unknown: ["ไม่มีหลักฐานสถานะบริการ", "เรายืนยันสุขภาพบริการปัจจุบันไม่ได้ โปรดถือว่าความพร้อมใช้งานยังไม่ได้รับการยืนยัน"],
} as const;

const statusLabels: Record<PublicStatus["overall"], string> = {
  operational: "ทำงานปกติ",
  degraded: "ประสิทธิภาพลดลง",
  outage: "ขัดข้อง",
  unknown: "ไม่ทราบสถานะ",
};

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
        <a className="status-brand" href="/" aria-label="หน้าแรก DJAY Bot"><span className="brand-mark" aria-hidden="true">D</span><strong>DJAY BOT</strong></a>
        <nav aria-label="ลิงก์บัญชี"><a href="/login">เข้าสู่ระบบ</a><a className="status-primary-link" href="/">สร้างพื้นที่ทำงาน</a></nav>
      </header>
      <section className={`status-hero status-${overall}`} aria-labelledby="status-title">
        <div>
          <p className="step-label">สถานะบริการ</p>
          <h1 id="status-title">{stage === "loading" ? "กำลังตรวจสอบระบบปัจจุบัน..." : stage === "error" ? overallCopy.unknown[0] : copy[0]}</h1>
          <p>{stage === "error" ? overallCopy.unknown[1] : copy[1]}</p>
        </div>
        <span className="overall-status" role="status">{stage === "loading" ? "กำลังตรวจสอบ" : stage === "error" ? "ไม่ทราบสถานะ" : statusLabels[overall]}</span>
      </section>
      <section className="status-content" aria-labelledby="services-title">
        <div className="status-section-heading"><div><p>ระบบที่ลูกค้าใช้งาน</p><h2 id="services-title">ความพร้อมใช้งานปัจจุบัน</h2></div>{status ? <small>อัปเดต {new Date(status.asOf).toLocaleString(currentIntlLocale())}</small> : null}</div>
        {stage === "error" ? <div className="status-error" role="alert"><strong>โหลดหลักฐานปัจจุบันไม่ได้</strong><span>จึงยังไม่มีการยืนยันสถานะการดำเนินงาน</span><button type="button" onClick={() => void load()}>ลองอีกครั้ง</button></div> : null}
        <div className="service-status-grid" aria-live="polite">
          {stage === "loading" ? Array.from({ length: 7 }, (_, index) => <div className="service-status-card loading" key={index}><span>กำลังตรวจสอบบริการ</span><strong>—</strong></div>) : null}
          {stage === "ready" ? status?.services.map((service) => <article className={`service-status-card ${service.status}`} key={service.label}>
            <div><span className="status-dot" aria-hidden="true" /><strong>{service.label}</strong></div>
            <span>{statusLabels[service.status]}</span>
            <small>{service.lastUpdatedAt ? `หลักฐาน ${new Date(service.lastUpdatedAt).toLocaleString(currentIntlLocale())}` : "ยังไม่มีหลักฐานปัจจุบัน"}</small>
          </article>) : null}
        </div>
        <div className="status-disclosure"><strong>อัปเดตชัดเจนและไม่ผูกกับผู้ให้บริการรายใด</strong><span>หน้านี้รายงานบริการ DJAY Bot ที่ลูกค้าใช้งาน โดยไม่เปิดเผยผู้ให้บริการโครงสร้างพื้นฐาน เส้นทางภายใน ข้อมูลลูกค้า หรือรายละเอียดเหตุการณ์ที่อ่อนไหวด้านความปลอดภัย</span></div>
      </section>
      <footer className="status-footer"><span>สถานะบริการ DJAY Bot</span><a href="/">สมัครพื้นที่ทำงาน</a><a href="/login">เข้าสู่ระบบบัญชี</a></footer>
    </main>
  );
}
