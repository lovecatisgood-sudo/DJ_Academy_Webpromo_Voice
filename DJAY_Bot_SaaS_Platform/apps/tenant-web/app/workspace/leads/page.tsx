"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { currentIntlLocale, safeMutationFetch } from "@djay/shared";
import { WorkspaceSidebar } from "../WorkspaceSidebar";
import { WorkspacePageLoadError, WorkspaceSessionLoadError, WorkspaceViewOnly } from "../WorkspaceAccess";
import { WorkspaceSupportBanner } from "../WorkspaceSupportBanner";
import { useWorkspaceSession } from "../useWorkspaceSession";

type Contact = { id: string; displayName: string };
type Lead = { id: string; contactId: string; contactName: string; title: string; source: string; status: string; updatedAt: string };

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
  if (session.error) return <WorkspaceSessionLoadError onRetry={() => window.location.reload()} />;
  if (session.loading || !session.selectedTenantId) return <main className="workspace-loading">Loading leads...</main>;
  if (loadError) return <WorkspacePageLoadError active="leads" title="Leads" resource="the sales pipeline" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId} onSelect={(id) => void session.selectWorkspace(id)} onLogout={() => void session.logout()} onRetry={() => void load()} />;
  return <main className="workspace-shell">
    <WorkspaceSidebar active="leads" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId} onSelect={(id) => void session.selectWorkspace(id)} onLogout={() => void session.logout()} />
    <section className="workspace-main"><WorkspaceSupportBanner tenantId={session.selectedTenantId} />
      <header className="workspace-header"><div><p>Sales</p><h1>Leads</h1></div><span data-no-localize className="role-label">{workspace?.businessName}</span></header>
      {!canWrite ? <WorkspaceViewOnly>You can review the sales pipeline. An operator or administrator can create leads.</WorkspaceViewOnly> : null}
      {canWrite ? <section className="tool-band"><div className="band-heading"><div><p>Pipeline</p><h2>Create lead</h2></div></div>
        <form className="record-form lead-form" onSubmit={createLead}>
          <label>Contact<select name="contactId" required defaultValue=""><option value="" disabled>Select contact</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.displayName}</option>)}</select></label>
          <label>Opportunity<input name="title" minLength={2} maxLength={200} required /></label>
          <label>Source<input name="source" minLength={2} maxLength={80} defaultValue="manual" required /></label>
          <button type="submit" disabled={working || !contacts.length}>{working ? "Creating..." : "Create lead"}</button>
        </form>{message ? <p className="inline-message" role="status">{message}</p> : null}
      </section> : null}
      <section className="tool-band muted-band"><div className="band-heading"><div><p>Pipeline</p><h2>Active records</h2></div><span>{leads.length}</span></div>
        <div className="data-table">{leads.map((lead) => <div className="data-row" key={lead.id}><div data-no-localize><strong>{lead.title}</strong><span>{lead.contactName} / {lead.source}</span></div><span className="status-text">{lead.status.replaceAll("_", " ")}</span><span>{new Date(lead.updatedAt).toLocaleDateString(currentIntlLocale())}</span></div>)}
        {!leads.length ? <div className="pending-line"><strong>No leads</strong><span>Create one from a contact.</span></div> : null}</div>
      </section>
    </section>
  </main>;
}
