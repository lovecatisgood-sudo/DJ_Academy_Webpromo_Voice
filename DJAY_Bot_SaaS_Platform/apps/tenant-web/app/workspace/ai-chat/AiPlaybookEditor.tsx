"use client";

import { aiPlaybookFieldLimits, type AiPlaybook } from "@djay/sales-core";
import { useState, type ChangeEvent } from "react";
import { parseAiFaqCsv } from "../../../lib/ai-faq-csv";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const CONTACT_FIELDS = ["name", "email", "phone"] as const;
const ACTION_TYPES = ["booking", "quotation", "checkout", "call", "line", "website"] as const;
const CUSTOMER_MESSAGE_FIELDS = [
  ["fallback", "Knowledge or provider fallback", "คำตอบสำรองเมื่อข้อมูลหรือผู้ให้บริการไม่พร้อม"],
  ["handover", "Human handover message", "ข้อความส่งต่อให้เจ้าหน้าที่"],
  ["contactPrompt", "Contact details prompt", "ข้อความขอข้อมูลติดต่อ"],
  ["bookingPrompt", "Appointment request prompt", "ข้อความขอรายละเอียดนัดหมาย"],
  ["rolePrompt", "Role opening question", "คำถามเปิดตามบทบาท"],
] as const;

type Props = Readonly<{
  definition: AiPlaybook;
  definitionText: string;
  readOnly: boolean;
  advancedPending: boolean;
  validationPath: string;
  validationMessage: string;
  onDefinitionChange: (value: AiPlaybook) => void;
  onAdvancedChange: (value: string) => void;
  onAdvancedBlur: () => void;
}>;

function lineValues(value: string): string[] {
  return value === "" ? [] : value.split("\n");
}

function minuteValue(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function minuteFromInput(value: string): number {
  const [hour = "0", minute = "0"] = value.split(":");
  return Number(hour) * 60 + Number(minute);
}

function issueFor(validationPath: string, path: string): boolean {
  return validationPath === path || validationPath.startsWith(`${path}.`) || validationPath.startsWith(`${path}[`);
}

export function AiPlaybookEditor(props: Props) {
  const [faqImportMessage, setFaqImportMessage] = useState("");
  const disabled = props.readOnly || props.advancedPending;
  const update = <Key extends keyof AiPlaybook>(key: Key, value: AiPlaybook[Key]) => {
    props.onDefinitionChange({ ...props.definition, [key]: value });
  };
  const updateWindow = (index: number, next: AiPlaybook["weeklyWindows"][number]) => {
    update("weeklyWindows", props.definition.weeklyWindows.map((item, itemIndex) => itemIndex === index ? next : item));
  };
  const updateAction = (index: number, next: AiPlaybook["publicActions"][number]) => {
    update("publicActions", props.definition.publicActions.map((item, itemIndex) => itemIndex === index ? next : item));
  };
  const updateFaq = (index: number, next: AiPlaybook["approvedFaqs"][number]) => {
    update("approvedFaqs", props.definition.approvedFaqs.map((item, itemIndex) => itemIndex === index ? next : item));
  };
  const updateBuilderContext = (next: NonNullable<AiPlaybook["builderContext"]>) => update("builderContext", next);
  const importFaqs = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    try {
      const imported = parseAiFaqCsv(await file.text());
      const combined = [...props.definition.approvedFaqs, ...imported];
      if (combined.length > aiPlaybookFieldLimits.faqQuestion.maxItems) throw new Error("faq_total_limit");
      const identities = combined.map((faq) => `${faq.question.th.toLocaleLowerCase()}\u0000${faq.question.en.toLocaleLowerCase()}`);
      if (new Set(identities).size !== identities.length) throw new Error("faq_duplicate_existing");
      update("approvedFaqs", combined); setFaqImportMessage(`${imported.length} FAQ rows added to this draft. Save the draft to persist them.`);
    } catch { setFaqImportMessage("FAQ import was rejected. Use the four required bilingual columns, complete every row, and remove duplicates."); }
  };

  return <div className="ai-playbook-editor">
    {props.advancedPending ? <div className="flow-editor-invalid" role="alert">
      Finish or repair the Advanced JSON before using the guided fields. Your JSON text is preserved.
    </div> : null}
    <fieldset disabled={disabled} className="ai-playbook-fieldset">
      <legend>Assistant identity and goals · ตัวตนและเป้าหมายของผู้ช่วย</legend>
      <div className="ai-playbook-grid two-columns">
        <label>ชื่อผู้ช่วย<input id="ai-playbook-agentName" data-ai-playbook-path="agentName" value={props.definition.agentName} minLength={aiPlaybookFieldLimits.agentName.minLength} maxLength={aiPlaybookFieldLimits.agentName.maxLength} required aria-invalid={issueFor(props.validationPath, "agentName") || undefined} onChange={(event) => update("agentName", event.target.value)} /></label>
        <label>ชื่อธุรกิจ<input id="ai-playbook-businessName" data-ai-playbook-path="businessName" value={props.definition.businessName} minLength={aiPlaybookFieldLimits.businessName.minLength} maxLength={aiPlaybookFieldLimits.businessName.maxLength} required aria-invalid={issueFor(props.validationPath, "businessName") || undefined} onChange={(event) => update("businessName", event.target.value)} /></label>
        <label>โทนการสนทนา<input id="ai-playbook-tone" data-ai-playbook-path="tone" value={props.definition.tone} minLength={aiPlaybookFieldLimits.tone.minLength} maxLength={aiPlaybookFieldLimits.tone.maxLength} required aria-invalid={issueFor(props.validationPath, "tone") || undefined} onChange={(event) => update("tone", event.target.value)} /></label>
        <label>เป้าหมายของผู้ช่วย<textarea id="ai-playbook-salesGoal" data-ai-playbook-path="salesGoal" value={props.definition.salesGoal} rows={3} minLength={aiPlaybookFieldLimits.salesGoal.minLength} maxLength={aiPlaybookFieldLimits.salesGoal.maxLength} required aria-invalid={issueFor(props.validationPath, "salesGoal") || undefined} onChange={(event) => update("salesGoal", event.target.value)} /></label>
        <label>พฤติกรรมการสนทนา<textarea id="ai-playbook-behaviorInstructions" data-ai-playbook-path="behaviorInstructions" value={props.definition.behaviorInstructions} rows={4} maxLength={aiPlaybookFieldLimits.behavior.maxLength} aria-invalid={issueFor(props.validationPath, "behaviorInstructions") || undefined} onChange={(event) => update("behaviorInstructions", event.target.value)} /></label>
        <label>ขอบเขตและกฎการส่งต่อ<textarea id="ai-playbook-behaviorBoundaries" data-ai-playbook-path="behaviorBoundaries" value={props.definition.behaviorBoundaries} rows={4} maxLength={aiPlaybookFieldLimits.behavior.maxLength} aria-invalid={issueFor(props.validationPath, "behaviorBoundaries") || undefined} onChange={(event) => update("behaviorBoundaries", event.target.value)} /></label>
      </div>
      <div className="ai-playbook-choice-grid">
        <div><span className="field-label">ภาษาที่ใช้สนทนา</span><div className="ai-playbook-checks" data-ai-playbook-path="languages" aria-invalid={issueFor(props.validationPath, "languages") || undefined}>
          {(["en", "th"] as const).map((language) => <label key={language}><input type="checkbox" checked={props.definition.languages.includes(language)} onChange={(event) => update("languages", event.target.checked ? [...props.definition.languages, language] : props.definition.languages.filter((item) => item !== language))} />{language === "en" ? "English" : "Thai"}</label>)}
        </div></div>
        <div><span className="field-label">ข้อมูลติดต่อที่จำเป็น</span><div className="ai-playbook-checks" data-ai-playbook-path="requiredContactFields" aria-invalid={issueFor(props.validationPath, "requiredContactFields") || undefined}>
          {CONTACT_FIELDS.map((field) => <label key={field}><input type="checkbox" checked={props.definition.requiredContactFields.includes(field)} onChange={(event) => update("requiredContactFields", event.target.checked ? [...props.definition.requiredContactFields, field] : props.definition.requiredContactFields.filter((item) => item !== field))} />{field}</label>)}
        </div><small>เลือกอย่างน้อยสองรายการ</small></div>
      </div>
    </fieldset>

    {props.definition.builderContext ? <fieldset disabled={disabled} className="ai-playbook-fieldset">
      <legend>Business profile from Builder · ข้อมูลธุรกิจจาก Builder</legend>
      <p className="field-help">ข้อมูลที่สร้างและตรวจทานใน Builder ยังคงแก้ไขได้หลังผูกกับบัญชี</p>
      <div className="ai-playbook-grid two-columns">
        <label>ประเภทธุรกิจ<input data-ai-playbook-path="builderContext.businessType" value={props.definition.builderContext.businessType} maxLength={300} onChange={(event) => updateBuilderContext({ ...props.definition.builderContext!, businessType: event.target.value })} /></label>
        <label>ช่องทางติดต่อหลัก<input data-ai-playbook-path="builderContext.contact" value={props.definition.builderContext.contact} maxLength={1000} onChange={(event) => updateBuilderContext({ ...props.definition.builderContext!, contact: event.target.value })} /></label>
        <label className="wide">สรุปธุรกิจ<textarea data-ai-playbook-path="builderContext.businessSummary" value={props.definition.builderContext.businessSummary} rows={4} maxLength={5000} onChange={(event) => updateBuilderContext({ ...props.definition.builderContext!, businessSummary: event.target.value })} /></label>
        <label className="wide">สินค้าและบริการ<textarea data-ai-playbook-path="builderContext.offers" value={props.definition.builderContext.offers} rows={4} maxLength={5000} onChange={(event) => updateBuilderContext({ ...props.definition.builderContext!, offers: event.target.value })} /></label>
        <label className="wide">เวลาทำการจากธุรกิจ<textarea data-ai-playbook-path="builderContext.businessHours" value={props.definition.builderContext.businessHours} rows={3} maxLength={1000} onChange={(event) => updateBuilderContext({ ...props.definition.builderContext!, businessHours: event.target.value })} /></label>
      </div>
    </fieldset> : null}

    <fieldset disabled={disabled} className="ai-playbook-fieldset">
      <legend>การส่งต่อและการดำเนินการสำหรับลูกค้า</legend>
      <div className="ai-playbook-grid two-columns">
        <label>Confidence escalation threshold
          <input type="number" min="0.1" max="1" step="0.05" data-ai-playbook-path="confidenceThreshold" value={props.definition.confidenceThreshold} aria-invalid={issueFor(props.validationPath, "confidenceThreshold") || undefined} onChange={(event) => update("confidenceThreshold", Number(event.target.value))} />
          <small>คำถามที่ระบบตอบได้ด้วยความมั่นใจต่ำจะส่งต่อให้ทีมงาน</small>
        </label>
        <label>Routing team key
          <input data-ai-playbook-path="routingTeamKey" value={props.definition.routingTeamKey ?? ""} placeholder="ทีมขาย" pattern="[a-z][a-z0-9_-]{1,63}" aria-invalid={issueFor(props.validationPath, "routingTeamKey") || undefined} onChange={(event) => {
            const value = event.target.value.trim();
            const next = { ...props.definition };
            if (value) next.routingTeamKey = value;
            else delete next.routingTeamKey;
            props.onDefinitionChange(next);
          }} />
          <small>ใช้เมื่อการสนทนาต้องการความช่วยเหลือจากทีมงาน</small>
        </label>
      </div>
      <div className="ai-playbook-windows" data-ai-playbook-path="publicActions">
        {props.definition.publicActions.map((action, index) => <div className="ai-playbook-window ai-playbook-action" key={`${action.type}-${index}`}>
          <label>การดำเนินการ<select value={action.type} onChange={(event) => updateAction(index, { ...action, type: event.target.value as typeof action.type })}>{ACTION_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
          <label>ป้ายกำกับภาษาอังกฤษ<input value={action.label.en} maxLength={80} onChange={(event) => updateAction(index, { ...action, label: { ...action.label, en: event.target.value } })} /></label>
          <label>ป้ายกำกับภาษาไทย<input value={action.label.th} maxLength={80} onChange={(event) => updateAction(index, { ...action, label: { ...action.label, th: event.target.value } })} /></label>
          <label>ปลายทาง<input type={action.type === "call" ? "tel" : "url"} value={action.url} placeholder={action.type === "call" ? "tel:+66..." : "https://..."} onChange={(event) => updateAction(index, { ...action, url: event.target.value })} /></label>
          <button type="button" className="secondary-command danger-command" aria-label={`Remove customer action ${index + 1}`} onClick={() => update("publicActions", props.definition.publicActions.filter((_, itemIndex) => itemIndex !== index))}>นำออก</button>
        </div>)}
      </div>
      {!props.readOnly ? <button type="button" className="secondary-command ai-playbook-add-window" disabled={props.advancedPending || props.definition.publicActions.length >= 12} onClick={() => update("publicActions", [...props.definition.publicActions, { type: "website", label: { en: "Learn more", th: "ดูเพิ่มเติม" }, url: "https://" }])}>เพิ่มการดำเนินการสำหรับลูกค้า</button> : null}
    </fieldset>

    <fieldset disabled={disabled} className="ai-playbook-fieldset">
      <legend>Approved conversation guidance · แนวทางการสนทนาที่อนุมัติ</legend>
      <p className="field-help">กรอกหนึ่งรายการต่อบรรทัด ผู้ช่วยใช้ได้เฉพาะข้อความที่อนุมัติและต้องหลีกเลี่ยงข้อความต้องห้าม</p>
      <div className="ai-playbook-grid two-columns">
        <label>ข้อความอ้างอิงที่อนุมัติ<textarea id="ai-playbook-approvedClaims" data-ai-playbook-path="approvedClaims" value={props.definition.approvedClaims.join("\n")} rows={5} aria-invalid={issueFor(props.validationPath, "approvedClaims") || undefined} onChange={(event) => update("approvedClaims", lineValues(event.target.value))} /></label>
        <label>ข้อความต้องห้าม<textarea id="ai-playbook-prohibitedClaims" data-ai-playbook-path="prohibitedClaims" value={props.definition.prohibitedClaims.join("\n")} rows={5} aria-invalid={issueFor(props.validationPath, "prohibitedClaims") || undefined} onChange={(event) => update("prohibitedClaims", lineValues(event.target.value))} /></label>
        <label>คำถามค้นหาความต้องการ<textarea id="ai-playbook-discoveryQuestions" data-ai-playbook-path="discoveryQuestions" value={props.definition.discoveryQuestions.join("\n")} rows={5} required aria-invalid={issueFor(props.validationPath, "discoveryQuestions") || undefined} onChange={(event) => update("discoveryQuestions", lineValues(event.target.value))} /></label>
        <label>คำกระตุ้นให้ดำเนินการ<textarea id="ai-playbook-ctaPolicy" data-ai-playbook-path="ctaPolicy" value={props.definition.ctaPolicy.join("\n")} rows={5} required aria-invalid={issueFor(props.validationPath, "ctaPolicy") || undefined} onChange={(event) => update("ctaPolicy", lineValues(event.target.value))} /></label>
      </div>
    </fieldset>

    <fieldset disabled={disabled} className="ai-playbook-fieldset">
      <legend>Approved FAQ · คำถามที่พบบ่อย</legend>
      <p className="field-help">คำถามและคำตอบสองภาษานี้เป็นหลักฐานธุรกิจที่ระบบใช้ตอบโดยตรง</p>
      <div className="ai-playbook-windows" data-ai-playbook-path="approvedFaqs">
        {props.definition.approvedFaqs.map((faq, index) => <div className="ai-playbook-window ai-playbook-faq" key={index}>
          <label>English question<input value={faq.question.en} maxLength={aiPlaybookFieldLimits.faqQuestion.maxLength} required onChange={(event) => updateFaq(index, { ...faq, question: { ...faq.question, en: event.target.value } })} /></label>
          <label>คำถามภาษาไทย<input value={faq.question.th} maxLength={aiPlaybookFieldLimits.faqQuestion.maxLength} required onChange={(event) => updateFaq(index, { ...faq, question: { ...faq.question, th: event.target.value } })} /></label>
          <label>English answer<textarea value={faq.answer.en} rows={4} maxLength={aiPlaybookFieldLimits.faqAnswer.maxLength} required onChange={(event) => updateFaq(index, { ...faq, answer: { ...faq.answer, en: event.target.value } })} /></label>
          <label>คำตอบภาษาไทย<textarea value={faq.answer.th} rows={4} maxLength={aiPlaybookFieldLimits.faqAnswer.maxLength} required onChange={(event) => updateFaq(index, { ...faq, answer: { ...faq.answer, th: event.target.value } })} /></label>
          <button type="button" className="secondary-command danger-command" aria-label={`Remove FAQ ${index + 1}`} onClick={() => update("approvedFaqs", props.definition.approvedFaqs.filter((_, itemIndex) => itemIndex !== index))}>นำออก</button>
        </div>)}
        {!props.definition.approvedFaqs.length ? <p className="field-help">ยังไม่มี FAQ ที่อนุมัติ</p> : null}
      </div>
      {!props.readOnly ? <div className="ai-playbook-add-window">
        <button type="button" className="secondary-command" disabled={props.advancedPending || props.definition.approvedFaqs.length >= aiPlaybookFieldLimits.faqQuestion.maxItems} onClick={() => update("approvedFaqs", [...props.definition.approvedFaqs, { question: { en: "New question", th: "คำถามใหม่" }, answer: { en: "Enter the approved answer", th: "กรอกคำตอบที่อนุมัติ" } }])}>เพิ่ม FAQ</button>
        <label className="secondary-command">Import bilingual CSV<input type="file" accept=".csv,text/csv" disabled={props.advancedPending} onChange={(event) => void importFaqs(event)} /></label>
        <small>Required headers: question_th, question_en, answer_th, answer_en. Import updates this draft only.</small>
      </div> : null}
      {faqImportMessage ? <p className="field-help" role="status">{faqImportMessage}</p> : null}
    </fieldset>

    <fieldset disabled={disabled} className="ai-playbook-fieldset">
      <legend>Customer messages · ข้อความจากลูกค้า</legend>
      <div className="ai-playbook-grid two-columns">
        <label>คำทักทายภาษาอังกฤษ<textarea id="ai-playbook-greeting-en" data-ai-playbook-path="greeting.en" value={props.definition.greeting.en} rows={3} maxLength={aiPlaybookFieldLimits.localizedMessage.maxLength} required aria-invalid={issueFor(props.validationPath, "greeting.en") || undefined} onChange={(event) => update("greeting", { ...props.definition.greeting, en: event.target.value })} /></label>
        <label>คำทักทายภาษาไทย<textarea id="ai-playbook-greeting-th" data-ai-playbook-path="greeting.th" value={props.definition.greeting.th} rows={3} maxLength={aiPlaybookFieldLimits.localizedMessage.maxLength} required aria-invalid={issueFor(props.validationPath, "greeting.th") || undefined} onChange={(event) => update("greeting", { ...props.definition.greeting, th: event.target.value })} /></label>
        <label>ข้อความนอกเวลาภาษาอังกฤษ<textarea id="ai-playbook-offlineMessage-en" data-ai-playbook-path="offlineMessage.en" value={props.definition.offlineMessage.en} rows={3} maxLength={aiPlaybookFieldLimits.localizedMessage.maxLength} required aria-invalid={issueFor(props.validationPath, "offlineMessage.en") || undefined} onChange={(event) => update("offlineMessage", { ...props.definition.offlineMessage, en: event.target.value })} /></label>
        <label>ข้อความนอกเวลาภาษาไทย<textarea id="ai-playbook-offlineMessage-th" data-ai-playbook-path="offlineMessage.th" value={props.definition.offlineMessage.th} rows={3} maxLength={aiPlaybookFieldLimits.localizedMessage.maxLength} required aria-invalid={issueFor(props.validationPath, "offlineMessage.th") || undefined} onChange={(event) => update("offlineMessage", { ...props.definition.offlineMessage, th: event.target.value })} /></label>
        {CUSTOMER_MESSAGE_FIELDS.map(([key, englishLabel, thaiLabel]) => <div className="ai-playbook-window" key={key} data-ai-playbook-path={`customerMessages.${key}`}>
          <label>{englishLabel} in English<textarea value={props.definition.customerMessages[key].en} rows={3} maxLength={aiPlaybookFieldLimits.localizedMessage.maxLength} required aria-invalid={issueFor(props.validationPath, `customerMessages.${key}.en`) || undefined} onChange={(event) => update("customerMessages", { ...props.definition.customerMessages, [key]: { ...props.definition.customerMessages[key], en: event.target.value } })} /></label>
          <label>{thaiLabel}<textarea value={props.definition.customerMessages[key].th} rows={3} maxLength={aiPlaybookFieldLimits.localizedMessage.maxLength} required aria-invalid={issueFor(props.validationPath, `customerMessages.${key}.th`) || undefined} onChange={(event) => update("customerMessages", { ...props.definition.customerMessages, [key]: { ...props.definition.customerMessages[key], th: event.target.value } })} /></label>
        </div>)}
        {props.definition.builderContext ? <>
          <label>AI disclosure in English<textarea data-ai-playbook-path="builderContext.disclosure.en" value={props.definition.builderContext.disclosure.en} rows={3} maxLength={500} onChange={(event) => updateBuilderContext({ ...props.definition.builderContext!, disclosure: { ...props.definition.builderContext!.disclosure, en: event.target.value } })} /></label>
          <label>คำแจ้ง AI ภาษาไทย<textarea data-ai-playbook-path="builderContext.disclosure.th" value={props.definition.builderContext.disclosure.th} rows={3} maxLength={500} onChange={(event) => updateBuilderContext({ ...props.definition.builderContext!, disclosure: { ...props.definition.builderContext!.disclosure, th: event.target.value } })} /></label>
          {props.definition.builderContext.voiceDisclosure ? <>
            <label>Voice disclosure in English<textarea data-ai-playbook-path="builderContext.voiceDisclosure.en" value={props.definition.builderContext.voiceDisclosure.en} rows={3} maxLength={500} onChange={(event) => updateBuilderContext({ ...props.definition.builderContext!, voiceDisclosure: { ...props.definition.builderContext!.voiceDisclosure!, en: event.target.value } })} /></label>
            <label>คำแจ้ง Voice ภาษาไทย<textarea data-ai-playbook-path="builderContext.voiceDisclosure.th" value={props.definition.builderContext.voiceDisclosure.th} rows={3} maxLength={500} onChange={(event) => updateBuilderContext({ ...props.definition.builderContext!, voiceDisclosure: { ...props.definition.builderContext!.voiceDisclosure!, th: event.target.value } })} /></label>
          </> : null}
        </> : null}
      </div>
    </fieldset>

    <fieldset disabled={disabled} className="ai-playbook-fieldset">
      <legend>Business hours · เวลาทำการ</legend>
      <label className="ai-playbook-timezone">เขตเวลามาตรฐาน IANA<input id="ai-playbook-timezone" data-ai-playbook-path="timezone" value={props.definition.timezone} minLength={aiPlaybookFieldLimits.timezone.minLength} maxLength={aiPlaybookFieldLimits.timezone.maxLength} required aria-invalid={issueFor(props.validationPath, "timezone") || undefined} onChange={(event) => update("timezone", event.target.value)} /><small>ตัวอย่าง: Asia/Bangkok</small></label>
      <div className="ai-playbook-windows" data-ai-playbook-path="weeklyWindows">
        {props.definition.weeklyWindows.map((window, index) => <div className="ai-playbook-window" key={index}>
          <label>วัน<select aria-label={`Availability ${index + 1} day`} value={window.dayOfWeek} onChange={(event) => updateWindow(index, { ...window, dayOfWeek: Number(event.target.value) })}>{DAYS.map((day, dayIndex) => <option key={day} value={dayIndex}>{day}</option>)}</select></label>
          <label>เปิดเวลา<input type="time" aria-label={`Availability ${index + 1} start`} value={minuteValue(window.startMinute)} onChange={(event) => updateWindow(index, { ...window, startMinute: minuteFromInput(event.target.value) })} /></label>
          <label>ปิดเวลา<input type="time" aria-label={`Availability ${index + 1} end`} value={minuteValue(window.endMinute)} onChange={(event) => updateWindow(index, { ...window, endMinute: minuteFromInput(event.target.value) })} /></label>
          <button type="button" className="secondary-command danger-command" aria-label={`Remove availability ${index + 1}`} onClick={() => update("weeklyWindows", props.definition.weeklyWindows.filter((_, itemIndex) => itemIndex !== index))}>นำออก</button>
        </div>)}
        {!props.definition.weeklyWindows.length ? <p className="field-help">ยังไม่ได้กำหนดเวลาทำการ ระบบจะใช้ข้อความนอกเวลาทำการ</p> : null}
      </div>
      {!props.readOnly ? <button type="button" className="secondary-command ai-playbook-add-window" disabled={props.advancedPending || props.definition.weeklyWindows.length >= aiPlaybookFieldLimits.weeklyWindows.maxItems} onClick={() => update("weeklyWindows", [...props.definition.weeklyWindows, { dayOfWeek: 1, startMinute: 540, endMinute: 1020 }])}>เพิ่มเวลาที่พร้อมให้บริการ</button> : null}
    </fieldset>

    {props.validationMessage ? <p className="dashboard-inline-message" id="ai-playbook-draft-error" role="alert">{props.validationMessage}</p> : null}
    <details className="advanced-definition" data-ai-playbook-advanced open={props.advancedPending || props.validationPath === "advanced" || undefined}>
      <summary>JSON ขั้นสูง</summary>
      <p className="field-help">สำหรับผู้เชี่ยวชาญ เมื่อออกจากช่องนี้ระบบจะตรวจคู่มือ Sales Core ทั้งหมดก่อนกลับไปแก้ไขแบบแนะนำ</p>
      <textarea aria-label="Advanced AI sales playbook JSON" value={props.definitionText} onChange={(event) => props.onAdvancedChange(event.target.value)} onBlur={props.onAdvancedBlur} spellCheck={false} readOnly={props.readOnly} aria-invalid={props.advancedPending || props.validationPath === "advanced" || undefined} aria-describedby={props.validationMessage ? "ai-playbook-draft-error" : undefined} data-ai-playbook-json />
    </details>
  </div>;
}
