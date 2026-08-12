"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { currentIntlLocale, safeMutationFetch } from "@djay/shared";
import { WorkspaceSidebar } from "../WorkspaceSidebar";
import { WorkspacePageLoadError, WorkspaceSessionLoadError, WorkspaceViewOnly } from "../WorkspaceAccess";
import { WorkspaceSupportBanner } from "../WorkspaceSupportBanner";
import { useWorkspaceSession } from "../useWorkspaceSession";

type Contact = { id: string; displayName: string };
type Lead = { id: string; contactId: string; contactName: string; title: string; source: string; status: string; updatedAt: string };
const pipelineStages = [
  ["new", "New"], ["pending_follow_up", "Follow up"], ["appointment_made", "Appointment"],
  ["not_closed_follow", "Keep nurturing"], ["closed_deal", "Won"], ["disqualified", "Not a fit"],
] as const;

export default function LeadsPage() {
  const session = useWorkspaceSession();
  const [contacts, setContacts] = useState<Contact[]>([]); const [leads, setLeads] = useState<Lead[]>([]);
  const [message, setMessage] = useState(""); const [working, setWorking] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const workspace = useMemo(() => session.workspaces.find((item) => item.tenantId === session.selectedTenantId), [session]);
  const canWrite = session.allows("leads.write");
  async function load() {
    try {
      const [contactResponse, leadResponse] = await Promise.all([fetch("/tenant/contacts", { cache: "no-store" }), fetch("/tenant/leads", { cache: "no-store" })]);
      if (!contactResponse.ok || !leadResponse.ok) throw new Error("leads_unavailable");
      setContacts((await contactResponse.json()).contacts || []);
      setLeads((await leadResponse.json()).leads || []);
      setLoadError(false);
    } catch { setLoadError(true); }
  }
  useEffect(() => { if (session.selectedTenantId) void load(); }, [session.selectedTenantId]);
  async function createLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!canWrite) return; setWorking(true); setMessage(""); const form = event.currentTarget; const data = new FormData(form);
    const response = await safeMutationFetch("/tenant/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contactId: data.get("contactId"), title: data.get("title"), source: data.get("source"), status: "new" }) });
    setWorking(false); if (!response.ok) { setMessage("Lead could not be created."); return; }
    form.reset(); setMessage("Lead created."); await load();
  }
  async function updateStatus(leadId: string, status: string) {
    if (!canWrite) return;
    setWorking(true); setMessage("");
    const response = await safeMutationFetch("/tenant/leads", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId, status }),
    });
    setWorking(false);
    if (!response.ok) { setMessage("The lead stage could not be changed. Please retry."); return; }
    setMessage("Lead stage updated."); await load();
  }
  if (session.error) return <WorkspaceSessionLoadError onRetry={() => window.location.reload()} />;
  if (session.loading || !session.selectedTenantId) return <main className="workspace-loading">กำลังโหลดผู้สนใจ...</main>;
  if (loadError) return <WorkspacePageLoadError active="leads" title="ผู้สนใจ" resource="the sales pipeline" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId} onSelect={(id) => void session.selectWorkspace(id)} onLogout={() => void session.logout()} onRetry={() => void load()} />;
  return <main className="workspace-shell">
    <WorkspaceSidebar active="leads" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId} onSelect={(id) => void session.selectWorkspace(id)} onLogout={() => void session.logout()} />
    <section id="workspace-main" className="workspace-main" tabIndex={-1}><WorkspaceSupportBanner tenantId={session.selectedTenantId} />
      <header className="workspace-header"><div><p>การขาย</p><h1>ผู้สนใจ</h1></div><span data-no-localize className="role-label">{workspace?.businessName}</span></header>
      {!canWrite ? <WorkspaceViewOnly>คุณดูขั้นตอนงานขายได้ ผู้ปฏิบัติงานหรือผู้ดูแลเป็นผู้สร้างข้อมูลผู้สนใจ</WorkspaceViewOnly> : null}
      {canWrite ? <section className="tool-band"><div className="band-heading"><div><p>ขั้นตอนงานขาย</p><h2>สร้างข้อมูลผู้สนใจ</h2></div></div>
        <form className="record-form lead-form" onSubmit={createLead}>
          <label>ข้อมูลติดต่อ<select name="contactId" required defaultValue=""><option value="" disabled>เลือกข้อมูลติดต่อ</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.displayName}</option>)}</select></label>
          <label>โอกาสขาย<input name="title" minLength={2} maxLength={200} required /></label>
          <label>แหล่งข้อมูล<input name="source" minLength={2} maxLength={80} defaultValue="manual" required /></label>
          <button type="submit" disabled={working || !contacts.length}>{working ? "Creating..." : "Create lead"}</button>
        </form>{message ? <p className="inline-message" role="status">{message}</p> : null}
      </section> : null}
      <section className="tool-band muted-band"><div className="band-heading"><div><p>ขั้นตอนงานขาย</p><h2>รายการที่ใช้งานอยู่</h2></div><div className="band-heading-actions"><span>{leads.length}</span><a className="secondary-link" href="/tenant/leads?format=csv">ส่งออก CSV</a></div></div>
        <p className="band-copy">Move each opportunity to the next clear stage. Changes are saved against your workspace and recorded for accountability.</p>
        <div className="data-table lead-pipeline">{leads.map((lead) => <div className="data-row" key={lead.id}><div data-no-localize><strong>{lead.title}</strong><span>{lead.contactName} / {lead.source}</span></div>{canWrite ? <label className="compact-stage"><span className="visually-hidden">Stage for {lead.title}</span><select value={lead.status} disabled={working} onChange={(event) => void updateStatus(lead.id, event.target.value)}>{pipelineStages.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label> : <span className="status-text">{pipelineStages.find(([value]) => value === lead.status)?.[1] || lead.status.replaceAll("_", " ")}</span>}<span>{new Date(lead.updatedAt).toLocaleDateString(currentIntlLocale())}</span></div>)}
        {!leads.length ? <div className="pending-line"><strong>ยังไม่มีผู้สนใจ</strong><span>สร้างจากข้อมูลติดต่อ</span></div> : null}</div>
      </section>
    </section>
  </main>;
}
