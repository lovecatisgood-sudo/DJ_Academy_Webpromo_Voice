"use client";

import { currentIntlLocale, safeMutationFetch } from "@djay/shared";
import { use, useEffect, useRef, useState, type FormEvent } from "react";
import { PlatformNavigation } from "./PlatformNavigation";

type PlatformUser = { id: string; displayName: string; role: string };
type TenantOption = { id: string; businessName: string };
type OperatorOption = { id: string; displayName: string; role: string };
type IncidentStatus = "open" | "investigating" | "monitoring" | "resolved";
type Incident = {
  id: string; tenantId: string; businessName: string; category: string; severity: string;
  affectedProduct: string; status: IncidentStatus; summary: string; ownerPlatformUserId: string;
  openedByPlatformUserId: string; openedAt: string; updatedAt: string; resolvedAt: string | null;
  history: Array<{ id: string; eventKind: "opened" | "status_changed" | "assigned"; fromStatus: string | null; toStatus: string; note: string; changedAt: string }>;
};
type Board = { incidents: Incident[]; tenants: TenantOption[]; operators: OperatorOption[] };

const statuses = ["open", "investigating", "monitoring", "resolved"] as const;
const statusLabels: Record<IncidentStatus, string> = {
  open: "เปิดใหม่", investigating: "กำลังตรวจสอบ", monitoring: "เฝ้าติดตาม", resolved: "แก้ไขแล้ว",
};
const categoryLabels: Record<string, string> = {
  provisioning: "การจัดเตรียม", onboarding: "การเริ่มใช้งาน", deployment: "การติดตั้ง",
  usage: "การใช้งาน", billing: "การเรียกเก็บเงิน", provider: "ผู้ให้บริการ", queue: "คิวงาน",
  support: "การสนับสนุน", privacy: "ความเป็นส่วนตัว", security: "ความปลอดภัย", other: "อื่น ๆ",
};
const productLabels: Record<string, string> = { platform: "แพลตฟอร์ม", flowbot: "Flow Bot", ai_chat: "AI Text Bot", voice: "AI Voice Bot" };

function nextStatuses(status: IncidentStatus): IncidentStatus[] {
  if (status === "open") return ["investigating"];
  if (status === "investigating") return ["monitoring", "resolved"];
  if (status === "monitoring") return ["investigating", "resolved"];
  return [];
}

function IncidentCard({ incident, operators, working, expanded, onToggle, onTransition, onAssign }: Readonly<{
  incident: Incident; operators: OperatorOption[]; working: boolean; expanded: boolean;
  onToggle: () => void; onTransition: (event: FormEvent<HTMLFormElement>) => void;
  onAssign: (event: FormEvent<HTMLFormElement>) => void;
}>) {
  const next = nextStatuses(incident.status);
  return <article className={`platform-row tenant-incident-row severity-${incident.severity}`} role="listitem">
    <div><strong data-no-localize>{incident.businessName}</strong><span>{categoryLabels[incident.category] || incident.category} · {productLabels[incident.affectedProduct] || incident.affectedProduct}</span><span data-no-localize>{incident.summary}</span></div>
    <div><strong>{incident.severity === "critical" ? "วิกฤต" : incident.severity === "major" ? "ร้ายแรง" : "เล็กน้อย"}</strong><span>{statusLabels[incident.status]}</span></div>
    <div><strong>อัปเดตล่าสุด</strong><span>{new Date(incident.updatedAt).toLocaleString(currentIntlLocale())}</span><a href={`/tenants/${encodeURIComponent(incident.tenantId)}`}>เปิด Tenant 360</a></div>
    <div className="row-actions">{next.length ? <button type="button" disabled={working} onClick={onToggle}>อัปเดตสถานะ</button> : <span>ปิดแล้ว</span>}</div>
    {incident.status !== "resolved" ? <form className="incident-assignment-form" onSubmit={onAssign}>
      <label>ผู้รับผิดชอบคนใหม่<select name="ownerPlatformUserId" required defaultValue=""><option value="" disabled>เลือกผู้รับผิดชอบคนอื่น</option>{operators.filter((operator) => operator.id !== incident.ownerPlatformUserId).map((operator) => <option value={operator.id} key={`${operator.id}:${operator.role}`} data-no-localize>{operator.displayName} · {operator.role.replaceAll("platform_", "")}</option>)}</select></label>
      <label>เหตุผลการส่งมอบ<input name="note" minLength={12} maxLength={1000} required placeholder="ระบุเหตุผลและสิ่งที่ผู้รับผิดชอบคนใหม่ต้องดำเนินการ" /></label>
      <button type="submit" disabled={working || operators.every((operator) => operator.id === incident.ownerPlatformUserId)}>ส่งมอบ</button>
    </form> : null}
    {expanded ? <form className="incident-transition-form" onSubmit={onTransition}>
      <label>สถานะถัดไป<select name="status" required>{next.map((item) => <option value={item} key={item}>{statusLabels[item]}</option>)}</select></label>
      <label>หลักฐานการดำเนินการ<textarea name="note" minLength={12} maxLength={1000} required placeholder="ระบุสิ่งที่ตรวจสอบ แก้ไข หรือยืนยันแล้ว โดยไม่ใส่ข้อมูลส่วนบุคคล" /></label>
      <div><button type="submit" disabled={working}>บันทึกสถานะ</button><button className="outline-button" type="button" disabled={working} onClick={onToggle}>ยกเลิก</button></div>
    </form> : null}
    <details><summary>ประวัติ {incident.history.length} รายการ</summary><ol>{incident.history.map((item) => <li key={item.id}><strong>{item.eventKind === "assigned" ? "ส่งมอบผู้รับผิดชอบ" : statusLabels[item.toStatus as IncidentStatus] || item.toStatus}</strong><span data-no-localize>{item.note}</span><small>{new Date(item.changedAt).toLocaleString(currentIntlLocale())}</small></li>)}</ol></details>
  </article>;
}

export default function TenantIncidentBoard({ searchParams }: Readonly<{
  searchParams: Promise<{ tenantId?: string; status?: string }>;
}>) {
  const query = use(searchParams);
  const tenantId = query.tenantId || "";
  const status = statuses.includes(query.status as IncidentStatus) ? query.status as IncidentStatus : "";
  const [user, setUser] = useState<PlatformUser | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [stage, setStage] = useState<"loading" | "ready" | "denied" | "error">("loading");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [transitioningId, setTransitioningId] = useState<string | null>(null);
  const openIdempotencyKey = useRef<string | null>(null);

  async function load(clearFeedback = true) {
    setStage("loading"); if (clearFeedback) setMessage("");
    const params = new URLSearchParams();
    if (tenantId) params.set("tenantId", tenantId);
    if (status) params.set("status", status);
    try {
      const [meResponse, boardResponse] = await Promise.all([
        fetch("/platform/me", { cache: "no-store" }),
        fetch(`/platform/incidents${params.size ? `?${params}` : ""}`, { cache: "no-store" }),
      ]);
      if ([401, 403, 404].includes(meResponse.status) || [401, 403, 404].includes(boardResponse.status)) {
        setUser(null); setBoard(null); setStage("denied"); return;
      }
      if (!meResponse.ok || !boardResponse.ok) throw new Error("incident_board_unavailable");
      const me = await meResponse.json(); const result = await boardResponse.json();
      setUser(me.user); setBoard(result.board); setStage("ready");
    } catch { setStage("error"); }
  }

  useEffect(() => { void load(); }, [tenantId, status]);

  async function submit(command: Record<string, unknown>, success: string) {
    setWorking(true); setMessage("");
    const response = await safeMutationFetch("/platform/incidents", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command),
    });
    setWorking(false);
    if (!response.ok) {
      setMessage(response.status === 409 ? "สถานะเปลี่ยนไปแล้ว โปรดโหลดใหม่และตรวจสอบประวัติ" : "บันทึกไม่สำเร็จ ไม่มีสถานะใดถูกเปลี่ยน โปรดลองอีกครั้ง");
      return false;
    }
    setMessage(success); setTransitioningId(null); await load(false); return true;
  }

  async function openIncident(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget; const data = new FormData(form);
    openIdempotencyKey.current ||= crypto.randomUUID();
    const ok = await submit({ command: "open", tenantId: data.get("tenantId"), category: data.get("category"),
      severity: data.get("severity"), affectedProduct: data.get("affectedProduct"), summary: data.get("summary"),
      idempotencyKey: openIdempotencyKey.current }, "เปิดเหตุขัดข้องและบันทึกหลักฐานแล้ว");
    if (ok) { form.reset(); openIdempotencyKey.current = null; }
  }

  async function transition(event: FormEvent<HTMLFormElement>, incidentId: string) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    await submit({ command: "transition", incidentId, status: data.get("status"), note: data.get("note") }, "อัปเดตสถานะและประวัติแบบแก้ไขไม่ได้แล้ว");
  }

  async function assign(event: FormEvent<HTMLFormElement>, incidentId: string) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    await submit({ command: "assign", incidentId, ownerPlatformUserId: data.get("ownerPlatformUserId"), note: data.get("note") }, "ส่งมอบผู้รับผิดชอบและบันทึกหลักฐานแล้ว");
  }

  async function logout() { await safeMutationFetch("/platform/auth/logout", { method: "POST" }); window.location.assign("/"); }

  if (stage === "loading") return <main className="platform-loading">กำลังโหลดกระดานเหตุขัดข้องที่ได้รับอนุญาต…</main>;
  if (stage === "denied") return <main><section className="platform-session-error" role="alert"><p>จำกัดสิทธิ์</p><h1>ไม่พบกระดานเหตุขัดข้องนี้</h1><span>ใช้บัญชีเจ้าของแพลตฟอร์ม ทีมสนับสนุน หรือปฏิบัติการ AI ที่ได้รับสิทธิ์</span><a className="secondary-command" href="/">กลับไปเข้าสู่ระบบ</a></section></main>;
  if (stage === "error" || !user || !board) return <main><section className="platform-session-error" role="alert"><p>ไม่พร้อมใช้งานชั่วคราว</p><h1>โหลดเหตุขัดข้องไม่สำเร็จ</h1><span>ไม่มีข้อมูลหรือสถานะใดถูกเปลี่ยน</span><button type="button" onClick={() => void load()}>ลองใหม่</button></section></main>;

  return <main className="platform-shell"><aside><div className="platform-brand"><span className="mark">D</span><strong>DJAY BOT</strong></div><p>ระบบจัดการแพลตฟอร์ม</p><PlatformNavigation role={user.role} activeArea="incidents" /><button className="quiet-button" type="button" onClick={() => void logout()}>ออกจากระบบ</button></aside>
    <section className="platform-content incident-board"><header><div><p>Merchant impact · หลักฐานภายใน</p><h1>เหตุขัดข้องตามลูกค้า</h1></div><span><span data-no-localize>{user.displayName}</span><small>{user.role.replaceAll("_", " ")}</small></span></header>
      <div className="tenant-360-notice"><strong>บันทึกเฉพาะข้อเท็จจริงด้านปฏิบัติการ</strong><span>ห้ามใส่รหัสผ่าน secret เนื้อหาสนทนา ข้อมูลติดต่อ หรือข้อมูลส่วนบุคคลของลูกค้าปลายทาง</span></div>
      {message ? <p className="platform-feedback" role="status">{message}</p> : null}
      <section className="subscription-band incident-filter-band"><div><p>ตัวกรองที่ตรวจสอบได้</p><h2>มุมมองคิวปัจจุบัน</h2></div><form method="get"><label>ลูกค้า<select name="tenantId" defaultValue={tenantId}><option value="">ลูกค้าทั้งหมด</option>{board.tenants.map((tenant) => <option value={tenant.id} key={tenant.id} data-no-localize>{tenant.businessName}</option>)}</select></label><label>สถานะ<select name="status" defaultValue={status}><option value="">ทุกสถานะ</option>{statuses.map((item) => <option value={item} key={item}>{statusLabels[item]}</option>)}</select></label><button type="submit">ใช้ตัวกรอง</button><a className="secondary-command" href="/operations/incidents">ล้างตัวกรอง</a></form></section>
      <section className="subscription-band"><div><p>เปิดเหตุขัดข้อง</p><h2>ผูกผลกระทบกับลูกค้าอย่างชัดเจน</h2></div><form className="incident-create-form" onSubmit={openIncident}><label>ลูกค้า<select name="tenantId" required defaultValue={tenantId}><option value="" disabled>เลือกลูกค้า</option>{board.tenants.map((tenant) => <option value={tenant.id} key={tenant.id} data-no-localize>{tenant.businessName}</option>)}</select></label><label>หมวดหมู่<select name="category" defaultValue="deployment">{Object.entries(categoryLabels).map(([key, value]) => <option value={key} key={key}>{value}</option>)}</select></label><label>ผลิตภัณฑ์<select name="affectedProduct" defaultValue="platform">{Object.entries(productLabels).map(([key, value]) => <option value={key} key={key}>{value}</option>)}</select></label><label>ความรุนแรง<select name="severity" defaultValue="major"><option value="minor">เล็กน้อย</option><option value="major">ร้ายแรง</option><option value="critical">วิกฤต</option></select></label><label className="incident-summary-field">สรุปผลกระทบภายใน<input name="summary" minLength={12} maxLength={500} required placeholder="ระบุสิ่งที่ลูกค้าทำไม่ได้และขอบเขตผลกระทบ โดยไม่ใส่ข้อมูลส่วนบุคคล" /></label><button type="submit" disabled={working || !board.tenants.length}>เปิดเหตุขัดข้อง</button></form></section>
      <section className="subscription-band"><div><p>{board.incidents.length} รายการ</p><h2>คิวตามความรุนแรงและการอัปเดตล่าสุด</h2></div><div className="platform-table incident-ledger" role="list" aria-label="เหตุขัดข้องตามลูกค้า">{board.incidents.map((incident) => <IncidentCard incident={incident} operators={board.operators} working={working} expanded={transitioningId === incident.id} onToggle={() => setTransitioningId(transitioningId === incident.id ? null : incident.id)} onTransition={(event) => void transition(event, incident.id)} onAssign={(event) => void assign(event, incident.id)} key={incident.id} />)}{!board.incidents.length ? <p className="empty-row" role="listitem">ไม่พบเหตุขัดข้องตามตัวกรองนี้</p> : null}</div></section>
    </section></main>;
}
