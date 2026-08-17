"use client";

import type { FlowSnapshot } from "@djay/flowbot-domain";

type Authoring = NonNullable<FlowSnapshot["authoring"]>;
type LeadField = NonNullable<Authoring["lead"]>["fields"][number];

const templates = [
  ["faq", "คำถามที่พบบ่อย", "FAQ"],
  ["lead", "เก็บข้อมูลผู้สนใจ", "Lead capture"],
  ["appointment", "ขอนัดหมาย", "Appointment"],
  ["product", "แนะนำสินค้า", "Product"],
  ["support", "บริการลูกค้า", "Support"],
  ["blank", "เริ่มจากว่าง", "Blank"],
] as const;

function parseSnapshot(value: string) {
  try {
    const parsed = JSON.parse(value) as Partial<FlowSnapshot> | null;
    if (!parsed || parsed.schemaVersion !== 1 || typeof parsed.rootNodeId !== "string" || !parsed.nodes || typeof parsed.nodes !== "object") return null;
    return parsed as FlowSnapshot;
  } catch {
    return null;
  }
}

function nextFieldKey(fields: readonly LeadField[]) {
  let index = fields.length + 1;
  while (fields.some((field) => field.key === `field_${index}`)) index += 1;
  return `field_${index}`;
}

export function FlowAuthoringEditor(props: Readonly<{
  value: string;
  readOnly: boolean;
  onChange: (value: string) => void;
}>) {
  const snapshot = parseSnapshot(props.value);
  if (!snapshot) return <p className="inline-message error" role="alert">Repair the Flow definition in Advanced JSON before editing business and widget settings.</p>;
  const authoring = snapshot.authoring ?? {};
  const identity = authoring.identity ?? {};
  const greeting = identity.greeting ?? { th: "", en: "" };
  const lead = authoring.lead;
  const handover = authoring.handover;
  const widget = authoring.widget;

  function patch(next: (current: Authoring) => Authoring) {
    const current = parseSnapshot(props.value);
    if (!current) return;
    props.onChange(JSON.stringify({ ...current, authoring: next(current.authoring ?? {}) }, null, 2));
  }

  function patchIdentity(values: Partial<NonNullable<Authoring["identity"]>>) {
    patch((current) => ({ ...current, identity: { ...(current.identity ?? {}), ...values } }));
  }

  function patchLeadField(index: number, values: Partial<LeadField>) {
    patch((current) => {
      const currentLead = current.lead ?? { fields: [], consent: "" };
      return { ...current, lead: { ...currentLead, fields: currentLead.fields.map((field, fieldIndex) => fieldIndex === index ? { ...field, ...values } : field) } };
    });
  }

  return <div className="flow-authoring-editor">
    <fieldset className="ai-playbook-fieldset" disabled={props.readOnly}>
      <legend>รูปแบบและตัวตนของบอต</legend>
      <div className="ai-playbook-grid two-columns">
        <label>เส้นทางเริ่มต้น<select value={authoring.templateKey ?? "blank"} onChange={(event) => patch((current) => ({ ...current, templateKey: event.target.value as NonNullable<Authoring["templateKey"]> }))}>{templates.map(([value, th, en]) => <option key={value} value={value}>{th} / {en}</option>)}</select></label>
        <label>สีแบรนด์<input type="color" value={identity.brandColor ?? "#126149"} onChange={(event) => patchIdentity({ brandColor: event.target.value })} /></label>
        <label>คำทักทายภาษาไทย<textarea rows={3} maxLength={10_000} value={greeting.th} onChange={(event) => patchIdentity({ greeting: { ...greeting, th: event.target.value } })} /></label>
        <label>English greeting<textarea rows={3} maxLength={10_000} value={greeting.en} onChange={(event) => patchIdentity({ greeting: { ...greeting, en: event.target.value } })} /></label>
        <label>ตำแหน่งวิดเจ็ต<select value={identity.widgetPosition ?? "bottom_right"} onChange={(event) => patchIdentity({ widgetPosition: event.target.value as "bottom_left" | "bottom_right" })}><option value="bottom_right">ขวาล่าง / Bottom right</option><option value="bottom_left">ซ้ายล่าง / Bottom left</option></select></label>
        <label>เวลาทำการ<textarea rows={3} maxLength={1000} value={identity.businessHours ?? ""} onChange={(event) => patchIdentity({ businessHours: event.target.value })} /></label>
        <label>ช่องทางส่งต่อให้ทีม<textarea rows={3} maxLength={500} value={identity.handoverContact ?? ""} onChange={(event) => patchIdentity({ handoverContact: event.target.value })} /></label>
        <label>นโยบายความเป็นส่วนตัว<input type="url" inputMode="url" maxLength={2000} placeholder="https://example.com/privacy" value={identity.privacyUrl ?? ""} onChange={(event) => patchIdentity({ privacyUrl: event.target.value })} /></label>
      </div>
    </fieldset>

    <fieldset className="ai-playbook-fieldset" disabled={props.readOnly}>
      <legend>ข้อมูลผู้สนใจและความยินยอม</legend>
      {lead ? <>
        <label>ข้อความขอความยินยอม<textarea rows={3} maxLength={2000} value={lead.consent} onChange={(event) => patch((current) => ({ ...current, lead: { ...(current.lead ?? { fields: [], consent: "" }), consent: event.target.value } }))} /></label>
        <div className="flow-authoring-fields">{lead.fields.map((field, index) => <div className="flow-authoring-field" key={`${field.key}-${index}`}>
          <label>คีย์<input pattern="[a-z][a-z0-9_]{0,63}" maxLength={64} value={field.key} onChange={(event) => patchLeadField(index, { key: event.target.value })} /></label>
          <label>ป้ายภาษาไทย<input maxLength={10_000} value={field.label.th} onChange={(event) => patchLeadField(index, { label: { ...field.label, th: event.target.value } })} /></label>
          <label>English label<input maxLength={10_000} value={field.label.en} onChange={(event) => patchLeadField(index, { label: { ...field.label, en: event.target.value } })} /></label>
          <label>ชนิด<select value={field.type} onChange={(event) => patchLeadField(index, { type: event.target.value as LeadField["type"] })}><option value="text">Text</option><option value="email">Email</option><option value="phone">Phone</option><option value="textarea">Long text</option></select></label>
          <label className="flow-authoring-check"><input type="checkbox" checked={field.required} onChange={(event) => patchLeadField(index, { required: event.target.checked })} /> ต้องกรอก / Required</label>
          <button type="button" className="secondary-command danger-command" onClick={() => patch((current) => ({ ...current, lead: { ...(current.lead ?? { fields: [], consent: "" }), fields: (current.lead?.fields ?? []).filter((_, fieldIndex) => fieldIndex !== index) } }))}>ลบช่อง</button>
        </div>)}</div>
        <div className="setup-action-row"><button type="button" className="secondary-command" disabled={lead.fields.length >= 20} onClick={() => patch((current) => {
          const currentLead = current.lead ?? { fields: [], consent: "" };
          const key = nextFieldKey(currentLead.fields);
          return { ...current, lead: { ...currentLead, fields: [...currentLead.fields, { key, label: { th: "ช่องข้อมูลใหม่", en: "New field" }, type: "text", required: false }] } };
        })}>เพิ่มช่องข้อมูล</button><button type="button" className="secondary-command danger-command" onClick={() => patch((current) => { const { lead: _lead, ...rest } = current; return rest; })}>ปิดการตั้งค่าผู้สนใจ</button></div>
      </> : <button type="button" className="secondary-command" onClick={() => patch((current) => ({ ...current, lead: { fields: [], consent: "" } }))}>เปิดการตั้งค่าผู้สนใจ</button>}
    </fieldset>

    <fieldset className="ai-playbook-fieldset" disabled={props.readOnly}>
      <legend>การส่งต่อให้ทีม</legend>
      {handover ? <>
        <div className="ai-playbook-grid two-columns">
          <label>ชื่อทีม<input maxLength={160} value={handover.teamLabel} onChange={(event) => patch((current) => ({ ...current, handover: { ...(current.handover ?? { teamLabel: "", fallback: { th: "", en: "" }, outsideHoursMessage: "" }), teamLabel: event.target.value } }))} /></label>
          <label>ข้อความนอกเวลาทำการ<textarea rows={3} maxLength={2000} value={handover.outsideHoursMessage} onChange={(event) => patch((current) => ({ ...current, handover: { ...(current.handover ?? { teamLabel: "", fallback: { th: "", en: "" }, outsideHoursMessage: "" }), outsideHoursMessage: event.target.value } }))} /></label>
          <label>ข้อความสำรองภาษาไทย<textarea rows={3} maxLength={10_000} value={handover.fallback.th} onChange={(event) => patch((current) => ({ ...current, handover: { ...(current.handover ?? { teamLabel: "", fallback: { th: "", en: "" }, outsideHoursMessage: "" }), fallback: { ...(current.handover?.fallback ?? { th: "", en: "" }), th: event.target.value } } }))} /></label>
          <label>English fallback<textarea rows={3} maxLength={10_000} value={handover.fallback.en} onChange={(event) => patch((current) => ({ ...current, handover: { ...(current.handover ?? { teamLabel: "", fallback: { th: "", en: "" }, outsideHoursMessage: "" }), fallback: { ...(current.handover?.fallback ?? { th: "", en: "" }), en: event.target.value } } }))} /></label>
        </div>
        <button type="button" className="secondary-command danger-command" onClick={() => patch((current) => { const { handover: _handover, ...rest } = current; return rest; })}>ปิดการตั้งค่าส่งต่อ</button>
      </> : <button type="button" className="secondary-command" onClick={() => patch((current) => ({ ...current, handover: { teamLabel: "", fallback: { th: "", en: "" }, outsideHoursMessage: "" } }))}>เปิดการตั้งค่าส่งต่อ</button>}
    </fieldset>

    <fieldset className="ai-playbook-fieldset" disabled={props.readOnly}>
      <legend>พฤติกรรมวิดเจ็ต</legend>
      {widget ? <div className="ai-playbook-grid two-columns">
        <label>โดเมนเว็บไซต์<input maxLength={2000} inputMode="url" value={widget.domain} onChange={(event) => patch((current) => ({ ...current, widget: { ...(current.widget ?? { domain: "", openOnLoad: false }), domain: event.target.value } }))} /></label>
        <label className="flow-authoring-check"><input type="checkbox" checked={widget.openOnLoad} onChange={(event) => patch((current) => ({ ...current, widget: { ...(current.widget ?? { domain: "", openOnLoad: false }), openOnLoad: event.target.checked } }))} /> เปิดอัตโนมัติเมื่อโหลดหน้า / Open on load</label>
        <button type="button" className="secondary-command danger-command" onClick={() => patch((current) => { const { widget: _widget, ...rest } = current; return rest; })}>ล้างการตั้งค่าวิดเจ็ต</button>
      </div> : <button type="button" className="secondary-command" onClick={() => patch((current) => ({ ...current, widget: { domain: "", openOnLoad: false } }))}>เปิดการตั้งค่าวิดเจ็ต</button>}
    </fieldset>
  </div>;
}
