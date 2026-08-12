import { currentIntlLocale } from "@djay/shared";
import type { FormEvent } from "react";

export type Tenant = { id: string; businessName: string; slug: string; status: string };
export type SupportGrant = { id: string; tenantId: string; businessName: string; requestedByPlatformUserId: string; approvedByPlatformUserId: string | null; reason: string; status: string; startsAt: string; expiresAt: string };
export type SupportTicketQueue = {
  tickets: Array<{ id: string; tenantId: string; businessName: string; category: string; priority: string; subject: string; description: string; status: "open" | "in_progress" | "waiting_on_customer" | "resolved" | "closed"; contextPath: string | null; diagnosticCode: string | null; lastActivityAt: string; createdAt: string; feedbackRating: number | null; feedbackComment: string | null; serviceLevel: "standard" | "priority"; firstResponseDueAt: string; firstRespondedAt: string | null; responseState: "responded" | "overdue" | "due_soon" | "on_track" }>;
  messages: Array<{ id: string; ticketId: string; authorKind: "customer" | "platform"; body: string; createdAt: string }>;
  attachments: Array<{ id: string; ticketId: string; originalFilename: string; declaredSize: number; status: "pending_upload" | "uploaded" | "scanning" | "clean" | "infected" | "failed"; safeErrorCode: string | null }>;
};

type FormatLabel = (value: string) => string;

export function PlatformSupportTicketPanel({
  queue, busy, formatLabel, onRespond, onDownload,
}: Readonly<{
  queue: SupportTicketQueue;
  busy: boolean;
  formatLabel: FormatLabel;
  onRespond: (event: FormEvent<HTMLFormElement>, ticketId: string) => void;
  onDownload: (attachmentId: string) => void;
}>) {
  return <div className="subscription-band support-ticket-queue" id="support-tickets">
    <div className="readiness-heading"><div><p>การดูแลลูกค้า</p><h2>คิวคำขอความช่วยเหลือ</h2></div><span className="readiness-status">เปิดอยู่ {queue.tickets.filter((ticket) => !["resolved", "closed"].includes(ticket.status)).length} รายการ</span></div>
    <p className="operational-note">ตอบโดยใช้ข้อมูลที่ลูกค้าส่งมาก่อน การเปิดเวิร์กสเปซลูกค้าต้องใช้สิทธิ์เข้าถึงแบบจำกัดเวลาแยกต่างหากด้านล่าง ห้ามขอรหัสผ่านหรือ secret key จากลูกค้า</p>
    <div className="platform-support-ticket-list" role="list" aria-label="คำขอความช่วยเหลือจากลูกค้า">
      {queue.tickets.slice(0, 100).map((ticket) => <article role="listitem" className={`platform-support-ticket priority-${ticket.priority}`} key={ticket.id}>
        <header><div><p>{formatLabel(ticket.category)} · {formatLabel(ticket.priority)} · {ticket.serviceLevel === "priority" ? "Priority queue" : "Standard queue"}</p><h3 data-no-localize>{ticket.subject}</h3><span data-no-localize>{ticket.businessName}</span></div><div><strong>{formatLabel(ticket.status)} · {ticket.responseState === "responded" ? "ตอบครั้งแรกแล้ว" : ticket.responseState === "overdue" ? "เกินเป้าหมายภายใน" : ticket.responseState === "due_soon" ? "ใกล้เป้าหมายภายใน" : "อยู่ในเป้าหมายภายใน"}</strong><time dateTime={ticket.lastActivityAt}>{new Date(ticket.lastActivityAt).toLocaleString(currentIntlLocale())}</time></div></header>
        <div className="platform-support-description"><p data-no-localize>{ticket.description}</p>{ticket.contextPath ? <small>บริบทหน้า: <span data-no-localize>{ticket.contextPath}</span></small> : null}{ticket.diagnosticCode ? <small>รหัสวินิจฉัย: <code data-no-localize>{ticket.diagnosticCode}</code></small> : null}{ticket.feedbackRating ? <small>คะแนนหลังปิด: {ticket.feedbackRating}/5{ticket.feedbackComment ? <span data-no-localize> · {ticket.feedbackComment}</span> : null}</small> : null}</div>
        <div className="platform-support-attachments">{queue.attachments.filter((item) => item.ticketId === ticket.id).map((attachment) => <div key={attachment.id}><span><strong data-no-localize>{attachment.originalFilename}</strong><small>{Math.ceil(attachment.declaredSize / 1024)} KB · {attachment.status === "clean" ? "ตรวจแล้ว" : attachment.status === "infected" ? "บล็อก: พบมัลแวร์" : attachment.status === "failed" ? "ตรวจล้มเหลว" : "กักไฟล์/กำลังตรวจ"}</small></span>{attachment.status === "clean" ? <button type="button" className="secondary-command" disabled={busy} onClick={() => onDownload(attachment.id)}>ดาวน์โหลด</button> : null}</div>)}</div>
        <div className="platform-support-timeline">{queue.messages.filter((item) => item.ticketId === ticket.id).map((item) => <div className={item.authorKind} key={item.id}><strong>{item.authorKind === "platform" ? "DJAY" : "ลูกค้า"}</strong><p data-no-localize>{item.body}</p><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString(currentIntlLocale())}</time></div>)}</div>
        {ticket.status !== "closed" ? <form className="platform-support-reply" onSubmit={(event) => onRespond(event, ticket.id)}>
          <label>คำตอบที่ลูกค้าเห็น<textarea name="body" minLength={2} maxLength={5000} rows={3} required /></label>
          <label>สถานะถัดไป<select name="status" defaultValue={ticket.status === "resolved" ? "resolved" : "waiting_on_customer"}><option value="open">เปิด</option><option value="in_progress">กำลังดำเนินการ</option><option value="waiting_on_customer">รอข้อมูลจากลูกค้า</option><option value="resolved">แก้ไขแล้ว</option></select></label>
          <button disabled={busy}>ส่งคำตอบ</button>
        </form> : null}
      </article>)}
      {!queue.tickets.length ? <p className="empty-row" role="listitem">ไม่มีคำขอความช่วยเหลือ</p> : null}
    </div>
  </div>;
}

export function PlatformSupportAccessPanel({
  user, tenants, grants, busy, resourceErrors, formatLabel, onRequest, onDecide,
}: Readonly<{
  user: { id: string; role: string };
  tenants: Tenant[];
  grants: SupportGrant[];
  busy: boolean;
  resourceErrors: string[];
  formatLabel: FormatLabel;
  onRequest: (event: FormEvent<HTMLFormElement>) => void;
  onDecide: (grantId: string, command: "approve" | "revoke") => void;
}>) {
  return <div className="subscription-band support-band" id="support-access">
    <div><p>การสนับสนุนแบบควบคุม</p><h2>สิทธิ์เข้าถึงเวิร์กสเปซลูกค้าแบบจำกัดเวลา</h2></div>
    {(user.role === "platform_owner" || user.role === "platform_support") && tenants.length ? <form className="support-request-form" onSubmit={onRequest}>
      <label>ลูกค้า<select name="tenantId" required defaultValue=""><option value="" disabled>เลือกลูกค้า</option>{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.businessName}</option>)}</select></label>
      <label>เหตุผล<input name="reason" minLength={12} maxLength={500} required /></label>
      <label>ระยะเวลา<select name="durationMinutes" defaultValue="60"><option value="30">30 นาที</option><option value="60">1 ชั่วโมง</option><option value="120">2 ชั่วโมง</option><option value="240">4 ชั่วโมง</option></select></label>
      <button type="submit" disabled={busy}>ส่งคำขอ</button>
    </form> : null}
    <h3>Tenant 360</h3>
    <p className="operational-note">เปิดภาพรวมแบบอ่านอย่างเดียวที่บันทึกการเข้าดู โดยไม่เปิดเผยข้อมูลรับรอง ข้อความลูกค้า หรือการกำหนดเส้นทางผู้ให้บริการ</p>
    <div className="platform-table" role="list" aria-label="ไดเรกทอรี Tenant 360">
      {tenants.map((tenant) => <div className="platform-row tenant-directory-row" role="listitem" key={tenant.id}><div><strong data-no-localize>{tenant.businessName}</strong><span data-no-localize>{tenant.slug}</span></div><span>{formatLabel(tenant.status)}</span><a className="secondary-command" href={`/tenants/${tenant.id}`}>เปิด Tenant 360</a></div>)}
      {!tenants.length ? <p className="empty-row" role="listitem">ไม่มี tenant ที่บทบาทนี้เปิดดูได้</p> : null}
    </div>
    <div className="platform-table" role="list" aria-label="สิทธิ์เข้าถึงเพื่อให้การสนับสนุน">
      {grants.map((grant) => <div className="platform-row support-row" role="listitem" key={grant.id}>
        <div><strong data-no-localize>{grant.businessName}</strong><span data-no-localize>{grant.reason}</span></div><span>{formatLabel(grant.status)}</span><span>{new Date(grant.expiresAt).toLocaleString(currentIntlLocale())}</span>
        <div className="row-actions">{user.role === "platform_owner" && grant.status === "requested" ? <button type="button" disabled={busy || grant.requestedByPlatformUserId === user.id} onClick={() => onDecide(grant.id, "approve")}>อนุมัติ</button> : null}{user.role === "platform_owner" && ["requested", "approved", "active"].includes(grant.status) ? <button className="outline-button" type="button" disabled={busy} onClick={() => onDecide(grant.id, "revoke")}>เพิกถอน</button> : null}</div>
      </div>)}
      {!grants.length && !resourceErrors.includes("Support access grants") ? <p className="empty-row" role="listitem">ไม่มีสิทธิ์เข้าถึงเพื่อให้การสนับสนุน</p> : null}
    </div>
  </div>;
}
