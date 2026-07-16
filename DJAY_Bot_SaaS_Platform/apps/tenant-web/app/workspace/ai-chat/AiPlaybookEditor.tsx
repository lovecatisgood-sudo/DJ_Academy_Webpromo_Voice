"use client";

import { aiPlaybookFieldLimits, type AiPlaybook } from "@djay/sales-core";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const CONTACT_FIELDS = ["name", "email", "phone"] as const;

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
  const disabled = props.readOnly || props.advancedPending;
  const update = <Key extends keyof AiPlaybook>(key: Key, value: AiPlaybook[Key]) => {
    props.onDefinitionChange({ ...props.definition, [key]: value });
  };
  const updateWindow = (index: number, next: AiPlaybook["weeklyWindows"][number]) => {
    update("weeklyWindows", props.definition.weeklyWindows.map((item, itemIndex) => itemIndex === index ? next : item));
  };

  return <div className="ai-playbook-editor">
    {props.advancedPending ? <div className="flow-editor-invalid" role="alert">
      Finish or repair the Advanced JSON before using the guided fields. Your JSON text is preserved.
    </div> : null}
    <fieldset disabled={disabled} className="ai-playbook-fieldset">
      <legend>Assistant identity and goals</legend>
      <div className="ai-playbook-grid two-columns">
        <label>Assistant name<input id="ai-playbook-agentName" data-ai-playbook-path="agentName" value={props.definition.agentName} minLength={aiPlaybookFieldLimits.agentName.minLength} maxLength={aiPlaybookFieldLimits.agentName.maxLength} required aria-invalid={issueFor(props.validationPath, "agentName") || undefined} onChange={(event) => update("agentName", event.target.value)} /></label>
        <label>Business name<input id="ai-playbook-businessName" data-ai-playbook-path="businessName" value={props.definition.businessName} minLength={aiPlaybookFieldLimits.businessName.minLength} maxLength={aiPlaybookFieldLimits.businessName.maxLength} required aria-invalid={issueFor(props.validationPath, "businessName") || undefined} onChange={(event) => update("businessName", event.target.value)} /></label>
        <label>Tone<input id="ai-playbook-tone" data-ai-playbook-path="tone" value={props.definition.tone} minLength={aiPlaybookFieldLimits.tone.minLength} maxLength={aiPlaybookFieldLimits.tone.maxLength} required aria-invalid={issueFor(props.validationPath, "tone") || undefined} onChange={(event) => update("tone", event.target.value)} /></label>
        <label>Sales goal<textarea id="ai-playbook-salesGoal" data-ai-playbook-path="salesGoal" value={props.definition.salesGoal} rows={3} minLength={aiPlaybookFieldLimits.salesGoal.minLength} maxLength={aiPlaybookFieldLimits.salesGoal.maxLength} required aria-invalid={issueFor(props.validationPath, "salesGoal") || undefined} onChange={(event) => update("salesGoal", event.target.value)} /></label>
      </div>
      <div className="ai-playbook-choice-grid">
        <div><span className="field-label">Conversation languages</span><div className="ai-playbook-checks" data-ai-playbook-path="languages" aria-invalid={issueFor(props.validationPath, "languages") || undefined}>
          {(["en", "th"] as const).map((language) => <label key={language}><input type="checkbox" checked={props.definition.languages.includes(language)} onChange={(event) => update("languages", event.target.checked ? [...props.definition.languages, language] : props.definition.languages.filter((item) => item !== language))} />{language === "en" ? "English" : "Thai"}</label>)}
        </div></div>
        <div><span className="field-label">Required contact details</span><div className="ai-playbook-checks" data-ai-playbook-path="requiredContactFields" aria-invalid={issueFor(props.validationPath, "requiredContactFields") || undefined}>
          {CONTACT_FIELDS.map((field) => <label key={field}><input type="checkbox" checked={props.definition.requiredContactFields.includes(field)} onChange={(event) => update("requiredContactFields", event.target.checked ? [...props.definition.requiredContactFields, field] : props.definition.requiredContactFields.filter((item) => item !== field))} />{field}</label>)}
        </div><small>Select at least two.</small></div>
      </div>
    </fieldset>

    <fieldset disabled={disabled} className="ai-playbook-fieldset">
      <legend>Approved conversation guidance</legend>
      <p className="field-help">Enter one item per line. The assistant can use approved claims and must avoid prohibited claims.</p>
      <div className="ai-playbook-grid two-columns">
        <label>Approved claims<textarea id="ai-playbook-approvedClaims" data-ai-playbook-path="approvedClaims" value={props.definition.approvedClaims.join("\n")} rows={5} aria-invalid={issueFor(props.validationPath, "approvedClaims") || undefined} onChange={(event) => update("approvedClaims", lineValues(event.target.value))} /></label>
        <label>Prohibited claims<textarea id="ai-playbook-prohibitedClaims" data-ai-playbook-path="prohibitedClaims" value={props.definition.prohibitedClaims.join("\n")} rows={5} aria-invalid={issueFor(props.validationPath, "prohibitedClaims") || undefined} onChange={(event) => update("prohibitedClaims", lineValues(event.target.value))} /></label>
        <label>Discovery questions<textarea id="ai-playbook-discoveryQuestions" data-ai-playbook-path="discoveryQuestions" value={props.definition.discoveryQuestions.join("\n")} rows={5} required aria-invalid={issueFor(props.validationPath, "discoveryQuestions") || undefined} onChange={(event) => update("discoveryQuestions", lineValues(event.target.value))} /></label>
        <label>Calls to action<textarea id="ai-playbook-ctaPolicy" data-ai-playbook-path="ctaPolicy" value={props.definition.ctaPolicy.join("\n")} rows={5} required aria-invalid={issueFor(props.validationPath, "ctaPolicy") || undefined} onChange={(event) => update("ctaPolicy", lineValues(event.target.value))} /></label>
      </div>
    </fieldset>

    <fieldset disabled={disabled} className="ai-playbook-fieldset">
      <legend>Customer messages</legend>
      <div className="ai-playbook-grid two-columns">
        <label>English greeting<textarea id="ai-playbook-greeting-en" data-ai-playbook-path="greeting.en" value={props.definition.greeting.en} rows={3} maxLength={aiPlaybookFieldLimits.localizedMessage.maxLength} required aria-invalid={issueFor(props.validationPath, "greeting.en") || undefined} onChange={(event) => update("greeting", { ...props.definition.greeting, en: event.target.value })} /></label>
        <label>Thai greeting<textarea id="ai-playbook-greeting-th" data-ai-playbook-path="greeting.th" value={props.definition.greeting.th} rows={3} maxLength={aiPlaybookFieldLimits.localizedMessage.maxLength} required aria-invalid={issueFor(props.validationPath, "greeting.th") || undefined} onChange={(event) => update("greeting", { ...props.definition.greeting, th: event.target.value })} /></label>
        <label>English offline message<textarea id="ai-playbook-offlineMessage-en" data-ai-playbook-path="offlineMessage.en" value={props.definition.offlineMessage.en} rows={3} maxLength={aiPlaybookFieldLimits.localizedMessage.maxLength} required aria-invalid={issueFor(props.validationPath, "offlineMessage.en") || undefined} onChange={(event) => update("offlineMessage", { ...props.definition.offlineMessage, en: event.target.value })} /></label>
        <label>Thai offline message<textarea id="ai-playbook-offlineMessage-th" data-ai-playbook-path="offlineMessage.th" value={props.definition.offlineMessage.th} rows={3} maxLength={aiPlaybookFieldLimits.localizedMessage.maxLength} required aria-invalid={issueFor(props.validationPath, "offlineMessage.th") || undefined} onChange={(event) => update("offlineMessage", { ...props.definition.offlineMessage, th: event.target.value })} /></label>
      </div>
    </fieldset>

    <fieldset disabled={disabled} className="ai-playbook-fieldset">
      <legend>Business hours</legend>
      <label className="ai-playbook-timezone">IANA timezone<input id="ai-playbook-timezone" data-ai-playbook-path="timezone" value={props.definition.timezone} minLength={aiPlaybookFieldLimits.timezone.minLength} maxLength={aiPlaybookFieldLimits.timezone.maxLength} required aria-invalid={issueFor(props.validationPath, "timezone") || undefined} onChange={(event) => update("timezone", event.target.value)} /><small>For example: Asia/Bangkok</small></label>
      <div className="ai-playbook-windows" data-ai-playbook-path="weeklyWindows">
        {props.definition.weeklyWindows.map((window, index) => <div className="ai-playbook-window" key={index}>
          <label>Day<select aria-label={`Availability ${index + 1} day`} value={window.dayOfWeek} onChange={(event) => updateWindow(index, { ...window, dayOfWeek: Number(event.target.value) })}>{DAYS.map((day, dayIndex) => <option key={day} value={dayIndex}>{day}</option>)}</select></label>
          <label>Opens<input type="time" aria-label={`Availability ${index + 1} start`} value={minuteValue(window.startMinute)} onChange={(event) => updateWindow(index, { ...window, startMinute: minuteFromInput(event.target.value) })} /></label>
          <label>Closes<input type="time" aria-label={`Availability ${index + 1} end`} value={minuteValue(window.endMinute)} onChange={(event) => updateWindow(index, { ...window, endMinute: minuteFromInput(event.target.value) })} /></label>
          <button type="button" className="secondary-command danger-command" aria-label={`Remove availability ${index + 1}`} onClick={() => update("weeklyWindows", props.definition.weeklyWindows.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
        </div>)}
        {!props.definition.weeklyWindows.length ? <p className="field-help">No business-hour windows. The offline message will be used.</p> : null}
      </div>
      {!props.readOnly ? <button type="button" className="secondary-command ai-playbook-add-window" disabled={props.advancedPending || props.definition.weeklyWindows.length >= aiPlaybookFieldLimits.weeklyWindows.maxItems} onClick={() => update("weeklyWindows", [...props.definition.weeklyWindows, { dayOfWeek: 1, startMinute: 540, endMinute: 1020 }])}>Add availability</button> : null}
    </fieldset>

    {props.validationMessage ? <p className="dashboard-inline-message" id="ai-playbook-draft-error" role="alert">{props.validationMessage}</p> : null}
    <details className="advanced-definition" data-ai-playbook-advanced open={props.advancedPending || props.validationPath === "advanced" || undefined}>
      <summary>Advanced JSON</summary>
      <p className="field-help">For expert use. Leaving this field validates the complete Sales Core playbook before guided editing resumes.</p>
      <textarea aria-label="Advanced AI sales playbook JSON" value={props.definitionText} onChange={(event) => props.onAdvancedChange(event.target.value)} onBlur={props.onAdvancedBlur} spellCheck={false} readOnly={props.readOnly} aria-invalid={props.advancedPending || props.validationPath === "advanced" || undefined} aria-describedby={props.validationMessage ? "ai-playbook-draft-error" : undefined} data-ai-playbook-json />
    </details>
  </div>;
}
