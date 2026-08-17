"use client";

import { flowNodeEdges, flowNodeSchema } from "@djay/flowbot-domain";
import { flowbotEditorFieldConstraints } from "@djay/shared";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

type NodeRecord = Record<string, unknown> & { id: string; type: string; title: string };
type Definition = { schemaVersion: number; flowVersionId: string; rootNodeId: string; keywords: unknown[]; nodes: Record<string, NodeRecord> };

const coreTypes = ["message", "media_reference", "product_card", "carousel", "actions", "options", "input_capture", "form", "condition", "jump", "handover", "end"] as const;
const premiumTypes = ["advanced_condition", "variable_set", "delay", "business_hours", "team_route"] as const;

function starterNode(type: string, id: string, rootNodeId: string): NodeRecord {
  const base = { id, type, title: type.replaceAll("_", " ") };
  if (type === "message") return { ...base, content: { th: "ข้อความใหม่", en: "New message" }, nextNodeId: null };
  if (type === "media_reference") return { ...base, assetRef: "https://example.com/image.jpg", mediaType: "image", label: { th: "สื่อ", en: "Media" }, nextNodeId: null };
  const action = { type: "website", label: { th: "ดูเพิ่มเติม", en: "Learn more" }, url: "https://example.com" };
  const card = { id: crypto.randomUUID(), kind: "product", title: { th: "สินค้า", en: "Product" }, description: { th: "รายละเอียดสินค้า", en: "Product details" }, actions: [action] };
  if (type === "product_card") return { ...base, card, nextNodeId: null };
  if (type === "carousel") return { ...base, cards: [card], nextNodeId: null };
  if (type === "actions") return { ...base, prompt: { th: "เลือกการดำเนินการ", en: "Choose an action" }, actions: [action], nextNodeId: null };
  if (type === "options") return { ...base, prompt: { th: "เลือกตัวเลือก", en: "Choose an option" }, options: [{ id: crypto.randomUUID(), label: { th: "ตัวเลือก", en: "Option" }, targetNodeId: rootNodeId }] };
  if (type === "input_capture") return { ...base, prompt: { th: "กรอกข้อมูล", en: "Enter a value" }, variableKey: "answer", nextNodeId: rootNodeId };
  if (type === "form") return { ...base, prompt: { th: "ข้อมูลติดต่อ", en: "Contact details" }, fields: [{ key: "email", label: { th: "อีเมล", en: "Email" }, type: "email", required: true }], nextNodeId: null };
  if (type === "condition") return { ...base, variableKey: "answer", operator: "exists", trueNodeId: rootNodeId, falseNodeId: rootNodeId };
  if (type === "jump") return { ...base, targetNodeId: rootNodeId };
  if (type === "handover") return { ...base, message: { th: "ทีมงานจะดูแลต่อ", en: "Our team will continue." } };
  if (type === "end") return { ...base, message: { th: "ขอบคุณครับ", en: "Thank you." } };
  if (type === "advanced_condition") return { ...base, mode: "all", clauses: [{ variableKey: "answer", operator: "exists" }], trueNodeId: rootNodeId, falseNodeId: rootNodeId };
  if (type === "variable_set") return { ...base, variableKey: "value", valueTemplate: "{{answer}}", nextNodeId: rootNodeId };
  if (type === "delay") return { ...base, delaySeconds: 300, nextNodeId: rootNodeId };
  if (type === "business_hours") return { ...base, timezone: "Asia/Bangkok", scheduleKey: "sales", openNodeId: rootNodeId, closedNodeId: rootNodeId };
  return { ...base, teamKey: "sales", strategy: "least_active", message: { th: "ทีมงานจะดูแลต่อ", en: "Our team will continue." } };
}

function localizedValue(node: NodeRecord) {
  for (const key of ["content", "prompt", "message", "label"]) {
    const value = node[key];
    if (value && typeof value === "object" && !Array.isArray(value)) return { key, value: value as Record<string, unknown> };
  }
  return null;
}

export function FlowVisualEditor(props: Readonly<{
  value: string;
  onChange: (value: string) => void;
  onEditorErrorChange: (message: string) => void;
  readOnly: boolean;
  premium: boolean;
  validationPath?: readonly PropertyKey[] | undefined;
}>) {
  const [nodeJsonErrors, setNodeJsonErrors] = useState<Record<string, string>>({});
  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);
  const [, setHistoryVersion] = useState(0);
  const parsed = useMemo(() => {
    try {
      const value = JSON.parse(props.value) as Definition;
      return value && value.nodes && typeof value.nodes === "object" ? value : null;
    } catch { return null; }
  }, [props.value]);
  const nodeIds = parsed ? Object.keys(parsed.nodes).sort().join("|") : "";
  useEffect(() => {
    if (!parsed) return;
    setNodeJsonErrors((current) => Object.fromEntries(Object.entries(current).filter(([nodeId]) => nodeId in parsed.nodes)));
  }, [nodeIds]);
  const firstNodeJsonError = Object.values(nodeJsonErrors).find(Boolean) || "";
  useEffect(() => { props.onEditorErrorChange(firstNodeJsonError); }, [firstNodeJsonError, props.onEditorErrorChange]);

  function setNodeJsonError(nodeId: string, message: string) {
    setNodeJsonErrors((current) => {
      if (!message) {
        const next = { ...current }; delete next[nodeId]; return next;
      }
      return { ...current, [nodeId]: message };
    });
  }

  function replace(definition: Definition) {
    undoStack.current = [...undoStack.current.slice(-49), props.value];
    redoStack.current = [];
    setHistoryVersion((version) => version + 1);
    props.onChange(JSON.stringify(definition, null, 2));
  }
  function undo() {
    const previous = undoStack.current.at(-1); if (!previous) return;
    undoStack.current = undoStack.current.slice(0, -1);
    redoStack.current = [...redoStack.current.slice(-49), props.value];
    setHistoryVersion((version) => version + 1); props.onChange(previous);
  }
  function redo() {
    const next = redoStack.current.at(-1); if (!next) return;
    redoStack.current = redoStack.current.slice(0, -1);
    undoStack.current = [...undoStack.current.slice(-49), props.value];
    setHistoryVersion((version) => version + 1); props.onChange(next);
  }
  function updateNode(nodeId: string, update: (node: NodeRecord) => NodeRecord) {
    if (!parsed) return;
    replace({ ...parsed, nodes: { ...parsed.nodes, [nodeId]: update(parsed.nodes[nodeId]!) } });
  }
  function addNode(type: string) {
    if (!parsed) return;
    const id = crypto.randomUUID();
    replace({ ...parsed, nodes: { ...parsed.nodes, [id]: starterNode(type, id, parsed.rootNodeId) } });
  }
  function editNodeJson(nodeId: string, event: ChangeEvent<HTMLTextAreaElement>) {
    try {
      const node = JSON.parse(event.target.value) as NodeRecord;
      if (node.id !== nodeId) {
        setNodeJsonError(nodeId, "Node settings must keep the same node ID.");
        return;
      }
      const result = flowNodeSchema.safeParse(node);
      if (!result.success) {
        const issue = result.error.issues[0];
        const location = issue?.path.length ? ` at ${issue.path.join(".")}` : "";
        setNodeJsonError(nodeId, `Node settings are invalid${location}: ${issue?.message || "review the node fields"}.`);
        return;
      }
      setNodeJsonError(nodeId, "");
      updateNode(nodeId, () => result.data as NodeRecord);
    } catch {
      setNodeJsonError(nodeId, "Node settings must be valid JSON before this draft can be saved.");
    }
  }

  if (!parsed) return <div className="flow-visual-editor"><div className="flow-editor-invalid" id="flowbot-advanced-json-error" role="alert">การตั้งค่าต้องเป็น FlowBot JSON ที่ถูกต้องและมีแผนที่ nodes ส่วน JSON ขั้นสูงจะยังเปิดไว้ให้แก้ไข (Advanced JSON remains open so you can repair it.)</div><details className="advanced-definition" open><summary>JSON ขั้นสูง</summary><textarea value={props.value} onChange={(event) => props.onChange(event.target.value)} spellCheck={false} readOnly={props.readOnly} aria-invalid="true" aria-describedby="flowbot-advanced-json-error" data-flow-advanced-json /></details></div>;
  const nodes = Object.values(parsed.nodes);
  const validationPath = props.validationPath?.map(String) || [];
  return <div className="flow-visual-editor">
    <div className="flow-editor-history" role="toolbar" aria-label="ย้อนกลับหรือทำซ้ำการแก้ไข"><button type="button" disabled={props.readOnly || undoStack.current.length === 0} onClick={undo}>↶ ย้อนกลับ</button><button type="button" disabled={props.readOnly || redoStack.current.length === 0} onClick={redo}>↷ ทำซ้ำ</button><span>บันทึกฉบับร่างเมื่อพร้อม การเผยแพร่จะสร้างเวอร์ชันใหม่ที่ย้อนกลับได้</span></div>
    <div className="node-palette" role="toolbar" aria-label="เพิ่มโนดในโฟลว์" tabIndex={0}>
      {[...coreTypes, ...(props.premium ? premiumTypes : [])].map((type) => <button key={type} type="button" disabled={props.readOnly} onClick={() => addNode(type)}>+ {type.replaceAll("_", " ")}</button>)}
    </div>
    <div className="flow-node-list">
      {nodes.map((node, index) => {
        const localized = localizedValue(node);
        const nextRequired = ["input_capture", "variable_set", "delay", "webhook"].includes(node.type);
        const referencingNodes = nodes.filter((candidate) => {
          if (candidate.id === node.id) return false;
          const parsedCandidate = flowNodeSchema.safeParse(candidate);
          return parsedCandidate.success && flowNodeEdges(parsedCandidate.data).some((edge) => edge.targetNodeId === node.id);
        });
        const nodeValidationPath = validationPath[0] === "nodes" && validationPath[1] === node.id ? validationPath.slice(2).join(".") : "";
        return <article className={`flow-node-card ${node.id === parsed.rootNodeId ? "root" : ""}`} key={node.id} data-flow-node-id={node.id}>
          <header><span>{String(index + 1).padStart(2, "0")}</span><div><strong data-no-localize>{node.title}</strong><small>{node.type}{node.id === parsed.rootNodeId ? " · entry" : ""}</small></div>
            {!props.readOnly && node.id !== parsed.rootNodeId ? <button type="button" className="node-delete" disabled={referencingNodes.length > 0} title={referencingNodes.length ? `ถูกใช้งานโดย ${referencingNodes.map((item) => item.title).join(", ")}` : "นำโนดออก"} onClick={() => {
              const next = { ...parsed.nodes }; delete next[node.id]; setNodeJsonError(node.id, ""); replace({ ...parsed, nodes: next });
            }}>นำออก</button> : null}
          </header>
          <div className="node-fields">
            <label>ชื่อเรื่อง<input value={node.title} readOnly={props.readOnly} {...flowbotEditorFieldConstraints.title} required aria-invalid={nodeValidationPath === "title" || undefined} aria-describedby={nodeValidationPath === "title" ? "flowbot-draft-error" : undefined} data-flow-node-field="title" onChange={(event) => updateNode(node.id, (current) => ({ ...current, title: event.target.value }))} /></label>
            <label>โนดเริ่มต้น<select value={node.id === parsed.rootNodeId ? node.id : ""} disabled={props.readOnly} onChange={() => replace({ ...parsed, rootNodeId: node.id })}><option value="">ไม่</option><option value={node.id}>ใช่</option></select></label>
            {localized ? <>
              <label>English<input value={String(localized.value.en ?? "")} readOnly={props.readOnly} {...flowbotEditorFieldConstraints.localizedText} aria-invalid={nodeValidationPath === `${localized.key}.en` || undefined} aria-describedby={nodeValidationPath === `${localized.key}.en` ? "flowbot-draft-error" : undefined} data-flow-node-field={`${localized.key}.en`} onChange={(event) => updateNode(node.id, (current) => ({ ...current, [localized.key]: { ...localized.value, en: event.target.value } }))} /></label>
              <label>ไทย<input value={String(localized.value.th ?? "")} readOnly={props.readOnly} {...flowbotEditorFieldConstraints.localizedText} aria-invalid={nodeValidationPath === `${localized.key}.th` || undefined} aria-describedby={nodeValidationPath === `${localized.key}.th` ? "flowbot-draft-error" : undefined} data-flow-node-field={`${localized.key}.th`} onChange={(event) => updateNode(node.id, (current) => ({ ...current, [localized.key]: { ...localized.value, th: event.target.value } }))} /></label>
            </> : null}
            {"nextNodeId" in node ? <label>ขั้นตอนถัดไป<select value={typeof node.nextNodeId === "string" ? node.nextNodeId : ""} disabled={props.readOnly} required={nextRequired} onChange={(event) => updateNode(node.id, (current) => ({ ...current, nextNodeId: event.target.value || null }))}>{!nextRequired ? <option value="">จบเส้นทางที่นี่</option> : <option value="" disabled>เลือกขั้นตอน</option>}{nodes.filter((candidate) => candidate.id !== node.id).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.title}</option>)}</select></label> : null}
            {referencingNodes.length ? <p className="flow-node-reference-note">เชื่อมมาจาก: {referencingNodes.map((item) => item.title).join(", ")} ต้องเปลี่ยนเส้นทางเหล่านั้นก่อนจึงจะนำโนดนี้ออกได้</p> : null}
          </div>
          <details><summary>การตั้งค่าโนด</summary><textarea key={JSON.stringify(node)} defaultValue={JSON.stringify(node, null, 2)} readOnly={props.readOnly} onInput={() => setNodeJsonError(node.id, "Node settings have unvalidated edits. Leave this field to validate them before saving.")} onBlur={(event) => editNodeJson(node.id, event)} spellCheck={false} aria-invalid={Boolean(nodeJsonErrors[node.id]) || undefined} aria-describedby={nodeJsonErrors[node.id] ? `flow-node-json-error-${node.id}` : undefined} />{nodeJsonErrors[node.id] ? <p className="inline-message error" id={`flow-node-json-error-${node.id}`} role="alert">{nodeJsonErrors[node.id]}</p> : null}</details>
        </article>;
      })}
    </div>
    <details className="advanced-definition"><summary>JSON ขั้นสูง</summary><textarea value={props.value} onChange={(event) => props.onChange(event.target.value)} spellCheck={false} readOnly={props.readOnly} aria-invalid={validationPath.length > 0 || undefined} aria-describedby={validationPath.length > 0 ? "flowbot-draft-error" : undefined} data-flow-advanced-json /></details>
  </div>;
}
