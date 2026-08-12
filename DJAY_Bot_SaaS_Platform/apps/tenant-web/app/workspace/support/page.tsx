"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { currentIntlLocale, safeMutationFetch } from "@djay/shared";
import { WorkspacePageLoadError, WorkspaceSessionLoadError } from "../WorkspaceAccess";
import { WorkspaceSidebar } from "../WorkspaceSidebar";
import { useWorkspaceSession } from "../useWorkspaceSession";

type Ticket = {
  id: string; category: string; priority: string; subject: string; description: string;
  status: "open" | "in_progress" | "waiting_on_customer" | "resolved" | "closed";
  contextPath: string | null; diagnosticCode: string | null; lastActivityAt: string; createdAt: string;
  feedbackRating: number | null; feedbackComment: string | null;
  serviceLevel: "standard" | "priority";
};
type TicketMessage = { id: string; ticketId: string; authorKind: "customer" | "platform"; body: string; createdAt: string };
type SupportAttachment = { id: string; ticketId: string; originalFilename: string; mediaType: string; declaredSize: number;
  status: "pending_upload" | "uploaded" | "scanning" | "clean" | "infected" | "failed"; safeErrorCode: string | null; createdAt: string; scannedAt: string | null };
type SupportNotification = { id: string; ticketId: string; eventKind: "platform_response" | "attachment_clean" | "attachment_blocked"; createdAt: string; read: boolean };
type SupportOverview = { tickets: Ticket[]; messages: TicketMessage[]; attachments: SupportAttachment[]; notifications: SupportNotification[] };

const guides = [
  { key: "launch", title: "เปิดใช้งาน FlowBot ครั้งแรก", summary: "ตั้งค่าธุรกิจ เลือกเทมเพลต ทดสอบ และติดตั้งบนเว็บไซต์", href: "/workspace/setup", tags: "setup onboarding launch เริ่มใช้งาน ติดตั้ง" },
  { key: "content", title: "เพิ่มข้อมูลที่บอตใช้ตอบ", summary: "เพิ่ม FAQ เว็บไซต์ เอกสาร และรายการสินค้า พร้อมตรวจข้อมูลก่อนใช้", href: "/workspace/knowledge", tags: "knowledge faq website document ข้อมูล เอกสาร" },
  { key: "editor", title: "แก้คำตอบและเส้นทางสนทนา", summary: "เริ่มจากตัวแก้ไขแบบง่าย และใช้ Canvas เมื่อต้องการเงื่อนไขซับซ้อน", href: "/workspace/flowbot", tags: "flow bot editor canvas reply แก้ไข คำตอบ" },
  { key: "website", title: "ติดตั้งบนเว็บไซต์", summary: "กำหนดโดเมนที่อนุญาต คัดลอกโค้ด และตรวจการติดตั้ง", href: "/workspace/setup", tags: "website widget origin snippet เว็บไซต์" },
  { key: "handoff", title: "รับช่วงสนทนาจากบอต", summary: "ดูข้อความ รับช่วง ตอบลูกค้า และส่งคืนให้ระบบอัตโนมัติ", href: "/workspace/inbox", tags: "inbox handoff takeover reply กล่องข้อความ รับช่วง" },
  { key: "billing", title: "แผน การใช้งาน และเอกสารการเงิน", summary: "ตรวจสิทธิ์ ปริมาณใช้งาน ใบแจ้งหนี้ และจัดการการสมัคร", href: "/workspace/usage", tags: "billing plan usage invoice การเงิน แผน" },
  { key: "security", title: "บัญชี ทีม และความปลอดภัย", summary: "จัดการสมาชิก MFA เซสชัน และสิทธิ์การเข้าถึง", href: "/workspace/security", tags: "security team mfa account ความปลอดภัย ทีม" },
] as const;

function statusLabel(status: Ticket["status"]) {
  return ({ open: "รอทีมช่วยเหลือ", in_progress: "กำลังดำเนินการ", waiting_on_customer: "รอข้อมูลจากคุณ", resolved: "แก้ไขแล้ว", closed: "ปิดแล้ว" } as const)[status];
}
function notificationLabel(kind: SupportNotification["eventKind"]) {
  return kind === "platform_response" ? "ทีม DJAY ตอบคำขอของคุณแล้ว"
    : kind === "attachment_clean" ? "ตรวจไฟล์แล้วและพร้อมดาวน์โหลด"
      : "ไฟล์ถูกบล็อกหลังตรวจความปลอดภัย";
}

function contextPath(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const from = new URLSearchParams(window.location.search).get("from");
  if (from?.startsWith("/") && !from.startsWith("//")) return from.slice(0, 500);
  try {
    const referrer = new URL(document.referrer);
    return referrer.origin === window.location.origin && referrer.pathname.startsWith("/workspace")
      ? `${referrer.pathname}${referrer.search}`.slice(0, 500) : undefined;
  } catch { return undefined; }
}

export default function SupportCenterPage() {
  const session = useWorkspaceSession();
  const [support, setSupport] = useState<SupportOverview | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"success" | "error">("success");
  const [query, setQuery] = useState("");
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [closingTicket, setClosingTicket] = useState(false);
  const activeWorkspace = session.activeWorkspace;

  async function load() {
    setLoadError(false);
    const response = await fetch("/tenant/support-tickets", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) { setLoadError(true); setSupport(null); return; }
    const result = await response.json();
    const next = result.support as SupportOverview;
    setSupport(next);
    setSelectedTicketId((current) => current && next.tickets.some((ticket) => ticket.id === current)
      ? current : next.tickets[0]?.id ?? null);
  }

  useEffect(() => { if (session.selectedTenantId) void load(); }, [session.selectedTenantId]);

  const filteredGuides = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return normalized ? guides.filter((guide) => `${guide.title} ${guide.summary} ${guide.tags}`.toLocaleLowerCase().includes(normalized)) : guides;
  }, [query]);
  const selectedTicket = support?.tickets.find((ticket) => ticket.id === selectedTicketId) ?? null;
  const selectedMessages = support?.messages.filter((item) => item.ticketId === selectedTicketId) ?? [];
  const selectedAttachments = support?.attachments.filter((item) => item.ticketId === selectedTicketId) ?? [];

  async function createTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setWorking(true); setMessage("");
    const currentPath = contextPath();
    const response = await safeMutationFetch("/tenant/support-tickets", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: String(form.get("category")), priority: String(form.get("priority")),
        subject: String(form.get("subject") || "").trim(), description: String(form.get("description") || "").trim(),
        idempotencyKey: crypto.randomUUID(), ...(currentPath ? { contextPath: currentPath } : {}),
      }),
    });
    const result = await response.json().catch(() => null);
    if (response.ok && result?.ticketId) {
      event.currentTarget.reset(); setTone("success");
      setMessage("ส่งคำขอแล้ว ทีมช่วยเหลือจะตอบในหน้านี้ คุณออกจากหน้านี้ได้โดยข้อมูลจะไม่หาย");
      await load(); setSelectedTicketId(result.ticketId);
    } else {
      setTone("error");
      setMessage(result?.status === "validation_failed" ? "ตรวจหัวข้อและรายละเอียด แล้วลองอีกครั้ง" : "ส่งคำขอไม่สำเร็จ ข้อมูลของคุณยังอยู่ในแบบฟอร์ม โปรดลองอีกครั้ง");
    }
    setWorking(false);
  }

  async function reply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTicket) return;
    const form = new FormData(event.currentTarget);
    setWorking(true); setMessage("");
    const response = await safeMutationFetch(`/tenant/support-tickets/${selectedTicket.id}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reply", body: String(form.get("body") || "").trim(), idempotencyKey: crypto.randomUUID() }),
    });
    if (response.ok) { event.currentTarget.reset(); setTone("success"); setMessage("ส่งข้อความเพิ่มเติมแล้ว"); await load(); }
    else { setTone("error"); setMessage("ส่งข้อความไม่สำเร็จ โปรดลองอีกครั้ง"); }
    setWorking(false);
  }

  async function closeTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTicket) return;
    const form = new FormData(event.currentTarget);
    const rating = Number(form.get("rating") ?? 0);
    const comment = String(form.get("comment") ?? "").trim();
    if (comment && !rating) { setTone("error"); setMessage("เลือกคะแนนก่อนส่งข้อเสนอแนะ หรือเว้นทั้งสองช่องเพื่อปิดโดยไม่ให้คะแนน"); return; }
    setWorking(true); setMessage("");
    const response = await safeMutationFetch(`/tenant/support-tickets/${selectedTicket.id}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "close", ...(rating ? { rating } : {}), ...(comment ? { comment } : {}) }),
    });
    if (response.ok) { setClosingTicket(false); setTone("success"); setMessage("ปิดคำขอแล้ว ขอบคุณสำหรับความคิดเห็น"); await load(); }
    else { setTone("error"); setMessage("ปิดคำขอไม่สำเร็จ โปรดลองอีกครั้ง"); }
    setWorking(false);
  }

  async function uploadAttachment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTicket) return;
    const form = event.currentTarget;
    const file = new FormData(form).get("attachment") as File | null;
    const allowed = ["application/pdf", "image/png", "image/jpeg", "text/plain"];
    if (!file || !allowed.includes(file.type) || file.size < 1 || file.size > 10 * 1024 * 1024) {
      setTone("error"); setMessage("เลือกไฟล์ PDF, PNG, JPG หรือ TXT ขนาดไม่เกิน 10 MB"); return;
    }
    setWorking(true); setMessage("");
    const initiated = await safeMutationFetch(`/tenant/support-tickets/${selectedTicket.id}/attachments`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        filename: file.name, mediaType: file.type, size: file.size, idempotencyKey: crypto.randomUUID(),
      }),
    });
    const upload = await initiated.json().catch(() => null) as { attachmentId?: string; uploadUrl?: string; requiredHeaders?: Record<string, string> } | null;
    if (!initiated.ok || !upload?.attachmentId || !upload.uploadUrl) {
      setTone("error"); setMessage("เริ่มอัปโหลดไม่สำเร็จ โปรดลองอีกครั้ง"); setWorking(false); return;
    }
    const stored = await fetch(upload.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type, ...upload.requiredHeaders }, body: file }).catch(() => null);
    if (!stored?.ok) { setTone("error"); setMessage("อัปโหลดไฟล์ไม่สำเร็จ โปรดลองอีกครั้ง"); setWorking(false); return; }
    const completed = await safeMutationFetch(`/tenant/support-tickets/${selectedTicket.id}/attachments/${upload.attachmentId}/complete`, { method: "POST" });
    if (completed.ok) { form.reset(); setTone("success"); setMessage("รับไฟล์แล้ว ระบบกำลังตรวจความปลอดภัยก่อนเปิดให้ดาวน์โหลด"); await load(); }
    else { setTone("error"); setMessage("ตรวจสอบไฟล์อัปโหลดไม่สำเร็จ โปรดอัปโหลดใหม่"); }
    setWorking(false);
  }

  async function downloadAttachment(attachment: SupportAttachment) {
    if (!selectedTicket || attachment.status !== "clean") return;
    const response = await fetch(`/tenant/support-tickets/${selectedTicket.id}/attachments/${attachment.id}/download`, { cache: "no-store" }).catch(() => null);
    const result = await response?.json().catch(() => null) as { downloadUrl?: string } | null;
    if (response?.ok && result?.downloadUrl) window.location.assign(result.downloadUrl);
    else { setTone("error"); setMessage("ลิงก์ดาวน์โหลดไม่พร้อม โปรดลองอีกครั้ง"); }
  }

  async function openNotification(notification: SupportNotification) {
    setSelectedTicketId(notification.ticketId);
    if (notification.read) return;
    const response = await safeMutationFetch(`/tenant/support-tickets/${notification.ticketId}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read_notification", notificationId: notification.id }),
    });
    if (response.ok) await load();
  }

  if (session.error) return <WorkspaceSessionLoadError onRetry={() => window.location.reload()} />;
  if (session.loading || !session.selectedTenantId) return <main className="workspace-loading">กำลังโหลดศูนย์ช่วยเหลือ…</main>;
  if (loadError) return <WorkspacePageLoadError active="support" title="ศูนย์ช่วยเหลือ" resource="support requests" workspaces={session.workspaces}
    selectedTenantId={session.selectedTenantId} onSelect={(id) => void session.selectWorkspace(id)} onLogout={() => void session.logout()} onRetry={() => void load()} />;

  return <main className="workspace-shell"><WorkspaceSidebar active="support" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId}
    onSelect={(id) => void session.selectWorkspace(id)} onLogout={() => void session.logout()} />
    <section id="workspace-main" className="workspace-main" tabIndex={-1}>
      <header className="workspace-header"><div><p>ช่วยเหลือทุกขั้นตอน</p><h1>ศูนย์ช่วยเหลือ</h1></div><span className="role-label" data-no-localize>{activeWorkspace?.businessName}</span></header>
      {message ? <p className={`inline-message dashboard-inline-message ${tone}`} role={tone === "error" ? "alert" : "status"}>{message}</p> : null}
      {support?.notifications.some((item) => !item.read) ? <section className="support-update-center" aria-labelledby="support-updates-title"><div className="band-heading"><div><p>อัปเดตใหม่</p><h2 id="support-updates-title">การแจ้งเตือนจากทีมช่วยเหลือ</h2></div><span>{support.notifications.filter((item) => !item.read).length} ยังไม่ได้อ่าน</span></div><div>{support.notifications.slice(0, 5).map((notification) => <button type="button" className={notification.read ? "" : "unread"} key={notification.id} onClick={() => void openNotification(notification)}><span>{notificationLabel(notification.eventKind)}</span><time dateTime={notification.createdAt}>{new Date(notification.createdAt).toLocaleString(currentIntlLocale())}</time></button>)}</div></section> : null}
      <section className="support-hero" aria-labelledby="support-guide-title">
        <div><p>เริ่มจากคำแนะนำ</p><h2 id="support-guide-title">วันนี้ต้องการทำอะไร?</h2><span>ค้นหาวิธีทำแบบทีละขั้น หรือส่งคำขอพร้อมบริบทของหน้าที่พบปัญหา</span></div>
        <label><span className="visually-hidden">ค้นหาคำแนะนำ</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="เช่น เพิ่ม FAQ, ตั้งค่า Bot, ติดตั้งเว็บไซต์" /></label>
      </section>
      <section className="tool-band"><div className="support-guide-grid">{filteredGuides.map((guide) => <a href={guide.href} key={guide.key}><strong>{guide.title}</strong><span>{guide.summary}</span><small>เปิดคำแนะนำ →</small></a>)}</div>
        {!filteredGuides.length ? <p className="support-empty">ไม่พบคำแนะนำ ลองใช้คำสั้นลงหรือส่งคำขอให้ทีมช่วยเหลือด้านล่าง</p> : null}</section>
      <section className="tool-band muted-band"><div className="band-heading"><div><p>ติดต่อทีมเทคนิค</p><h2>ส่งคำขอความช่วยเหลือ</h2></div><span>ไม่ต้องส่งรหัสผ่านหรือ secret key</span></div>
        <p className="control-copy">อธิบายสิ่งที่ต้องการทำ สิ่งที่เกิดขึ้น และผลที่คาดหวัง ระบบจะแนบบริบทของหน้าก่อนหน้าเท่านั้น โดยไม่แนบรหัสผ่านหรือข้อมูลลับ</p>
        <form className="support-ticket-form" onSubmit={(event) => void createTicket(event)}>
          <label>เรื่องที่ต้องการความช่วยเหลือ<select name="category" defaultValue="onboarding"><option value="onboarding">เริ่มใช้งาน</option><option value="channel">เชื่อมต่อช่องทาง</option><option value="bot">ตั้งค่า Bot</option><option value="knowledge">ข้อมูลและคลังความรู้</option><option value="inbox">กล่องข้อความและลูกค้า</option><option value="billing">แผนและการเรียกเก็บเงิน</option><option value="account">บัญชีและความปลอดภัย</option><option value="other">เรื่องอื่น</option></select></label>
          <label>ความเร่งด่วน<select name="priority" defaultValue="normal"><option value="low">ไม่เร่งด่วน</option><option value="normal">ปกติ</option><option value="high">กระทบการทำงาน</option><option value="urgent">ระบบที่เปิดใช้อยู่หยุดทำงาน</option></select></label>
          <label className="wide-field">หัวข้อ<input name="subject" minLength={5} maxLength={160} placeholder="สรุปปัญหาในหนึ่งประโยค" required /></label>
          <label className="wide-field">รายละเอียด<textarea name="description" minLength={10} maxLength={5000} rows={5} placeholder="กำลังทำอะไร เกิดอะไรขึ้น และต้องการให้เป็นอย่างไร" required /></label>
          <button disabled={working}>{working ? "กำลังส่ง…" : "ส่งคำขอ"}</button>
        </form>
      </section>
      <section className="tool-band"><div className="band-heading"><div><p>ติดตามได้ในที่เดียว</p><h2>คำขอของคุณ</h2></div><span>{support?.tickets.length ?? 0} รายการ</span></div>
        <div className="support-ticket-layout">
          <div className="support-ticket-list" role="list" aria-label="คำขอความช่วยเหลือ">{support?.tickets.map((ticket) => <button type="button" role="listitem" className={ticket.id === selectedTicketId ? "selected" : ""} onClick={() => setSelectedTicketId(ticket.id)} key={ticket.id}><span><strong data-no-localize>{ticket.subject}</strong><small>{statusLabel(ticket.status)}</small></span><span>{ticket.category} · {new Date(ticket.lastActivityAt).toLocaleString(currentIntlLocale())}</span></button>)}
            {!support?.tickets.length ? <p className="support-empty">ยังไม่มีคำขอ เมื่อส่งคำขอแล้วจะติดตามคำตอบได้ที่นี่</p> : null}</div>
          {selectedTicket ? <article className="support-ticket-detail"><header><div><p>{statusLabel(selectedTicket.status)} · {selectedTicket.priority} · {selectedTicket.serviceLevel === "priority" ? "Priority support" : "Standard support"}</p><h3 data-no-localize>{selectedTicket.subject}</h3></div>{selectedTicket.status !== "closed" ? <button className="secondary-command" type="button" disabled={working} onClick={() => setClosingTicket(true)}>ปิดคำขอ</button> : null}</header>
            <div className="support-ticket-context"><p data-no-localize>{selectedTicket.description}</p>{selectedTicket.contextPath ? <small>บริบทหน้า: <span data-no-localize>{selectedTicket.contextPath}</span></small> : null}</div>
            <section className="support-attachments" aria-labelledby="support-attachments-title"><div className="band-heading"><div><p>ไฟล์ประกอบ</p><h4 id="support-attachments-title">เอกสารและภาพหน้าจอ</h4></div><span>PDF, PNG, JPG, TXT · ไม่เกิน 10 MB</span></div>
              <p className="control-copy">ทุกไฟล์จะถูกกักไว้และตรวจมัลแวร์ก่อนเปิดให้ดาวน์โหลด อย่าแนบรหัสผ่าน secret key ข้อมูลบัตร หรือข้อมูลส่วนตัวที่ไม่จำเป็น</p>
              {selectedTicket.status !== "closed" ? <form className="support-attachment-form" onSubmit={(event) => void uploadAttachment(event)}><label>เลือกไฟล์<input name="attachment" type="file" accept=".pdf,.png,.jpg,.jpeg,.txt,application/pdf,image/png,image/jpeg,text/plain" required /></label><button disabled={working}>{working ? "กำลังอัปโหลด…" : "แนบไฟล์"}</button></form> : null}
              <ul className="support-attachment-list">{selectedAttachments.map((attachment) => <li key={attachment.id}><span><strong data-no-localize>{attachment.originalFilename}</strong><small>{Math.ceil(attachment.declaredSize / 1024)} KB · {attachment.status === "clean" ? "ตรวจแล้ว ปลอดภัย" : attachment.status === "infected" ? "ถูกบล็อก: พบไฟล์ไม่ปลอดภัย" : attachment.status === "failed" ? "ตรวจไม่สำเร็จ กรุณาอัปโหลดใหม่" : "กำลังตรวจความปลอดภัย"}</small></span>{attachment.status === "clean" ? <button type="button" className="secondary-command" onClick={() => void downloadAttachment(attachment)}>ดาวน์โหลด</button> : <span className="role-label">{attachment.status === "infected" || attachment.status === "failed" ? "บล็อกแล้ว" : "กักไฟล์"}</span>}</li>)}</ul>
            </section>
            <div className="support-message-list">{selectedMessages.map((item) => <div className={item.authorKind === "platform" ? "platform" : "customer"} key={item.id}><strong>{item.authorKind === "platform" ? "ทีม DJAY" : "ทีมของคุณ"}</strong><p data-no-localize>{item.body}</p><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString(currentIntlLocale())}</time></div>)}</div>
            {selectedTicket.status !== "closed" ? <form className="support-reply-form" onSubmit={(event) => void reply(event)}><label>ส่งข้อมูลเพิ่มเติม<textarea name="body" minLength={2} maxLength={5000} rows={3} required /></label><button disabled={working}>ส่งข้อความ</button></form> : null}
            {selectedTicket.feedbackRating ? <div className="support-feedback-summary"><strong>ความคิดเห็นหลังปิดคำขอ: {selectedTicket.feedbackRating}/5</strong>{selectedTicket.feedbackComment ? <p data-no-localize>{selectedTicket.feedbackComment}</p> : null}</div> : null}
          </article> : <div className="support-ticket-detail support-empty">เลือกคำขอเพื่อดูรายละเอียดและคำตอบ</div>}
        </div>
      </section>
      {closingTicket && selectedTicket ? <div className="support-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setClosingTicket(false); }}><section className="support-feedback-modal" role="dialog" aria-modal="true" aria-labelledby="support-close-title"><div className="band-heading"><div><p>จบการช่วยเหลือ</p><h2 id="support-close-title">ปิดคำขอนี้หรือไม่?</h2></div><button type="button" className="secondary-command" onClick={() => setClosingTicket(false)}>ยังไม่ปิด</button></div><p className="control-copy">เมื่อปิดแล้วจะส่งข้อความเพิ่มไม่ได้ หากยังมีปัญหา คุณสามารถสร้างคำขอใหม่ได้เสมอ</p><form onSubmit={(event) => void closeTicket(event)}><fieldset><legend>ประสบการณ์กับทีมช่วยเหลือ (ไม่บังคับ)</legend><div className="support-rating">{[5, 4, 3, 2, 1].map((rating) => <label key={rating}><input type="radio" name="rating" value={rating} /> {rating}</label>)}</div></fieldset><label>ข้อเสนอแนะเพิ่มเติม<textarea name="comment" minLength={2} maxLength={1000} rows={3} placeholder="ช่วยบอกสิ่งที่ทำได้ดีหรือควรปรับปรุง" /></label><button disabled={working}>{working ? "กำลังปิด…" : "ปิดคำขอ"}</button></form></section></div> : null}
    </section></main>;
}
