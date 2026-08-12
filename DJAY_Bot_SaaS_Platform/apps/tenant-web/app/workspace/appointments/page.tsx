"use client";

import { currentIntlLocale, safeMutationFetch, uiCopy } from "@djay/shared";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { WorkspacePageLoadError, WorkspaceSessionLoadError, WorkspaceViewOnly } from "../WorkspaceAccess";
import { WorkspaceSidebar } from "../WorkspaceSidebar";
import { WorkspaceSupportBanner } from "../WorkspaceSupportBanner";
import { useWorkspaceSession } from "../useWorkspaceSession";
import { CalendarConnectionPanel, type CalendarOverview } from "./CalendarConnectionPanel";

type Appointment = Readonly<{
  id: string; leadId: string; leadTitle: string; contactName: string; status: string; timezone: string;
  notes: string | null; createdAt: string; updatedAt: string; calendarSyncStatus: string;
  calendarSyncOperation: string | null; calendarSyncErrorCode: string | null;
  options: readonly Readonly<{ id: string; startAt: string; endAt: string; preferenceOrder: number; verificationStatus: string }>[];
  history: readonly Readonly<{ id: string; fromStatus: string | null; toStatus: string; changedAt: string }>[];
}>;
type Callback = Readonly<{
  id: string; contactId: string; contactName: string; leadId: string; leadTitle: string;
  conversationId: string; dueAt: string; status: string; createdAt: string; completedAt: string | null;
  history: readonly Readonly<{ id: string; fromStatus: string | null; toStatus: string; changedAt: string }>[];
}>;

const openStatuses = new Set(["requested", "pending_confirmation", "confirmed", "rescheduled"]);
const appointmentStatusLabel: Record<string, string> = {
  requested: "คำขอใหม่", pending_confirmation: "กำลังยืนยันกับลูกค้า", confirmed: "ทีมยืนยันเวลาแล้ว",
  rescheduled: "เปลี่ยนเวลาแล้ว", completed: "เสร็จสิ้น", cancelled: "ยกเลิก", rejected: "ไม่รับคำขอ", no_show: "ลูกค้าไม่มา",
};
const calendarStatus: Record<string, Readonly<{ label: string; detail: string }>> = {
  not_configured: { label: "ยังไม่เชื่อมปฏิทิน", detail: "การยืนยันนี้อยู่ใน DJAY เท่านั้น และยังไม่ถูกส่งไปปฏิทินภายนอก" },
  ready: { label: "พร้อมส่งเมื่อยืนยัน", detail: "เชื่อมปฏิทินแล้ว ระบบจะส่งงานหลังทีมยืนยันเวลา" },
  pending: { label: "รอส่งไปปฏิทิน", detail: "ยังไม่ถือว่าสำเร็จในปฏิทินภายนอก" },
  synchronizing: { label: "กำลังตรวจสอบกับปฏิทิน", detail: "ยังไม่ถือว่าสำเร็จจนกว่าผู้ให้บริการจะตอบรับ" },
  synchronized: { label: "ปฏิทินภายนอกยืนยันแล้ว", detail: "ผู้ให้บริการตอบรับรายการนี้แล้ว" },
  failed: { label: "ส่งไปปฏิทินไม่สำเร็จ", detail: "ระบบจะลองใหม่อัตโนมัติ ขณะนี้อย่าถือว่ามีรายการในปฏิทิน" },
  action_required: { label: "ต้องให้ทีมตรวจสอบการเชื่อมต่อ", detail: "หยุดลองอัตโนมัติแล้ว โปรดติดต่อฝ่ายช่วยเหลือหรือเชื่อมต่อใหม่" },
  cancelled: { label: "ยกเลิกการส่ง", detail: "ไม่มีงานซิงก์ที่กำลังดำเนินการ" },
};
function calendarStatusCopy(appointment: Appointment) {
  if (appointment.calendarSyncStatus === "synchronized" && appointment.calendarSyncOperation === "cancel") {
    return { label: "ปฏิทินภายนอกยืนยันการยกเลิกแล้ว", detail: "ผู้ให้บริการตอบรับการลบหรือยกเลิกรายการนี้แล้ว" };
  }
  if (appointment.calendarSyncStatus === "synchronized" && appointment.calendarSyncOperation === "update") {
    return { label: "ปฏิทินภายนอกยืนยันเวลาใหม่แล้ว", detail: "ผู้ให้บริการตอบรับการเปลี่ยนเวลารายการนี้แล้ว" };
  }
  return calendarStatus[appointment.calendarSyncStatus] ?? { label: "ไม่ทราบสถานะปฏิทิน", detail: "โปรดโหลดสถานะล่าสุดอีกครั้ง" };
}

export default function AppointmentsPage() {
  const session = useWorkspaceSession(); const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [callbacks, setCallbacks] = useState<Callback[]>([]);
  const [calendar, setCalendar] = useState<CalendarOverview | null>(null);
  const [filter, setFilter] = useState("open"); const [message, setMessage] = useState("");
  const [workingId, setWorkingId] = useState(""); const [loadError, setLoadError] = useState(false);
  const canWrite = session.allows("leads.write");
  const metrics = useMemo(() => {
    const completed = appointments.filter((item) => item.status === "completed").length;
    const confirmed = appointments.filter((item) => ["confirmed", "rescheduled", "completed", "no_show"].includes(item.status)).length;
    const concluded = appointments.filter((item) => ["completed", "no_show", "cancelled", "rejected"].includes(item.status)).length;
    return {
      requested: appointments.length, confirmed, completed,
      completionRate: concluded ? Math.round((completed / concluded) * 100) : null,
    };
  }, [appointments]);
  const visible = useMemo(() => filter === "all" ? appointments
    : filter === "open" ? appointments.filter((item) => openStatuses.has(item.status))
      : appointments.filter((item) => item.status === filter), [appointments, filter]);

  async function load() {
    try {
      const [appointmentResponse, callbackResponse, calendarResponse] = await Promise.all([
        fetch("/tenant/appointments", { cache: "no-store" }), fetch("/tenant/callbacks", { cache: "no-store" }),
        fetch("/tenant/voice/scheduling-profiles", { cache: "no-store" }).catch(() => null),
      ]);
      if (!appointmentResponse.ok || !callbackResponse.ok) throw new Error("follow_up_unavailable");
      setAppointments((await appointmentResponse.json()).appointments ?? []);
      setCallbacks((await callbackResponse.json()).callbacks ?? []);
      setCalendar(calendarResponse?.ok ? (await calendarResponse.json()).calendar ?? null : null); setLoadError(false);
    } catch { setLoadError(true); }
  }
  useEffect(() => { if (session.selectedTenantId) void load(); }, [session.selectedTenantId]);

  async function update(event: FormEvent<HTMLFormElement>, appointment: Appointment) {
    event.preventDefault(); if (!canWrite) return;
    const data = new FormData(event.currentTarget); const status = String(data.get("status") ?? "");
    const optionId = String(data.get("optionId") ?? "");
    if (["confirmed", "rescheduled"].includes(status) && !optionId) { setMessage(uiCopy("เลือกเวลาที่จะยืนยันก่อน", "Choose a time before confirming.")); return; }
    setWorkingId(appointment.id); setMessage("");
    const response = await safeMutationFetch("/tenant/appointments", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appointmentId: appointment.id, status, ...(optionId ? { optionId } : {}), notes: data.get("notes") }),
    });
    setWorkingId("");
    if (!response.ok) { setMessage(response.status === 409 ? uiCopy("สถานะนี้เปลี่ยนต่อไม่ได้ โปรดโหลดข้อมูลล่าสุด", "That status can no longer be changed. Load the latest data.") : uiCopy("บันทึกการนัดหมายไม่สำเร็จ", "The appointment could not be saved.")); return; }
    setMessage(uiCopy("อัปเดตการนัดหมายแล้ว", "Appointment updated.")); await load();
  }

  async function updateCallback(callback: Callback, status: "completed" | "cancelled") {
    if (!canWrite) return; setWorkingId(callback.id); setMessage("");
    const response = await safeMutationFetch("/tenant/callbacks", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ callbackId: callback.id, status }),
    });
    setWorkingId("");
    if (!response.ok) { setMessage(response.status === 409 ? "Callback was already closed. Latest state has been loaded." : "Callback could not be updated."); await load(); return; }
    setMessage(status === "completed" ? "Callback completed." : "Callback cancelled."); await load();
  }

  if (session.error) return <WorkspaceSessionLoadError onRetry={() => window.location.reload()} />;
  if (session.loading || !session.selectedTenantId) return <main className="workspace-loading">กำลังโหลดนัดหมาย...</main>;
  if (loadError) return <WorkspacePageLoadError active="appointments" title="นัดหมาย" resource="appointment requests" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId} onSelect={(id) => void session.selectWorkspace(id)} onLogout={() => void session.logout()} onRetry={() => void load()} />;
  return <main className="workspace-shell"><WorkspaceSidebar active="appointments" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId} onSelect={(id) => void session.selectWorkspace(id)} onLogout={() => void session.logout()} />
    <section id="workspace-main" className="workspace-main" tabIndex={-1}><WorkspaceSupportBanner tenantId={session.selectedTenantId} />
      <header className="workspace-header"><div><p>ลูกค้าและการติดตามผล</p><h1>นัดหมายและการติดต่อกลับ</h1></div><span className="role-label">{appointments.filter((item) => openStatuses.has(item.status)).length + callbacks.filter((item) => item.status === "pending").length} open</span></header>
      <section className="appointment-metrics" aria-label="ภาพรวมการนัดหมาย"><div><span>คำขอทั้งหมด</span><strong>{metrics.requested}</strong></div><div><span>ทีมยืนยันเวลาแล้ว</span><strong>{metrics.confirmed}</strong></div><div><span>เสร็จสิ้น</span><strong>{metrics.completed}</strong></div><div><span>อัตราเสร็จสิ้น</span><strong>{metrics.completionRate === null ? "—" : `${metrics.completionRate}%`}</strong></div></section>
      {!canWrite ? <WorkspaceViewOnly>คุณดูคำขอนัดหมายได้ ผู้ปฏิบัติงานหรือผู้ดูแลเป็นผู้ยืนยันและปิดงาน</WorkspaceViewOnly> : null}
      <CalendarConnectionPanel calendar={calendar} canManage={session.allows("integrations.manage")} onChanged={load} />
      <section className="tool-band callback-queue"><div className="band-heading"><div><p>ติดตามผลจาก Voice Bot</p><h2>คิวติดต่อกลับ</h2></div><div className="band-heading-actions"><span>{callbacks.filter((item) => item.status === "pending").length} open</span><a className="secondary-link" href="/tenant/callbacks?format=csv">ส่งออก CSV</a></div></div>
        <p className="field-help">รายการที่เลยกำหนดจะแสดงก่อน การปิดหรือยกเลิกจะถูกบันทึกในประวัติถาวรของลูกค้า</p>
        <div className="appointment-list">{callbacks.map((callback) => <article className="appointment-card" data-overdue={callback.status === "pending" && new Date(callback.dueAt).getTime() < Date.now() || undefined} key={callback.id}>
          <div className="appointment-summary"><div><p>{callback.status === "pending" && new Date(callback.dueAt).getTime() < Date.now() ? "overdue" : callback.status}</p><h3 data-no-localize>{callback.contactName}</h3><span data-no-localize>{callback.leadTitle}</span></div><time dateTime={callback.dueAt}>Due {new Date(callback.dueAt).toLocaleString(currentIntlLocale())}</time></div>
          <ol className="appointment-timeline" aria-label="ประวัติการติดต่อกลับ">{callback.history.map((entry) => <li key={entry.id}><span aria-hidden="true" /><div><strong>{entry.toStatus}</strong><time dateTime={entry.changedAt}>{new Date(entry.changedAt).toLocaleString(currentIntlLocale())}</time></div></li>)}</ol>
          {canWrite && callback.status === "pending" ? <div className="callback-actions"><a href={`/workspace/inbox?conversation=${callback.conversationId}`}>เปิดการสนทนา</a><button type="button" className="secondary-command" disabled={workingId === callback.id} onClick={() => void updateCallback(callback, "cancelled")}>ยกเลิก</button><button type="button" disabled={workingId === callback.id} onClick={() => void updateCallback(callback, "completed")}>{workingId === callback.id ? "กำลังบันทึก..." : "ทำเสร็จแล้ว"}</button></div> : null}
        </article>)}{!callbacks.length ? <div className="pending-line"><strong>ยังไม่มีคำขอติดต่อกลับ</strong><span>คำขอจาก Voice Bot จะปรากฏที่นี่โดยอัตโนมัติ</span></div> : null}</div>
      </section>
      <section className="tool-band"><div className="band-heading"><div><p>งานที่บอทส่งให้ทีม</p><h2>ตรวจเวลาและยืนยันกับลูกค้า</h2></div><div className="band-heading-actions"><span>{visible.length} of {appointments.length}</span><a className="secondary-link" href={`/tenant/appointments?format=csv&filter=${encodeURIComponent(filter)}`}>ส่งออกตัวกรอง CSV</a></div></div>
        <p className="field-help">“ทีมยืนยันเวลาแล้ว” หมายถึงยืนยันใน DJAY เท่านั้น สถานะปฏิทินจะแสดงแยกต่างหากและจะใช้คำว่า “ปฏิทินภายนอกยืนยันแล้ว” เฉพาะเมื่อผู้ให้บริการตอบรับจริง</p>
        <label className="source-filter">แสดง <select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="open">ต้องดำเนินการ</option><option value="requested">คำขอใหม่</option><option value="pending_confirmation">รอยืนยัน</option><option value="confirmed">ทีมยืนยันแล้ว</option><option value="rescheduled">เปลี่ยนเวลาแล้ว</option><option value="completed">เสร็จสิ้น</option><option value="cancelled">ยกเลิก</option><option value="all">ทั้งหมด</option></select></label>
        {message ? <p className="inline-message" role="status">{message}</p> : null}
        <div className="appointment-list">{visible.map((appointment) => <article className="appointment-card" key={appointment.id}>
          <div className="appointment-summary"><div><p>{appointmentStatusLabel[appointment.status] ?? appointment.status}</p><h3 data-no-localize>{appointment.contactName}</h3><span data-no-localize>{appointment.leadTitle}</span></div><time dateTime={appointment.createdAt}>{new Date(appointment.createdAt).toLocaleString(currentIntlLocale())}</time></div>
          <div className="calendar-sync-state" data-sync-status={appointment.calendarSyncStatus}><strong>{calendarStatusCopy(appointment).label}</strong><span>{calendarStatusCopy(appointment).detail}</span>{appointment.calendarSyncErrorCode ? <code>{appointment.calendarSyncErrorCode}</code> : null}</div>
          <div className="appointment-options"><strong>เวลาที่ลูกค้าเสนอ</strong>{appointment.options.map((option) => <div key={option.id} data-confirmed={option.verificationStatus === "confirmed" || undefined}><span>{new Date(option.startAt).toLocaleString(currentIntlLocale(), { dateStyle: "medium", timeStyle: "short", timeZone: appointment.timezone })}</span><small>{appointment.timezone} · {option.verificationStatus}</small></div>)}</div>
          <ol className="appointment-timeline" aria-label="ประวัติสถานะ">{appointment.history.map((entry) => <li key={entry.id}><span aria-hidden="true" /><div><strong>{appointmentStatusLabel[entry.toStatus] ?? entry.toStatus}</strong><time dateTime={entry.changedAt}>{new Date(entry.changedAt).toLocaleString(currentIntlLocale())}</time></div></li>)}</ol>
          {canWrite && openStatuses.has(appointment.status) ? <form className="appointment-action" onSubmit={(event) => void update(event, appointment)}>
            <label>เวลาที่จะยืนยัน<select name="optionId" defaultValue={appointment.options.find((item) => item.verificationStatus === "confirmed")?.id ?? ""}><option value="">ยังไม่เลือกเวลา</option>{appointment.options.map((option) => <option key={option.id} value={option.id}>{new Date(option.startAt).toLocaleString(currentIntlLocale(), { dateStyle: "medium", timeStyle: "short", timeZone: appointment.timezone })}</option>)}</select></label>
            <label>ขั้นตอนถัดไป<select name="status" defaultValue={["confirmed", "rescheduled"].includes(appointment.status) ? "completed" : "pending_confirmation"}>{appointment.status === "confirmed" ? <><option value="completed">เสร็จสิ้น</option><option value="rescheduled">เปลี่ยนเป็นเวลาที่เลือก</option><option value="no_show">ลูกค้าไม่มา</option><option value="cancelled">ยกเลิก</option></> : appointment.status === "rescheduled" ? <><option value="completed">เสร็จสิ้น</option><option value="rescheduled">เปลี่ยนเวลาอีกครั้ง</option><option value="no_show">ลูกค้าไม่มา</option><option value="cancelled">ยกเลิก</option></> : <><option value="pending_confirmation">กำลังติดต่อยืนยัน</option><option value="confirmed">ทีมยืนยันเวลาแล้ว</option><option value="rejected">ไม่รับคำขอ</option><option value="cancelled">ยกเลิก</option></>}</select></label>
            <label className="wide-field">บันทึกภายใน<textarea name="notes" rows={2} maxLength={2000} defaultValue={appointment.notes ?? ""} /></label><button disabled={workingId === appointment.id}>{workingId === appointment.id ? "กำลังบันทึก..." : "บันทึก"}</button>
          </form> : appointment.notes ? <p className="field-help" data-no-localize>{appointment.notes}</p> : null}
        </article>)}{!visible.length ? <div className="pending-line"><strong>{appointments.length ? "ไม่มีรายการในตัวกรองนี้" : "ยังไม่มีคำขอนัดหมาย"}</strong><span>{appointments.length ? "เลือกทั้งหมดเพื่อดูประวัติ" : "เมื่อลูกค้าขอนัดหมายผ่านบอท รายการจะปรากฏที่นี่"}</span></div> : null}</div>
      </section>
    </section></main>;
}
