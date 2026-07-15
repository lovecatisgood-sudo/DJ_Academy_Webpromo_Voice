"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { WorkspaceSidebar } from "../WorkspaceSidebar";
import { WorkspaceSupportBanner } from "../WorkspaceSupportBanner";
import { useWorkspaceSession } from "../useWorkspaceSession";

type Contact = { id: string; displayName: string };
type PrivacyJob = { id: string; contactId: string | null; contactName: string | null; jobType: string; status: string; requestedAt: string; completedAt: string | null };

export default function DataControlsPage() {
  const session = useWorkspaceSession(); const [contacts, setContacts] = useState<Contact[]>([]); const [jobs, setJobs] = useState<PrivacyJob[]>([]);
  const [message, setMessage] = useState(""); const [working, setWorking] = useState(false);
  const workspace = useMemo(() => session.workspaces.find((item) => item.tenantId === session.selectedTenantId), [session]);
  const canManage = workspace?.role === "tenant_master_admin";
  async function load() {
    const contactResponse = await fetch("/tenant/contacts", { cache: "no-store" }); if (contactResponse.ok) setContacts((await contactResponse.json()).contacts || []);
    if (canManage) { const jobsResponse = await fetch("/tenant/privacy-jobs", { cache: "no-store" }); if (jobsResponse.ok) setJobs((await jobsResponse.json()).jobs || []); }
  }
  useEffect(() => { if (session.selectedTenantId) void load(); }, [session.selectedTenantId, canManage]);
  async function requestJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setWorking(true); setMessage(""); const form = event.currentTarget; const data = new FormData(form); const contactId = String(data.get("contactId") || ""); const jobType = String(data.get("jobType") || "export");
    if (jobType === "erasure" && !window.confirm("Erase this contact's personal data? Audit lineage and legally retained records remain.")) { setWorking(false); return; }
    const response = await fetch("/tenant/privacy-jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobType, ...(contactId ? { contactId } : {}), idempotencyKey: crypto.randomUUID() }) });
    setWorking(false); if (!response.ok) { setMessage("Privacy request could not be accepted."); return; } setMessage("Privacy request accepted for processing."); await load();
  }
  if (session.loading || !session.selectedTenantId) return <main className="workspace-loading">Loading data controls...</main>;
  return <main className="workspace-shell"><WorkspaceSidebar active="data" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId} onSelect={(id) => void session.selectWorkspace(id)} onLogout={() => void session.logout()} />
    <section className="workspace-main"><WorkspaceSupportBanner tenantId={session.selectedTenantId} />
      <header className="workspace-header"><div><p>Governance</p><h1>Data controls</h1></div><span className="role-label">{workspace?.businessName}</span></header>
      {!canManage ? <section className="tool-band"><div className="band-heading"><div><p>Restricted</p><h2>Tenant Master Admin access required</h2></div></div><p className="control-copy">Privacy exports and erasure requests are reserved for the registered workspace owner.</p></section> : <>
        <section className="tool-band"><div className="band-heading"><div><p>Privacy requests</p><h2>Export or erase personal data</h2></div></div>
          <form className="record-form privacy-form" onSubmit={requestJob}><label>Request<select name="jobType" defaultValue="export"><option value="export">Data export</option><option value="erasure">Data erasure</option></select></label><label>Contact<select name="contactId" defaultValue=""><option value="">Entire workspace export</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.displayName}</option>)}</select></label><button type="submit" disabled={working}>{working ? "Requesting..." : "Submit request"}</button></form>
          {message ? <p className="inline-message" role="status">{message}</p> : null}
        </section>
        <section className="tool-band muted-band"><div className="band-heading"><div><p>Processing</p><h2>Request history</h2></div><span>{jobs.length}</span></div><div className="data-table">
          {jobs.map((job) => <div className="data-row" key={job.id}><div><strong>{job.jobType === "export" ? "Data export" : "Data erasure"}</strong><span>{job.contactName || "Entire workspace"}</span></div><span>{job.status}</span>{job.jobType === "export" && job.status === "completed" ? <a className="secondary-link" href={`/tenant/privacy-jobs/${job.id}/download`}>Download</a> : <span>{new Date(job.requestedAt).toLocaleString()}</span>}</div>)}
          {!jobs.length ? <div className="pending-line"><strong>No privacy requests</strong><span>Submitted jobs appear here.</span></div> : null}
        </div></section>
      </>}
    </section>
  </main>;
}
