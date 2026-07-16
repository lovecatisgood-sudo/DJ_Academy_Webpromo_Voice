"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { safeMutationFetch } from "@djay/shared";
import { WorkspaceSidebar } from "../WorkspaceSidebar";
import { WorkspacePageLoadError, WorkspaceSessionLoadError, WorkspaceViewOnly } from "../WorkspaceAccess";
import { WorkspaceSupportBanner } from "../WorkspaceSupportBanner";
import { useWorkspaceSession } from "../useWorkspaceSession";

type Identity = { kind: string; value: string; verificationStatus: string };
type Contact = { id: string; displayName: string; locale: string; consentStatus: string; identities: Identity[]; leadCount: number; updatedAt: string };
type IdentityReview = { id: string; sourceContactId: string; sourceContactName: string; candidateContactId: string; candidateContactName: string; identityKind: "email" | "phone"; matchValue: string; observedAt: string };

export default function ContactsPage() {
  const session = useWorkspaceSession();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [identityReviews, setIdentityReviews] = useState<IdentityReview[]>([]);
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const workspace = useMemo(() => session.workspaces.find((item) => item.tenantId === session.selectedTenantId), [session]);
  const canWrite = session.allows("contacts.write");

  async function load() {
    try {
      const response = await fetch("/tenant/contacts", { cache: "no-store" });
      if (!response.ok) throw new Error("contacts_unavailable");
      const result = await response.json(); setContacts(result.contacts || []);
      setIdentityReviews(result.identityReviewCandidates || []);
      setLoadError(false);
    } catch { setLoadError(true); }
  }
  useEffect(() => { if (session.selectedTenantId) void load(); }, [session.selectedTenantId]);

  async function createContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!canWrite) return; setWorking(true); setMessage("");
    const form = event.currentTarget; const data = new FormData(form);
    const email = String(data.get("email") || "").trim(); const phone = String(data.get("phone") || "").trim();
    const response = await safeMutationFetch("/tenant/contacts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: data.get("displayName"), ...(email ? { email } : {}), ...(phone ? { phone } : {}), locale: data.get("locale"), consentStatus: data.get("consentStatus") }),
    });
    const result = await response.json(); setWorking(false);
    if (response.status === 409) { setMessage(`Possible duplicate found. Review existing contact${result.candidateContactIds?.length === 1 ? "" : "s"} before merging.`); return; }
    if (!response.ok) { setMessage("Contact could not be created."); return; }
    form.reset(); setMessage("Contact created."); await load();
  }

  if (session.error) return <WorkspaceSessionLoadError onRetry={() => window.location.reload()} />;
  if (session.loading || !session.selectedTenantId) return <main className="workspace-loading">Loading contacts...</main>;
  if (loadError) return <WorkspacePageLoadError active="contacts" title="Contacts" resource="customer records" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId} onSelect={(id) => void session.selectWorkspace(id)} onLogout={() => void session.logout()} onRetry={() => void load()} />;
  return (
    <main className="workspace-shell">
      <WorkspaceSidebar active="contacts" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId} onSelect={(id) => void session.selectWorkspace(id)} onLogout={() => void session.logout()} />
      <section className="workspace-main">
        <WorkspaceSupportBanner tenantId={session.selectedTenantId} />
        <header className="workspace-header"><div><p>Customers</p><h1>Contacts</h1></div><span className="role-label">{workspace?.businessName}</span></header>
        {!canWrite ? <WorkspaceViewOnly>You can review customer records. An operator or administrator can create contacts.</WorkspaceViewOnly> : null}
        {canWrite ? <section className="tool-band">
          <div className="band-heading"><div><p>New record</p><h2>Create contact</h2></div></div>
          <form className="record-form" onSubmit={createContact}>
            <label>Name<input name="displayName" maxLength={200} required /></label>
            <label>Email<input name="email" type="email" maxLength={320} /></label>
            <label>Phone<input name="phone" type="tel" maxLength={32} /></label>
            <label>Language<select name="locale" defaultValue="en"><option value="en">English</option><option value="th">Thai</option></select></label>
            <label>Consent<select name="consentStatus" defaultValue="unknown"><option value="unknown">Unknown</option><option value="granted">Granted</option><option value="denied">Denied</option><option value="withdrawn">Withdrawn</option></select></label>
            <button type="submit" disabled={working}>{working ? "Creating..." : "Create contact"}</button>
          </form>
          {message ? <p className="inline-message" role="status">{message}</p> : null}
        </section> : null}
        <section className="tool-band">
          <div className="band-heading"><div><p>Suggestions only</p><h2>Possible contact matches</h2></div><span>{identityReviews.length}</span></div>
          <p className="field-help">Matching email or phone values never merge customer records automatically. Review these records before any future audited merge workflow.</p>
          <div className="data-table">
            {identityReviews.map((review) => <div className="data-row contact-row" key={review.id}>
              <div><strong>{review.sourceContactName}</strong><span>may match {review.candidateContactName}</span></div>
              <span>{review.identityKind}</span><span>{review.matchValue}</span>
            </div>)}
            {!identityReviews.length ? <div className="pending-line"><strong>No possible matches</strong><span>New shared email or phone values appear here for review.</span></div> : null}
          </div>
        </section>
        <section className="tool-band muted-band">
          <div className="band-heading"><div><p>Directory</p><h2>Customer records</h2></div><span>{contacts.length}</span></div>
          <div className="data-table">
            {contacts.map((contact) => <div className="data-row contact-row" key={contact.id}>
              <div><strong>{contact.displayName}</strong><span>{contact.identities.map((identity) => identity.value).join(" / ") || "No active identity"}</span></div>
              <span>{contact.consentStatus.replaceAll("_", " ")} consent</span><span>{contact.leadCount} lead{contact.leadCount === 1 ? "" : "s"}</span>
            </div>)}
            {!contacts.length ? <div className="pending-line"><strong>No contacts</strong><span>Customer records appear here.</span></div> : null}
          </div>
        </section>
      </section>
    </main>
  );
}
