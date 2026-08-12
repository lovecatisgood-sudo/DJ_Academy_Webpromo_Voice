"use client";

import type { OnboardingLocale } from "@djay/channel-onboarding/messages";
import { safeMutationFetch } from "@djay/shared";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { flowCanvasCopy } from "../../../lib/i18n/flow-canvas";

type PreviewInput =
  | { type: "text"; payload: { text: string } }
  | { type: "option"; payload: { optionId: string } }
  | { type: "form"; payload: { nodeId: string; data: Record<string, string> } };
type PreviewMessage = { type: string; nodeId: string; content: Record<string, unknown> };
type Preview = {
  state: { status: string; currentNodeId: string | null };
  turns: Array<{ sequence: number; messages: PreviewMessage[]; trace: string[]; commands: Array<{ type: string }> }>;
};

function messageText(message: PreviewMessage) {
  return typeof message.content.text === "string" ? message.content.text
    : typeof message.content.title === "string" ? message.content.title
      : message.type;
}

export function FlowSimulator(props: Readonly<{
  botId: string;
  locale: OnboardingLocale;
  startNodeId: string | null;
  startNodeTitle: string | null;
  disabled?: boolean;
  onTrace: (nodeIds: readonly string[]) => void;
}>) {
  const copy = flowCanvasCopy(props.locale);
  const [inputs, setInputs] = useState<PreviewInput[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [businessOpen, setBusinessOpen] = useState(true);
  const [reply, setReply] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    setInputs([]); setPreview(null); setError(false); props.onTrace([]);
  }, [props.startNodeId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(nextInputs: PreviewInput[]) {
    setWorking(true); setError(false);
    const response = await safeMutationFetch(`/tenant/flowbot/bots/${props.botId}/preview`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: props.locale, inputs: nextInputs, businessOpen, ...(props.startNodeId ? { startNodeId: props.startNodeId } : {}) }),
    });
    setWorking(false);
    if (!response.ok) { setError(true); return; }
    const result = await response.json() as { preview?: Preview };
    if (!result.preview) { setError(true); return; }
    setInputs(nextInputs); setPreview(result.preview);
    props.onTrace(result.preview.turns.flatMap((turn) => turn.trace));
  }

  const messages = useMemo(() => preview?.turns.flatMap((turn) => turn.messages) ?? [], [preview]);
  const latest = messages.at(-1);
  const options = Array.isArray(latest?.content.options) ? latest.content.options.filter((item): item is { id: string; label: string } => {
    return Boolean(item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string" && typeof (item as { label?: unknown }).label === "string");
  }) : [];
  const fields = Array.isArray(latest?.content.fields) ? latest.content.fields.filter((item): item is { key: string; label: string; type: string; required: boolean } => {
    return Boolean(item && typeof item === "object" && typeof (item as { key?: unknown }).key === "string" && typeof (item as { label?: unknown }).label === "string");
  }) : [];
  const commandTypes = [...new Set(preview?.turns.flatMap((turn) => turn.commands.map((command) => command.type)) ?? [])];
  const showReply = Boolean(preview && !fields.length && latest?.type === "text" && latest.content.input === true);

  function sendText(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = reply.trim(); if (!text) return;
    setReply(""); void run([...inputs, { type: "text", payload: { text } }]);
  }

  function sendForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!latest) return;
    const data = new FormData(event.currentTarget);
    const values = Object.fromEntries(fields.map((field) => [field.key, String(data.get(field.key) ?? "")]));
    void run([...inputs, { type: "form", payload: { nodeId: latest.nodeId, data: values } }]);
  }

  return <section className="flow-simulator" aria-labelledby="flow-simulator-title">
    <div className="band-heading"><div><p>{props.startNodeId ? copy.simulatorFromSelected : copy.simulatorFromRoot}</p><h3 id="flow-simulator-title">{copy.simulatorTitle}</h3></div>
      <select aria-label={copy.simulatorOpen} value={businessOpen ? "open" : "closed"} onChange={(event) => setBusinessOpen(event.target.value === "open")}>
        <option value="open">{copy.simulatorOpen}</option><option value="closed">{copy.simulatorClosed}</option>
      </select></div>
    <p className="field-help">{copy.simulatorDetail}</p>
    <p className="field-help">{props.startNodeId ? `${copy.simulatorFromSelected}: ${props.startNodeTitle ?? props.startNodeId}` : copy.simulatorSelectHint}</p>
    <div className="flow-simulator-transcript" aria-live="polite">
      {!preview ? <p className="flow-simulator-empty">{copy.simulatorEmpty}</p> : messages.map((message, index) => <article className="message-bubble outbound" key={`${message.nodeId}-${index}`}><span>FlowBot</span><p>{messageText(message)}</p></article>)}
      {options.length ? <div className="flow-simulator-options">{options.map((option) => <button type="button" className="secondary-command" key={option.id} disabled={working} onClick={() => void run([...inputs, { type: "option", payload: { optionId: option.id } }])}>{option.label}</button>)}</div> : null}
      {fields.length ? <form className="flow-simulator-form" onSubmit={sendForm}>{fields.map((field) => <label key={field.key}>{field.label}<input name={field.key} type={field.type === "phone" ? "tel" : field.type} required={field.required} /></label>)}<button type="submit" disabled={working}>{copy.simulatorSubmitForm}</button></form> : null}
    </div>
    {showReply ? <form className="flow-simulator-reply" onSubmit={sendText}><label>{copy.simulatorInput}<input value={reply} onChange={(event) => setReply(event.target.value)} maxLength={4000} /></label><button type="submit" disabled={working || !reply.trim()}>{copy.simulatorSend}</button></form> : null}
    {commandTypes.length ? <p className="inline-message" role="status">{copy.simulatorSideEffect}: {commandTypes.join(", ")}</p> : null}
    {preview ? <p className="field-help">{copy.simulatorStatus}: <strong>{preview.state.status}</strong></p> : null}
    {props.disabled ? <p className="inline-message" role="status">{copy.simulatorSaveFirst}</p> : null}
    {error ? <p className="inline-message error" role="alert">{copy.simulatorFailed}</p> : null}
    <div className="flow-simulator-actions"><button type="button" disabled={working || props.disabled} onClick={() => void run([])}>{working ? copy.simulatorWorking : preview ? copy.simulatorRestart : copy.simulatorStart}</button></div>
  </section>;
}
