"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  contactCreationError,
  contactDisplayNameFieldConstraints,
  contactPhoneFieldConstraints,
  emailFieldConstraints,
  normalizeContactText,
  safeMutationFetch,
  uiCopy,
} from "@djay/shared";
import { WorkspaceSidebar } from "../WorkspaceSidebar";
import { WorkspacePageLoadError, WorkspaceSessionLoadError, WorkspaceViewOnly } from "../WorkspaceAccess";
import { WorkspaceSupportBanner } from "../WorkspaceSupportBanner";
import { useWorkspaceSession } from "../useWorkspaceSession";

type Identity = { kind: string; value: string; verificationStatus: string };
type ContactTag = { key: string; label: string; color: string };
type ContactAttribute = { key: string; label: string; valueType: "text" | "number" | "boolean" | "date"; value: string };
type Contact = { id: string; displayName: string; locale: string; consentStatus: string; identities: Identity[]; tags: ContactTag[]; attributes: ContactAttribute[]; leadCount: number; updatedAt: string };
type IdentityReview = { id: string; sourceContactId: string; sourceContactName: string; candidateContactId: string; candidateContactName: string; identityKind: "email" | "phone"; matchValue: string; observedAt: string };

export default function ContactsPage() {
  const session = useWorkspaceSession();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [identityReviews, setIdentityReviews] = useState<IdentityReview[]>([]);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");
  const [working, setWorking] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [attributeDrafts, setAttributeDrafts] = useState<ContactAttribute[]>([]);
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

  function clearContactValidity(form: HTMLFormElement | null) {
    if (!form) return;
    for (const field of ["displayName", "email", "phone"]) {
      const input = form.elements.namedItem(field);
      if (input instanceof HTMLInputElement) input.setCustomValidity("");
    }
  }

  async function createContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!canWrite) return;
    const form = event.currentTarget; const data = new FormData(form);
    const validationError = contactCreationError({
      displayName: data.get("displayName"), email: data.get("email"), phone: data.get("phone"),
    });
    if (validationError) {
      const input = form.elements.namedItem(validationError.field);
      if (input instanceof HTMLInputElement) {
        input.setCustomValidity(validationError.message);
        input.reportValidity();
      }
      setMessageTone("error");
      setMessage(validationError.message);
      return;
    }
    setWorking(true); setMessage("");
    const displayName = normalizeContactText(data.get("displayName"));
    const email = normalizeContactText(data.get("email")); const phone = normalizeContactText(data.get("phone"));
    const response = await safeMutationFetch("/tenant/contacts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName, ...(email ? { email } : {}), ...(phone ? { phone } : {}), locale: data.get("locale"), consentStatus: data.get("consentStatus") }),
    });
    const result = await response.json(); setWorking(false);
    if (response.status === 409) { setMessageTone("error"); setMessage(uiCopy("อาจมีข้อมูลติดต่อซ้ำ โปรดตรวจข้อมูลเดิมก่อนรวมรายการ", `Possible duplicate found. Review existing contact${result.candidateContactIds?.length === 1 ? "" : "s"} before merging.`)); return; }
    if (!response.ok) { setMessageTone("error"); setMessage("Contact could not be created."); return; }
    form.reset(); setMessageTone("success"); setMessage("Contact created."); await load();
  }

  function editMetadata(contact: Contact) {
    setEditingContactId(contact.id);
    setTagDraft(contact.tags.map((tag) => tag.label).join(", "));
    setAttributeDrafts(contact.attributes);
    setMessage("");
  }

  async function saveMetadata(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!canWrite || !editingContactId) return;
    const tags = [...new Set(tagDraft.split(",").map((value) => value.trim()).filter(Boolean))].map((label) => ({
      key: label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64), label, color: "#236b4e",
    })).filter((tag) => /^[a-z][a-z0-9_]{0,63}$/.test(tag.key));
    const attributes = attributeDrafts.map((attribute) => ({ ...attribute, key: attribute.key.trim().toLowerCase(), label: attribute.label.trim(), value: attribute.value.trim() }))
      .filter((attribute) => attribute.key && attribute.label && attribute.value);
    setWorking(true); setMessage("");
    const response = await safeMutationFetch(`/tenant/contacts/${editingContactId}/metadata`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tags, attributes }),
    });
    setWorking(false);
    if (!response.ok) { setMessageTone("error"); setMessage("Customer metadata could not be saved. Check attribute keys and typed values."); return; }
    setEditingContactId(null); setMessageTone("success"); setMessage("Customer metadata saved."); await load();
  }

  if (session.error) return <WorkspaceSessionLoadError onRetry={() => window.location.reload()} />;
  if (session.loading || !session.selectedTenantId) return <main className="workspace-loading">Loading contacts...</main>;
  if (loadError) return <WorkspacePageLoadError active="contacts" title="Contacts" resource="customer records" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId} onSelect={(id) => void session.selectWorkspace(id)} onLogout={() => void session.logout()} onRetry={() => void load()} />;
  return (
    <main className="workspace-shell">
      <WorkspaceSidebar active="contacts" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId} onSelect={(id) => void session.selectWorkspace(id)} onLogout={() => void session.logout()} />
      <section className="workspace-main">
        <WorkspaceSupportBanner tenantId={session.selectedTenantId} />
        <header className="workspace-header"><div><p>Customers</p><h1>Contacts</h1></div><span data-no-localize className="role-label">{workspace?.businessName}</span></header>
        {!canWrite ? <WorkspaceViewOnly>You can review customer records. An operator or administrator can create contacts.</WorkspaceViewOnly> : null}
        {canWrite ? <section className="tool-band">
          <div className="band-heading"><div><p>New record</p><h2>Create contact</h2></div></div>
          <form className="record-form" onSubmit={createContact}>
            <label>Name<input name="displayName" {...contactDisplayNameFieldConstraints} required onInput={(event) => clearContactValidity(event.currentTarget.form)} /></label>
            <label>Email<input name="email" type="email" aria-describedby="contact-identity-help" {...emailFieldConstraints} onInput={(event) => clearContactValidity(event.currentTarget.form)} /></label>
            <label>Phone<input name="phone" type="tel" aria-describedby="contact-identity-help" {...contactPhoneFieldConstraints} onInput={(event) => clearContactValidity(event.currentTarget.form)} /></label>
            <p className="field-help" id="contact-identity-help">Enter at least one customer contact method: email or phone.</p>
            <label>Language<select name="locale" defaultValue="th"><option value="th">ไทย</option><option value="en">English</option></select></label>
            <label>Consent<select name="consentStatus" defaultValue="unknown"><option value="unknown">Unknown</option><option value="granted">Granted</option><option value="denied">Denied</option><option value="withdrawn">Withdrawn</option></select></label>
            <button type="submit" disabled={working}>{working ? "Creating..." : "Create contact"}</button>
          </form>
          {message ? <p className={`inline-message ${messageTone}`} role={messageTone === "error" ? "alert" : "status"}>{message}</p> : null}
        </section> : null}
        <section className="tool-band">
          <div className="band-heading"><div><p>Suggestions only</p><h2>Possible contact matches</h2></div><span>{identityReviews.length}</span></div>
          <p className="field-help">Matching email or phone values never merge customer records automatically. Review these records before any future audited merge workflow.</p>
          <div className="data-table">
            {identityReviews.map((review) => <div className="data-row contact-row" key={review.id}>
              <div><strong data-no-localize>{review.sourceContactName}</strong><span>may match <span data-no-localize>{review.candidateContactName}</span></span></div>
              <span>{review.identityKind}</span><span data-no-localize>{review.matchValue}</span>
            </div>)}
            {!identityReviews.length ? <div className="pending-line"><strong>No possible matches</strong><span>New shared email or phone values appear here for review.</span></div> : null}
          </div>
        </section>
        <section className="tool-band muted-band">
          <div className="band-heading"><div><p>Directory</p><h2>Customer records</h2></div><span>{contacts.length}</span></div>
          <div className="data-table">
            {contacts.map((contact) => <div className="data-row contact-row" key={contact.id}>
              <div data-no-localize><strong>{contact.displayName}</strong><span>{contact.identities.map((identity) => identity.value).join(" / ") || "ไม่มีข้อมูลติดต่อที่ใช้งานอยู่"}</span>
                {contact.tags.length ? <span>{contact.tags.map((tag) => tag.label).join(" · ")}</span> : null}
                {contact.attributes.length ? <span>{contact.attributes.map((attribute) => `${attribute.label}: ${attribute.value}`).join(" · ")}</span> : null}
              </div>
              <span>{contact.consentStatus.replaceAll("_", " ")} consent</span>
              <span>{contact.leadCount} lead{contact.leadCount === 1 ? "" : "s"}{canWrite ? <button type="button" className="table-action" onClick={() => editMetadata(contact)}>Edit profile</button> : null}</span>
            </div>)}
            {!contacts.length ? <div className="pending-line"><strong>No contacts</strong><span>Customer records appear here.</span></div> : null}
          </div>
        </section>
        {editingContactId ? <section className="tool-band">
          <div className="band-heading"><div><p>Customer profile</p><h2>Tags and attributes</h2></div><button type="button" onClick={() => setEditingContactId(null)}>Close</button></div>
          <form className="record-form" onSubmit={saveMetadata}>
            <label>Tags<input value={tagDraft} maxLength={800} placeholder="Qualified lead, VIP, Follow up" onChange={(event) => setTagDraft(event.target.value)} /></label>
            {attributeDrafts.map((attribute, index) => <fieldset key={`${attribute.key}-${index}`} className="record-form">
              <label>Key<input value={attribute.key} pattern="[a-z][a-z0-9_]{0,63}" maxLength={64} required onChange={(event) => setAttributeDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, key: event.target.value } : item))} /></label>
              <label>Label<input value={attribute.label} maxLength={80} required onChange={(event) => setAttributeDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} /></label>
              <label>Type<select value={attribute.valueType} onChange={(event) => setAttributeDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, valueType: event.target.value as ContactAttribute["valueType"], value: "" } : item))}><option value="text">Text</option><option value="number">Number</option><option value="boolean">Yes / No</option><option value="date">Date</option></select></label>
              <label>Value{attribute.valueType === "boolean" ? <select value={attribute.value} required onChange={(event) => setAttributeDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item))}><option value="">Select</option><option value="true">Yes</option><option value="false">No</option></select> : <input type={attribute.valueType === "date" ? "date" : attribute.valueType === "number" ? "number" : "text"} value={attribute.value} maxLength={2000} required onChange={(event) => setAttributeDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item))} />}</label>
              <button type="button" onClick={() => setAttributeDrafts((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove attribute</button>
            </fieldset>)}
            <button type="button" onClick={() => setAttributeDrafts((current) => [...current, { key: "", label: "", valueType: "text", value: "" }])}>Add attribute</button>
            <button type="submit" disabled={working}>{working ? "Saving..." : "Save profile"}</button>
          </form>
          {message ? <p className={`inline-message ${messageTone}`} role={messageTone === "error" ? "alert" : "status"}>{message}</p> : null}
        </section> : null}
      </section>
    </main>
  );
}
