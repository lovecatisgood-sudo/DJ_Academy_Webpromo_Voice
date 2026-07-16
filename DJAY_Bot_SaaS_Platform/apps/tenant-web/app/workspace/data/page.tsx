"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { privacyJobSelectionError, safeMutationFetch, type PrivacyJobType } from "@djay/shared";
import { WorkspaceSidebar } from "../WorkspaceSidebar";
import { WorkspacePageLoadError, WorkspaceSessionLoadError } from "../WorkspaceAccess";
import { WorkspaceSupportBanner } from "../WorkspaceSupportBanner";
import { useWorkspaceSession } from "../useWorkspaceSession";

type Contact = { id: string; displayName: string };
type PrivacyJob = { id: string; contactId: string | null; contactName: string | null; jobType: string; status: string; requestedAt: string; completedAt: string | null };
type RetentionPolicy = { transcriptDays: number; recordingDays: number; voicePlanMaximumDays: number | null; updatedAt: string };

export default function DataControlsPage() {
  const session = useWorkspaceSession(); const [contacts, setContacts] = useState<Contact[]>([]); const [jobs, setJobs] = useState<PrivacyJob[]>([]);
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
        const [contactResponse, jobsResponse, retentionResponse] = await Promise.all([
          fetch("/tenant/contacts", { cache: "no-store" }),
          fetch("/tenant/privacy-jobs", { cache: "no-store" }),
          fetch("/tenant/retention-policy", { cache: "no-store" }),
        ]);
        if (!contactResponse.ok || !jobsResponse.ok || !retentionResponse.ok) throw new Error("privacy_unavailable");
        setContacts((await contactResponse.json()).contacts || []);
        setJobs((await jobsResponse.json()).jobs || []);
        setRetention((await retentionResponse.json()).policy || null);
        setLoadError(false);
      } catch { setLoadError(true); }
    }
  }
  useEffect(() => { if (session.selectedTenantId) void load(); }, [session.selectedTenantId, canManage]);
  async function requestJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPrivacyMessage(""); const error = privacyJobSelectionError({ jobType, contactId });
    if (error) { setPrivacyError(error); requestAnimationFrame(() => document.querySelector<HTMLSelectElement>("#privacy-contact")?.focus()); return; }
    const contact = contacts.find((item) => item.id === contactId);
    if (jobType === "erasure" && (!contact || !window.confirm(`Permanently erase personal data for ${contact.displayName}? This cannot be undone. Audit lineage and legally retained records remain.`))) return;
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
  if (session.loading || !session.selectedTenantId) return <main className="workspace-loading">Loading data controls...</main>;
  if (loadError) return <WorkspacePageLoadError active="data" title="Data controls" resource="privacy controls" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId} onSelect={(id) => void session.selectWorkspace(id)} onLogout={() => void session.logout()} onRetry={() => void load()} />;
  return <main className="workspace-shell"><WorkspaceSidebar active="data" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId} onSelect={(id) => void session.selectWorkspace(id)} onLogout={() => void session.logout()} />
    <section className="workspace-main"><WorkspaceSupportBanner tenantId={session.selectedTenantId} />
      <header className="workspace-header"><div><p>Governance</p><h1>Data controls</h1></div><span className="role-label">{workspace?.businessName}</span></header>
      {!canManage ? <section className="tool-band"><div className="band-heading"><div><p>Restricted</p><h2>Tenant Master Admin access required</h2></div></div><p className="control-copy">Privacy exports and erasure requests are reserved for the registered workspace owner.</p></section> : <>
        <section className="tool-band"><div className="band-heading"><div><p>Voice privacy</p><h2>Transcript retention</h2></div><span>{retention?.voicePlanMaximumDays ? `Plan maximum ${retention.voicePlanMaximumDays} days` : "Workspace policy"}</span></div>
          <p className="control-copy">Expired message and Voice turn content is replaced with a non-personal audit tombstone. Call outcome metadata remains for operational reporting. Voice recording remains disabled.</p>
          {retention ? <form className="retention-form" onSubmit={saveRetention}><label>Keep transcripts for<select name="transcriptDays" defaultValue={retention.transcriptDays} key={retention.updatedAt}>{[30, 60, 90, 180, 365, 730, 1095, 1825, 3650].filter((days) => !retention.voicePlanMaximumDays || days <= retention.voicePlanMaximumDays).map((days) => <option key={days} value={days}>{days} days</option>)}</select></label><label>Voice recording<input value="Disabled" readOnly aria-label="Voice recording status" /></label><button type="submit" disabled={working}>{working ? "Saving..." : "Save retention"}</button></form> : <p className="control-copy">Loading retention policy...</p>}
          {retentionMessage ? <p className={`inline-message${retentionMessageKind === "error" ? " error" : ""}`} role={retentionMessageKind === "error" ? "alert" : "status"}>{retentionMessage}</p> : null}
        </section>
        <section className="tool-band"><div className="band-heading"><div><p>Privacy requests</p><h2>Export or erase personal data</h2></div></div>
          <form className="record-form privacy-form" onSubmit={requestJob} noValidate><label>Request<select name="jobType" value={jobType} onChange={(event) => { setJobType(event.target.value as PrivacyJobType); setPrivacyError(""); setPrivacyMessage(""); }}><option value="export">Data export</option><option value="erasure">Data erasure</option></select></label><label>Contact<select id="privacy-contact" name="contactId" value={contactId} aria-invalid={Boolean(privacyError) || undefined} aria-describedby="privacy-scope-help" onChange={(event) => { setContactId(event.target.value); setPrivacyError(""); setPrivacyMessage(""); }}><option value="">{jobType === "export" ? "Entire workspace export" : "Select a contact to erase"}</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.displayName}</option>)}</select><span className="field-help" id="privacy-scope-help">{jobType === "export" ? "Choose a contact or export the entire workspace." : "Erasure always requires one specific contact and cannot target the entire workspace."}</span></label><button type="submit" disabled={working}>{working ? "Requesting..." : "Submit request"}</button></form>
          {privacyError ? <p className="inline-message error" role="alert">{privacyError}</p> : null}
          {privacyMessage ? <p className={`inline-message${privacyMessageKind === "error" ? " error" : ""}`} role={privacyMessageKind === "error" ? "alert" : "status"}>{privacyMessage}</p> : null}
        </section>
        <section className="tool-band muted-band"><div className="band-heading"><div><p>Processing</p><h2>Request history</h2></div><span>{jobs.length}</span></div><div className="data-table">
          {jobs.map((job) => <div className="data-row" key={job.id}><div><strong>{job.jobType === "export" ? "Data export" : "Data erasure"}</strong><span>{job.contactName || "Entire workspace"}</span></div><span>{job.status}</span>{job.jobType === "export" && job.status === "completed" ? <a className="secondary-link" href={`/tenant/privacy-jobs/${job.id}/download`}>Download</a> : <span>{new Date(job.requestedAt).toLocaleString()}</span>}</div>)}
          {!jobs.length ? <div className="pending-line"><strong>No privacy requests</strong><span>Submitted jobs appear here.</span></div> : null}
        </div></section>
      </>}
    </section>
  </main>;
}
