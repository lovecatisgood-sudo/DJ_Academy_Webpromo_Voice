"use client";

import { safeMutationFetch } from "@djay/shared";
import { useState, type FormEvent } from "react";

export type CalendarOverview = Readonly<{
  advanced: boolean;
  profiles: readonly Readonly<{ id: string; name: string; providerKind: string; status: string; createdAt: string }>[];
}>;

export function CalendarConnectionPanel({ calendar, canManage, onChanged }: Readonly<{
  calendar: CalendarOverview | null; canManage: boolean; onChanged: () => Promise<void>;
}>) {
  const [expanded, setExpanded] = useState(false); const [working, setWorking] = useState(false); const [message, setMessage] = useState("");
  const active = calendar?.profiles.find((profile) => profile.status === "active");
  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setWorking(true); setMessage(""); const data = new FormData(event.currentTarget);
    const response = await safeMutationFetch("/tenant/voice/scheduling-profiles", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: String(data.get("name") ?? "Google Calendar"), providerKind: "google_calendar", config: {
        calendarId: String(data.get("calendarId") ?? ""), serviceAccountEmail: String(data.get("serviceAccountEmail") ?? ""), privateKey: String(data.get("privateKey") ?? ""),
      } }) });
    setWorking(false);
    if (!response.ok) { setMessage(response.status === 403 ? "แพ็กเกจนี้ยังไม่รองรับการเชื่อมปฏิทิน หรือเซสชันต้องยืนยันตัวตนใหม่" : "เชื่อมต่อไม่สำเร็จ โปรดตรวจข้อมูลและลองอีกครั้ง"); return; }
    event.currentTarget.reset(); setExpanded(false); setMessage("บันทึกการเชื่อมต่อแล้ว รายการใหม่จะถูกส่งหลังทีมยืนยันเวลา"); await onChanged();
  }
  async function changeStatus(profileId: string, status: "active" | "disabled") {
    setWorking(true); setMessage(""); const response = await safeMutationFetch("/tenant/voice/scheduling-profiles", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profileId, status }) }); setWorking(false);
    if (!response.ok) { setMessage("เปลี่ยนสถานะการเชื่อมต่อไม่สำเร็จ"); return; }
    setMessage(status === "active" ? "เปิดการส่งไปปฏิทินแล้ว" : "หยุดส่งรายการใหม่ไปปฏิทินแล้ว"); await onChanged();
  }
  return <section className="tool-band calendar-connection"><div className="band-heading"><div><p>การเชื่อมต่อแบบตรวจสอบผลลัพธ์</p><h2>ปฏิทินนัดหมาย</h2></div><span>{active ? "เชื่อมต่ออยู่" : "ยังไม่เชื่อมต่อ"}</span></div>
    <p className="field-help">DJAY จะแยกสถานะในระบบออกจากผลลัพธ์ของปฏิทินเสมอ หากผู้ให้บริการยังไม่ตอบรับ รายการจะไม่แสดงว่าสำเร็จ</p>
    {!calendar ? <div className="pending-line"><strong>ตรวจสถานะการเชื่อมต่อไม่ได้</strong><span>รายการนัดหมายยังใช้งานได้ โปรดลองโหลดใหม่ภายหลัง</span></div> : active ? <div className="calendar-profile-summary"><div><strong data-no-localize>{active.name}</strong><span>Google Calendar · เปิดใช้งาน</span></div>{canManage ? <button type="button" className="secondary-command" disabled={working} onClick={() => void changeStatus(active.id, "disabled")}>หยุดส่งรายการใหม่</button> : null}</div> : <div className="pending-line"><strong>{calendar.advanced ? "พร้อมเชื่อม Google Calendar" : "ต้องใช้ความสามารถ Voice Advanced"}</strong><span>{calendar.advanced ? "การตั้งค่านี้ใช้บัญชีบริการที่ผู้ดูแล Google Workspace ออกให้" : "ยังบันทึกคำขอและยืนยันใน DJAY ได้ตามปกติ"}</span></div>}
    {canManage && calendar?.advanced ? <><button type="button" className="secondary-command calendar-connect-toggle" onClick={() => setExpanded((value) => !value)}>{expanded ? "ปิดแบบฟอร์ม" : active ? "เปลี่ยนปฏิทิน" : "เชื่อม Google Calendar"}</button>
      {expanded ? <form className="calendar-connect-form" onSubmit={(event) => void connect(event)}><div className="setup-instructions"><strong>เตรียมข้อมูล 3 อย่าง</strong><ol><li>ให้ผู้ดูแล Google Cloud เปิด Calendar API และสร้าง Service Account</li><li>แชร์ปฏิทินปลายทางให้ email ของ Service Account แก้ไขกิจกรรมได้</li><li>วาง Calendar ID, email และ private key ด้านล่าง หรือเปิดแชตให้ทีมเทคนิคช่วยตรวจ</li></ol></div>
        <label>ชื่อที่จำง่าย<input name="name" required minLength={2} maxLength={160} placeholder="ปฏิทินนัดหมายหลัก" /></label>
        <label>Calendar ID<input name="calendarId" required minLength={3} maxLength={500} autoComplete="off" /></label>
        <label>Service Account email<input name="serviceAccountEmail" required type="email" maxLength={320} autoComplete="off" /></label>
        <label className="wide-field">Private key<textarea name="privateKey" required minLength={100} maxLength={10000} rows={5} autoComplete="off" spellCheck={false} /></label>
        <p className="field-help wide-field">คีย์จะถูกเข้ารหัสก่อนจัดเก็บและจะไม่แสดงกลับในหน้าจอนี้ การเชื่อมต่อใหม่จะปิดการเชื่อมต่อเดิมเพื่อป้องกันการส่งซ้ำ</p><button disabled={working}>{working ? "กำลังบันทึก..." : "บันทึกและใช้ปฏิทินนี้"}</button>
      </form> : null}</> : null}
    {calendar && canManage && !active && calendar.profiles.some((profile) => profile.status === "disabled") ? <div className="calendar-disabled-list"><strong>การเชื่อมต่อที่หยุดไว้</strong>{calendar.profiles.filter((profile) => profile.status === "disabled").map((profile) => <div key={profile.id}><span data-no-localize>{profile.name}</span><button type="button" className="secondary-command" disabled={working} onClick={() => void changeStatus(profile.id, "active")}>เปิดใช้อีกครั้ง</button></div>)}</div> : null}
    {message ? <p className="inline-message" role="status">{message}</p> : null}
  </section>;
}
