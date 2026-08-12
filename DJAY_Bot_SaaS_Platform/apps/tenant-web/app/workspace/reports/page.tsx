"use client";

import { currentIntlLocale } from "@djay/shared";
import { useEffect, useMemo, useState } from "react";
import { WorkspacePageLoadError, WorkspaceSessionLoadError } from "../WorkspaceAccess";
import { WorkspaceSidebar } from "../WorkspaceSidebar";
import { WorkspaceSupportBanner } from "../WorkspaceSupportBanner";
import { useWorkspaceSession } from "../useWorkspaceSession";

type Report = {
  asOf: string; days: number; productKey: string | null;
  summary: { conversations: number; leads: number; appointments: number; callbacks: number; completedAppointments: number; completedCallbacks: number };
  values: Array<{ currency: string; amountMinor: string; events: number }>;
  outcomes: Array<{ status: string; leads: number }>;
  products: Array<{ productKey: string; conversations: number }>;
  daily: Array<{ date: string; conversations: number; leads: number; appointments: number; callbacks: number }>;
};

const products = [["all", "ทุกบอท"], ["flowbot", "FlowBot"], ["ai_chat", "แชต AI"], ["voice", "ระบบเสียง"]] as const;
const summaryLabels: Readonly<Record<keyof Report["summary"], string>> = {
  conversations: "การสนทนา", leads: "ผู้สนใจ", appointments: "คำขอนัดหมาย", callbacks: "คำขอติดต่อกลับ",
  completedAppointments: "นัดหมายเสร็จสิ้น", completedCallbacks: "ติดต่อกลับเสร็จสิ้น",
};

export default function ReportsPage() {
  const session = useWorkspaceSession();
  const [days, setDays] = useState(30); const [product, setProduct] = useState("all");
  const [report, setReport] = useState<Report | null>(null); const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  const workspace = useMemo(() => session.workspaces.find((item) => item.tenantId === session.selectedTenantId), [session]);
  const maxDaily = useMemo(() => Math.max(1, ...(report?.daily.map((item) => item.conversations + item.leads + item.appointments + item.callbacks) ?? [1])), [report]);
  const query = `days=${days}&product=${encodeURIComponent(product)}`;

  async function load() {
    setLoading(true);
    try {
      const response = await fetch(`/tenant/reports?${query}`, { cache: "no-store" });
      if (!response.ok) throw new Error("reports_unavailable");
      setReport((await response.json()).report); setLoadError(false);
    } catch { setLoadError(true); }
    finally { setLoading(false); }
  }
  useEffect(() => { if (session.selectedTenantId) void load(); }, [session.selectedTenantId, days, product]);

  if (session.error) return <WorkspaceSessionLoadError onRetry={() => window.location.reload()} />;
  if (session.loading || !session.selectedTenantId) return <main className="workspace-loading">กำลังโหลดรายงาน...</main>;
  if (loadError && !report) return <WorkspacePageLoadError active="reports" title="รายงาน" resource="cross-bot operations reporting" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId} onSelect={(id) => void session.selectWorkspace(id)} onLogout={() => void session.logout()} onRetry={() => void load()} />;
  return <main className="workspace-shell"><WorkspaceSidebar active="reports" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId} onSelect={(id) => void session.selectWorkspace(id)} onLogout={() => void session.logout()} />
    <section id="workspace-main" className="workspace-main" tabIndex={-1}><WorkspaceSupportBanner tenantId={session.selectedTenantId} />
      <header className="workspace-header"><div><p>ผลลัพธ์จากข้อมูลจริง</p><h1>รายงานข้ามทุกบอท</h1></div><span data-no-localize className="role-label">{workspace?.businessName}</span></header>
      <section className="tool-band report-controls"><div><p className="band-copy">ตัวเลขมาจากรายการถาวรในเวิร์กสเปซ มูลค่าแสดงเฉพาะดีลที่ร้านค้ายืนยันแล้ว และไม่ใช่การประมาณรายได้จากบอท</p><div className="report-filter-row"><label>ช่วงเวลา<select value={days} onChange={(event) => setDays(Number(event.target.value))}><option value={7}>7 วัน</option><option value={30}>30 วัน</option><option value={90}>90 วัน</option><option value={365}>365 วัน</option></select></label><label>ผลิตภัณฑ์<select value={product} onChange={(event) => setProduct(event.target.value)}>{products.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label><a className="secondary-link" href={`/tenant/reports?${query}&format=csv`}>ส่งออกตัวกรอง CSV</a></div></div></section>
      {loading ? <div className="workspace-inline-state" aria-live="polite">กำลังคำนวณรายงานจากตัวกรอง...</div> : null}
      {loadError ? <div className="workspace-inline-state error" role="alert">รีเฟรชรายงานไม่สำเร็จ ข้อมูลเดิมยังแสดงอยู่ <button type="button" onClick={() => void load()}>ลองใหม่</button></div> : null}
      {report ? <>
        <section className="report-metrics" aria-label="ตัวชี้วัดหลัก">{(Object.entries(report.summary) as Array<[keyof Report["summary"], number]>).map(([key, value]) => <div key={key}><span>{summaryLabels[key]}</span><strong>{value.toLocaleString(currentIntlLocale())}</strong></div>)}</section>
        <section className="tool-band"><div className="band-heading"><div><p>กิจกรรมตามวัน</p><h2>แนวโน้มการดำเนินงาน</h2></div><span>{report.daily.length} วันที่มีกิจกรรม</span></div><div className="report-trend" role="list" aria-label="กิจกรรมรายวัน">{report.daily.map((item) => { const total = item.conversations + item.leads + item.appointments + item.callbacks; return <div role="listitem" key={item.date}><time dateTime={item.date}>{new Date(`${item.date}T00:00:00Z`).toLocaleDateString(currentIntlLocale(), { month: "short", day: "numeric", timeZone: "UTC" })}</time><span className="report-bar-track"><span style={{ width: `${Math.max(3, total / maxDaily * 100)}%` }} /></span><strong>{total}</strong><small>สนทนา {item.conversations} · ผู้สนใจ {item.leads} · นัดหมาย {item.appointments} · ติดต่อกลับ {item.callbacks}</small></div>; })}{!report.daily.length ? <p className="empty-row">ยังไม่มีกิจกรรมในตัวกรองนี้</p> : null}</div></section>
        <div className="report-split"><section className="tool-band"><div className="band-heading"><div><p>ขั้นตอนงานขาย</p><h2>สถานะผู้สนใจ</h2></div></div><div className="data-table">{report.outcomes.map((item) => <div className="data-row" key={item.status}><strong>{item.status.replaceAll("_", " ")}</strong><span>{item.leads}</span></div>)}{!report.outcomes.length ? <p className="empty-row">ไม่มีผู้สนใจ</p> : null}</div></section><section className="tool-band"><div className="band-heading"><div><p>หลักฐานจากร้านค้า</p><h2>มูลค่าดีลที่ยืนยันแล้ว</h2></div></div><div className="data-table">{report.values.map((item) => <div className="data-row" key={item.currency}><strong>{new Intl.NumberFormat(currentIntlLocale(), { style: "currency", currency: item.currency }).format(Number(item.amountMinor) / 100)}</strong><span>{item.events} ดีล</span></div>)}{!report.values.length ? <p className="empty-row">ยังไม่มีมูลค่าดีลที่ร้านค้ายืนยันในตัวกรองนี้</p> : null}</div></section></div>
        <p className="field-help">อัปเดตล่าสุด {new Date(report.asOf).toLocaleString(currentIntlLocale())} · การส่งออกใช้ช่วงเวลาและผลิตภัณฑ์เดียวกับหน้าจอ</p>
      </> : null}
    </section></main>;
}
