"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { currentIntlLocale, privacyJobSelectionError, safeMutationFetch, uiCopy, type PrivacyJobType } from "@djay/shared";
import { WorkspaceSidebar } from "../WorkspaceSidebar";
import { WorkspacePageLoadError, WorkspaceSessionLoadError } from "../WorkspaceAccess";
import { WorkspaceSupportBanner } from "../WorkspaceSupportBanner";
import { useWorkspaceSession } from "../useWorkspaceSession";

type Contact = { id: string; displayName: string };
type PrivacyJob = { id: string; contactId: string | null; contactName: string | null; jobType: string; status: string; requestedAt: string; completedAt: string | null };
type RetentionPolicy = { transcriptDays: number; recordingDays: number; voicePlanMaximumDays: number | null; updatedAt: string };
type LegalHold = { id: string; contactId: string; contactName: string; reason: string; setAt: string };

export default function DataControlsPage() {
  const session = useWorkspaceSession(); const [contacts, setContacts] = useState<Contact[]>([]); const [jobs, setJobs] = useState<PrivacyJob[]>([]);
  const [holds, setHolds] = useState<LegalHold[]>([]);
  const [retention, setRetention] = useState<RetentionPolicy | null>(null);
  const [jobType, setJobType] = useState<PrivacyJobType>("export"); const [contactId, setContactId] = useState("");
  const [privacyError, setPrivacyError] = useState("");
  const [privacyMessage, setPrivacyMessage] = useState(""); const [privacyMessageKind, setPrivacyMessageKind] = useState<"success" | "error">("success");
  const [retentionMessage, setRetentionMessage] = useState(""); const [retentionMessageKind, setRetentionMessageKind] = useState<"success" | "error">("success");
  const [working, setWorking] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const workspace = useMemo(() => session.workspaces.find((item) => item.tenantId === session.selectedTenantId), [session]);
  const canManage = workspace?.role === "tenant_master_admin";
  async function load() {
    if (canManage) {
      try {
        const [contactResponse, jobsResponse, retentionResponse, holdsResponse] = await Promise.all([
          fetch("/tenant/contacts", { cache: "no-store" }),
          fetch("/tenant/privacy-jobs", { cache: "no-store" }),
          fetch("/tenant/retention-policy", { cache: "no-store" }),
          fetch("/tenant/legal-holds", { cache: "no-store" }),
        ]);
        if (!contactResponse.ok || !jobsResponse.ok || !retentionResponse.ok || !holdsResponse.ok) throw new Error("privacy_unavailable");
        setContacts((await contactResponse.json()).contacts || []);
        setJobs((await jobsResponse.json()).jobs || []);
        setRetention((await retentionResponse.json()).policy || null);
        setHolds((await holdsResponse.json()).holds || []);
        setLoadError(false);
      } catch { setLoadError(true); }
    }
  }
  useEffect(() => { if (session.selectedTenantId) void load(); }, [session.selectedTenantId, canManage]);
  async function requestJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPrivacyMessage(""); const error = privacyJobSelectionError({ jobType, contactId });
    if (error) { setPrivacyError(error); requestAnimationFrame(() => document.querySelector<HTMLSelectElement>("#privacy-contact")?.focus()); return; }
    const contact = contacts.find((item) => item.id === contactId);
    if (jobType === "erasure" && (!contact || !window.confirm(uiCopy(`ลบข้อมูลส่วนบุคคลของ ${contact.displayName} ถาวรหรือไม่? การกระทำนี้ย้อนกลับไม่ได้ ข้อมูลตรวจสอบและข้อมูลที่กฎหมายกำหนดให้เก็บยังคงอยู่`, `Permanently erase personal data for ${contact.displayName}? This cannot be undone. Audit lineage and legally retained records remain.`)))) return;
    setPrivacyError(""); setWorking(true);
    const response = await safeMutationFetch("/tenant/privacy-jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobType, ...(contactId ? { contactId } : {}), idempotencyKey: crypto.randomUUID() }) });
    setWorking(false); if (!response.ok) { setPrivacyMessageKind("error"); setPrivacyMessage("Privacy request could not be accepted. No data was exported or erased."); return; }
    setPrivacyMessageKind("success"); setPrivacyMessage("Privacy request accepted for processing."); setJobType("export"); setContactId(""); await load();
  }
  async function saveRetention(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setWorking(true); setRetentionMessage(""); const data = new FormData(event.currentTarget);
    const response = await safeMutationFetch("/tenant/retention-policy", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcriptDays: Number(data.get("transcriptDays")) }),
    });
    setWorking(false);
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      setRetentionMessageKind("error"); setRetentionMessage(result.maximumDays ? `Your active Voice plan allows up to ${result.maximumDays} days.` : "Retention policy could not be saved.");
      return;
    }
    setRetentionMessageKind("success"); setRetentionMessage("Retention policy saved. The privacy worker applies expired transcript redaction automatically.");
    await load();
  }
  if (session.error) return <WorkspaceSessionLoadError onRetry={() => window.location.reload()} />;
  if (session.loading || !session.selectedTenantId) return <main className="workspace-loading">กำลังโหลดการจัดการข้อมูล...</main>;
  if (loadError) return <WorkspacePageLoadError active="data" title="การจัดการข้อมูล" resource="privacy controls" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId} onSelect={(id) => void session.selectWorkspace(id)} onLogout={() => void session.logout()} onRetry={() => void load()} />;
  return <main className="workspace-shell"><WorkspaceSidebar active="data" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId} onSelect={(id) => void session.selectWorkspace(id)} onLogout={() => void session.logout()} />
    <section id="workspace-main" className="workspace-main" tabIndex={-1}><WorkspaceSupportBanner tenantId={session.selectedTenantId} />
      <header className="workspace-header"><div><p>การกำกับดูแล</p><h1>การจัดการข้อมูล</h1></div><span className="role-label">{workspace?.businessName}</span></header>
      {!canManage ? <section className="tool-band"><div className="band-heading"><div><p>จำกัดสิทธิ์</p><h2>ต้องมีสิทธิ์ผู้ดูแลหลักของเวิร์กสเปซ</h2></div></div><p className="control-copy">การส่งออกและคำขอลบข้อมูลส่วนบุคคลจำกัดไว้สำหรับเจ้าของเวิร์กสเปซที่ลงทะเบียน</p></section> : <>
        <section className="tool-band"><div className="band-heading"><div><p>ความเป็นส่วนตัวของระบบเสียง</p><h2>ระยะเวลาเก็บข้อความการสนทนา</h2></div><span>{retention?.voicePlanMaximumDays ? `Plan maximum ${retention.voicePlanMaximumDays} days` : "Workspace policy"}</span></div>
          <p className="control-copy">ข้อความและเนื้อหาช่วงสนทนาด้วยเสียงที่หมดอายุจะถูกแทนด้วยหลักฐานตรวจสอบที่ไม่ระบุตัวบุคคล ข้อมูลผลลัพธ์ของสายยังคงไว้เพื่อรายงานการทำงาน และยังปิดการบันทึกเสียง</p>
          {retention ? <form className="retention-form" onSubmit={saveRetention}><label>เก็บข้อความการสนทนาเป็นเวลา<select name="transcriptDays" defaultValue={retention.transcriptDays} key={retention.updatedAt}>{[30, 60, 90, 180, 365, 730, 1095, 1825, 3650].filter((days) => !retention.voicePlanMaximumDays || days <= retention.voicePlanMaximumDays).map((days) => <option key={days} value={days}>{days} days</option>)}</select></label><label>การบันทึกเสียง<input value="Disabled" readOnly aria-label="สถานะการบันทึกเสียง" /></label><button type="submit" disabled={working}>{working ? "Saving..." : "Save retention"}</button></form> : <p className="control-copy">กำลังโหลดนโยบายการเก็บรักษาข้อมูล...</p>}
          {retentionMessage ? <p className={`inline-message${retentionMessageKind === "error" ? " error" : ""}`} role={retentionMessageKind === "error" ? "alert" : "status"}>{retentionMessage}</p> : null}
        </section>
        <section className="tool-band"><div className="band-heading"><div><p>คำขอด้านความเป็นส่วนตัว</p><h2>ส่งออกหรือลบข้อมูลส่วนบุคคล</h2></div></div>
          {/* Erasure empty selection: Select a contact to erase. */}
          <form className="record-form privacy-form" onSubmit={requestJob} noValidate><label>ส่งคำขอ<select name="jobType" value={jobType} onChange={(event) => { setJobType(event.target.value as PrivacyJobType); setPrivacyError(""); setPrivacyMessage(""); }}><option value="export">ส่งออกข้อมูล</option><option value="erasure">ลบข้อมูล</option></select></label><label>ข้อมูลติดต่อ<select id="privacy-contact" name="contactId" value={contactId} aria-invalid={Boolean(privacyError) || undefined} aria-describedby="privacy-scope-help" onChange={(event) => { setContactId(event.target.value); setPrivacyError(""); setPrivacyMessage(""); }}><option value="">{jobType === "export" ? "ส่งออกทั้งเวิร์กสเปซ" : "เลือกข้อมูลติดต่อที่จะลบ"}</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.displayName}</option>)}</select><span className="field-help" id="privacy-scope-help">{jobType === "export" ? "เลือกข้อมูลติดต่อหรือส่งออกทั้งเวิร์กสเปซ" : "การลบต้องระบุข้อมูลติดต่อหนึ่งรายการ และไม่สามารถลบทั้งเวิร์กสเปซได้"}</span></label><button type="submit" disabled={working}>{working ? "กำลังส่งคำขอ..." : "ส่งคำขอ"}</button></form>
          {privacyError ? <p className="inline-message error" role="alert">{privacyError}</p> : null}
          {privacyMessage ? <p className={`inline-message${privacyMessageKind === "error" ? " error" : ""}`} role={privacyMessageKind === "error" ? "alert" : "status"}>{privacyMessage}</p> : null}
        </section>
        <section className="tool-band"><div className="band-heading"><div><p>ระงับการลบตามข้อกำหนด</p><h2>การสนทนาที่เก็บไว้ตามคำสั่งระงับการลบ</h2></div><span>{holds.length}</span></div>
          <p className="control-copy">การลบข้อมูลจะทำให้ข้อมูลติดต่อไม่ระบุตัวตน แต่จะไม่แก้ไขข้อความของการสนทนาที่ถูกระงับการลบ ตั้งค่าหรือยกเลิกการระงับด้วยการยืนยันตัวตนล่าสุดผ่าน <code>POST /tenant/conversations/&#123;id&#125;/legal-hold</code> (ต้องระบุเหตุผลเมื่อเปิดใช้งาน)</p>
          <div className="data-table">
            {holds.map((hold) => <div className="data-row" key={hold.id}><div><strong data-no-localize>{hold.contactName}</strong><span data-no-localize>{hold.reason}</span></div><span>{new Date(hold.setAt).toLocaleString(currentIntlLocale())}</span></div>)}
            {!holds.length ? <div className="pending-line"><strong>ไม่มีคำสั่งระงับการลบ</strong><span>รายการที่ระงับการลบจะแสดงที่นี่ก่อนดำเนินการลบข้อมูล</span></div> : null}
          </div>
        </section>
        <section className="tool-band muted-band"><div className="band-heading"><div><p>กำลังดำเนินการ</p><h2>ประวัติคำขอ</h2></div><span>{jobs.length}</span></div><div className="data-table">
          {jobs.map((job) => <div className="data-row" key={job.id}><div><strong>{job.jobType === "export" ? "Data export" : "Data erasure"}</strong><span>{job.contactName || "Entire workspace"}</span></div><span>{job.status}</span>{job.jobType === "export" && job.status === "completed" ? <a className="secondary-link" href={`/tenant/privacy-jobs/${job.id}/download`}>ดาวน์โหลด</a> : <span>{new Date(job.requestedAt).toLocaleString(currentIntlLocale())}</span>}</div>)}
          {!jobs.length ? <div className="pending-line"><strong>ยังไม่มีคำขอด้านความเป็นส่วนตัว</strong><span>งานที่ส่งแล้วจะแสดงที่นี่</span></div> : null}
        </div></section>
      </>}
    </section>
  </main>;
}
