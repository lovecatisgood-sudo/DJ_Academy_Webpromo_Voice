"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  contactCreationError,
  contactDisplayNameFieldConstraints,
  contactPhoneFieldConstraints,
  currentIntlLocale,
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
type CustomerJourney = {
  contact: { id: string; displayName: string; consentStatus: string; conversationCount: number; openLeadCount: number; appointmentCount: number; openCallbackCount: number };
  leads: { id: string; title: string; source: string; status: string; createdAt: string; updatedAt: string }[];
  conversations: { id: string; leadId: string | null; productKey: string; channelKind: string; status: string; startedAt: string }[];
  values: { currency: string; amountMinor: string }[];
  events: { id: string; kind: string; title: string; detail: string | null; occurredAt: string; leadId: string | null; conversationId: string | null; productKey: string | null; channelKind: string | null; amountMinor: string | null; currency: string | null }[];
  truncated: boolean;
};

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
  const [journey, setJourney] = useState<CustomerJourney | null>(null);
  const [journeyContactId, setJourneyContactId] = useState<string | null>(null);
  const [journeyLoading, setJourneyLoading] = useState(false);
  const [journeyError, setJourneyError] = useState(false);
  const workspace = useMemo(() => session.workspaces.find((item) => item.tenantId === session.selectedTenantId), [session]);
  const canWrite = session.allows("contacts.write");
  const canRecordValue = session.allows("leads.write");

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
  useEffect(() => { setJourney(null); setJourneyContactId(null); setJourneyError(false); }, [session.selectedTenantId]);

  async function loadJourney(contactId: string) {
    setJourneyContactId(contactId); setJourneyLoading(true); setJourneyError(false); setMessage("");
    try {
      const response = await fetch(`/tenant/contacts/${contactId}/journey`, { cache: "no-store" });
      if (!response.ok) throw new Error("journey_unavailable");
      setJourney((await response.json()).journey);
    } catch { setJourney(null); setJourneyError(true); }
    finally { setJourneyLoading(false); }
  }

  async function recordValue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!canRecordValue || !journeyContactId) return;
    const form = event.currentTarget; const data = new FormData(form);
    const amount = Number(data.get("amount"));
    if (!Number.isFinite(amount) || amount <= 0 || Math.round(amount * 100) > Number.MAX_SAFE_INTEGER) {
      setMessageTone("error"); setMessage("Enter a valid positive deal value."); return;
    }
    setWorking(true); setMessage("");
    const conversationId = String(data.get("conversationId") || "");
    const response = await safeMutationFetch(`/tenant/contacts/${journeyContactId}/journey`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId: data.get("leadId"), ...(conversationId ? { conversationId } : {}), amountMinor: Math.round(amount * 100), currency: data.get("currency"), idempotencyKey: crypto.randomUUID() }),
    });
    setWorking(false);
    if (!response.ok) { setMessageTone("error"); setMessage(response.status === 409 ? "Close the selected lead as a won deal before recording value." : "Deal value could not be recorded."); return; }
    form.reset(); setMessageTone("success"); setMessage("Merchant-confirmed deal value recorded."); await loadJourney(journeyContactId);
  }

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
  if (session.loading || !session.selectedTenantId) return <main className="workspace-loading">กำลังโหลดข้อมูลติดต่อ...</main>;
  if (loadError) return <WorkspacePageLoadError active="contacts" title="ข้อมูลติดต่อ" resource="customer records" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId} onSelect={(id) => void session.selectWorkspace(id)} onLogout={() => void session.logout()} onRetry={() => void load()} />;
  return (
    <main className="workspace-shell">
      <WorkspaceSidebar active="contacts" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId} onSelect={(id) => void session.selectWorkspace(id)} onLogout={() => void session.logout()} />
      <section id="workspace-main" className="workspace-main" tabIndex={-1}>
        <WorkspaceSupportBanner tenantId={session.selectedTenantId} />
        <header className="workspace-header"><div><p>ลูกค้า</p><h1>ข้อมูลติดต่อ</h1></div><span data-no-localize className="role-label">{workspace?.businessName}</span></header>
        {!canWrite ? <WorkspaceViewOnly>คุณดูข้อมูลลูกค้าได้ ผู้ปฏิบัติงานหรือผู้ดูแลเป็นผู้สร้างข้อมูลติดต่อ</WorkspaceViewOnly> : null}
        {canWrite ? <section className="tool-band">
          <div className="band-heading"><div><p>รายการใหม่</p><h2>สร้างข้อมูลติดต่อ</h2></div></div>
          <form className="record-form" onSubmit={createContact}>
            <label>ชื่อ<input name="displayName" {...contactDisplayNameFieldConstraints} required onInput={(event) => clearContactValidity(event.currentTarget.form)} /></label>
            <label>อีเมล<input name="email" type="email" aria-describedby="contact-identity-help" {...emailFieldConstraints} onInput={(event) => clearContactValidity(event.currentTarget.form)} /></label>
            <label>โทรศัพท์<input name="phone" type="tel" aria-describedby="contact-identity-help" {...contactPhoneFieldConstraints} onInput={(event) => clearContactValidity(event.currentTarget.form)} /></label>
            <p className="field-help" id="contact-identity-help">กรอกช่องทางติดต่อลูกค้าอย่างน้อยหนึ่งรายการ: อีเมลหรือโทรศัพท์</p>
            <label>ภาษา<select name="locale" defaultValue="th"><option value="th">ไทย</option><option value="en">English</option></select></label>
            <label>ความยินยอม<select name="consentStatus" defaultValue="unknown"><option value="unknown">ยังไม่ทราบ</option><option value="granted">อนุญาตแล้ว</option><option value="denied">ไม่อนุญาต</option><option value="withdrawn">ถอนคำขอแล้ว</option></select></label>
            <button type="submit" disabled={working}>{working ? "Creating..." : "Create contact"}</button>
          </form>
          {message ? <p className={`inline-message ${messageTone}`} role={messageTone === "error" ? "alert" : "status"}>{message}</p> : null}
        </section> : null}
        <section className="tool-band">
          <div className="band-heading"><div><p>เป็นเพียงคำแนะนำ</p><h2>ข้อมูลติดต่อที่อาจเป็นรายการเดียวกัน</h2></div><span>{identityReviews.length}</span></div>
          <p className="field-help">อีเมลหรือโทรศัพท์ที่ตรงกันจะไม่รวมข้อมูลลูกค้าโดยอัตโนมัติ โปรดตรวจสอบก่อนใช้กระบวนการรวมข้อมูลที่มีหลักฐานกำกับในอนาคต</p>
          <div className="data-table">
            {identityReviews.map((review) => <div className="data-row contact-row" key={review.id}>
              <div><strong data-no-localize>{review.sourceContactName}</strong><span>อาจเป็นรายการเดียวกัน <span data-no-localize>{review.candidateContactName}</span></span></div>
              <span>{review.identityKind}</span><span data-no-localize>{review.matchValue}</span>
            </div>)}
            {!identityReviews.length ? <div className="pending-line"><strong>ไม่พบรายการที่อาจซ้ำกัน</strong><span>อีเมลหรือโทรศัพท์ที่ซ้ำกับรายการอื่นจะแสดงที่นี่เพื่อตรวจสอบ</span></div> : null}
          </div>
        </section>
        <section className="tool-band muted-band">
          <div className="band-heading"><div><p>รายชื่อ</p><h2>ข้อมูลลูกค้า</h2></div><div className="band-heading-actions"><span>{contacts.length}</span><a className="secondary-link" href="/tenant/contacts?format=csv">ส่งออก CSV</a></div></div>
          <div className="data-table">
            {contacts.map((contact) => <div className="data-row contact-row" key={contact.id}>
              <div data-no-localize><strong>{contact.displayName}</strong><span>{contact.identities.map((identity) => identity.value).join(" / ") || "ไม่มีข้อมูลติดต่อที่ใช้งานอยู่"}</span>
                {contact.tags.length ? <span>{contact.tags.map((tag) => tag.label).join(" · ")}</span> : null}
                {contact.attributes.length ? <span>{contact.attributes.map((attribute) => `${attribute.label}: ${attribute.value}`).join(" · ")}</span> : null}
              </div>
              <span>{contact.consentStatus.replaceAll("_", " ")} consent</span>
              <span>{contact.leadCount} lead{contact.leadCount === 1 ? "" : "s"}<button type="button" className="table-action" onClick={() => void loadJourney(contact.id)}>ดูเส้นทางลูกค้า</button>{canWrite ? <button type="button" className="table-action" onClick={() => editMetadata(contact)}>แก้ไขโปรไฟล์</button> : null}</span>
            </div>)}
            {!contacts.length ? <div className="pending-line"><strong>ยังไม่มีข้อมูลติดต่อ</strong><span>ข้อมูลลูกค้าจะแสดงที่นี่</span></div> : null}
          </div>
        </section>
        {editingContactId ? <section className="tool-band">
          <div className="band-heading"><div><p>โปรไฟล์ลูกค้า</p><h2>แท็กและแอตทริบิวต์</h2></div><button type="button" onClick={() => setEditingContactId(null)}>ปิด</button></div>
          <form className="record-form" onSubmit={saveMetadata}>
            <label>แท็ก<input value={tagDraft} maxLength={800} placeholder="ผู้สนใจที่ผ่านการคัดกรอง, VIP, ติดตาม" onChange={(event) => setTagDraft(event.target.value)} /></label>
            {attributeDrafts.map((attribute, index) => <fieldset key={`${attribute.key}-${index}`} className="record-form">
              <label>กุญแจ<input value={attribute.key} pattern="[a-z][a-z0-9_]{0,63}" maxLength={64} required onChange={(event) => setAttributeDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, key: event.target.value } : item))} /></label>
              <label>ป้ายกำกับ<input value={attribute.label} maxLength={80} required onChange={(event) => setAttributeDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} /></label>
              <label>ประเภท<select value={attribute.valueType} onChange={(event) => setAttributeDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, valueType: event.target.value as ContactAttribute["valueType"], value: "" } : item))}><option value="text">ข้อความ</option><option value="number">หมายเลข</option><option value="boolean">ใช่ / ไม่</option><option value="date">วันที่</option></select></label>
              <label>Value{attribute.valueType === "boolean" ? <select value={attribute.value} required onChange={(event) => setAttributeDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item))}><option value="">เลือก</option><option value="true">ใช่</option><option value="false">ไม่</option></select> : <input type={attribute.valueType === "date" ? "date" : attribute.valueType === "number" ? "number" : "text"} value={attribute.value} maxLength={2000} required onChange={(event) => setAttributeDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item))} />}</label>
              <button type="button" onClick={() => setAttributeDrafts((current) => current.filter((_, itemIndex) => itemIndex !== index))}>นำแอตทริบิวต์ออก</button>
            </fieldset>)}
            <button type="button" onClick={() => setAttributeDrafts((current) => [...current, { key: "", label: "", valueType: "text", value: "" }])}>เพิ่มแอตทริบิวต์</button>
            <button type="submit" disabled={working}>{working ? "Saving..." : "Save profile"}</button>
          </form>
          {message ? <p className={`inline-message ${messageTone}`} role={messageTone === "error" ? "alert" : "status"}>{message}</p> : null}
        </section> : null}
        {journeyContactId ? <section className="tool-band customer-journey" aria-busy={journeyLoading}>
          <div className="band-heading"><div><p>ภาพรวมข้ามทุกบอท</p><h2>{journey?.contact.displayName ?? "เส้นทางลูกค้า"}</h2></div><button type="button" onClick={() => { setJourneyContactId(null); setJourney(null); }}>ปิด</button></div>
          {journeyLoading ? <div className="pending-line"><strong>กำลังรวบรวมเส้นทางลูกค้า...</strong><span>การสนทนา ผู้สนใจ นัดหมาย การติดต่อกลับ และผลลัพธ์</span></div> : null}
          {journeyError ? <div className="inline-message error" role="alert">ไม่สามารถโหลดเส้นทางลูกค้าได้ <button type="button" onClick={() => void loadJourney(journeyContactId)}>ลองอีกครั้ง</button></div> : null}
          {journey ? <>
            <div className="journey-summary" aria-label="สรุปลูกค้า">
              <div><span>การสนทนา</span><strong>{journey.contact.conversationCount}</strong></div>
              <div><span>ผู้สนใจที่ต้องติดตาม</span><strong>{journey.contact.openLeadCount}</strong></div>
              <div><span>นัดหมาย</span><strong>{journey.contact.appointmentCount}</strong></div>
              <div><span>ติดต่อกลับค้างอยู่</span><strong>{journey.contact.openCallbackCount}</strong></div>
              <div><span>มูลค่าที่ยืนยันแล้ว</span><strong>{journey.values.length ? journey.values.map((value) => new Intl.NumberFormat(currentIntlLocale(), { style: "currency", currency: value.currency }).format(Number(value.amountMinor) / 100)).join(" · ") : "—"}</strong></div>
            </div>
            {canRecordValue && journey.leads.some((lead) => lead.status === "closed_deal") ? <form className="record-form journey-value-form" onSubmit={recordValue}>
              <div className="band-heading"><div><p>หลักฐานจากร้านค้า</p><h3>บันทึกมูลค่าดีลที่ปิดแล้ว</h3></div></div>
              <label>ผู้สนใจ<select name="leadId" required>{journey.leads.filter((lead) => lead.status === "closed_deal").map((lead) => <option key={lead.id} value={lead.id}>{lead.title}</option>)}</select></label>
              <label>การสนทนาต้นทาง<select name="conversationId"><option value="">ไม่ได้ระบุ</option>{journey.conversations.map((conversation) => <option key={conversation.id} value={conversation.id}>{conversation.productKey.replaceAll("_", " ")} · {conversation.channelKind.replaceAll("_", " ")}</option>)}</select></label>
              <label>สกุลเงิน<select name="currency" defaultValue="THB"><option value="THB">THB</option><option value="USD">USD</option></select></label>
              <label>มูลค่า<input name="amount" type="number" min="0.01" step="0.01" inputMode="decimal" required /></label>
              <button type="submit" disabled={working}>{working ? "กำลังบันทึก..." : "บันทึกมูลค่าที่ยืนยันแล้ว"}</button>
            </form> : null}
            {message ? <p className={`inline-message ${messageTone}`} role={messageTone === "error" ? "alert" : "status"}>{message}</p> : null}
            <ol className="customer-journey-timeline" aria-label="กิจกรรมลูกค้า">
              {journey.events.map((item) => <li key={item.id}><span className="journey-dot" aria-hidden="true" /><div><header><strong>{item.title}</strong><time dateTime={item.occurredAt}>{new Date(item.occurredAt).toLocaleString(currentIntlLocale())}</time></header>{item.detail ? <p data-no-localize>{item.detail}</p> : null}<small>{[item.productKey, item.channelKind].filter(Boolean).map((value) => value!.replaceAll("_", " ")).join(" · ")}{item.amountMinor && item.currency ? ` · ${new Intl.NumberFormat(currentIntlLocale(), { style: "currency", currency: item.currency }).format(Number(item.amountMinor) / 100)}` : ""}</small></div></li>)}
              {!journey.events.length ? <li><div><strong>ยังไม่มีกิจกรรม</strong><p>กิจกรรมจากบอทและทีมจะปรากฏตามลำดับเวลา</p></div></li> : null}
            </ol>
            {journey.truncated ? <p className="field-help">แสดง 300 กิจกรรมล่าสุด ใช้การส่งออกข้อมูลสำหรับประวัติทั้งหมด</p> : null}
          </> : null}
        </section> : null}
      </section>
    </main>
  );
}
