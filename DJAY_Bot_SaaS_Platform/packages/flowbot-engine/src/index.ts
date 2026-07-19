import { flowNodeEntitlementIssue, type FlowEntitlements, type FlowExecutionState, type FlowInput, type FlowNode, type FlowSnapshot } from "@djay/flowbot-domain";

export type FlowMessage = Readonly<{
  type: "text" | "media" | "card" | "carousel" | "actions" | "options" | "form" | "system";
  content: Readonly<Record<string, unknown>>;
  nodeId: string;
}>;
export type FlowCommand = Readonly<{
  type: "lead.create" | "handover.request" | "timer.schedule" | "subflow.enter" | "integration.dispatch";
  idempotencyKey: string;
  payload: Readonly<Record<string, unknown>>;
}>;
export type FlowEvent = Readonly<{ type: string; nodeId?: string; detail?: Readonly<Record<string, unknown>> }>;
export type ControlledEnvironment = Readonly<{
  now: string;
  isBusinessOpen: (scheduleKey: string, timezone: string, now: string) => boolean;
}>;
export type FlowEngineRequest = Readonly<{
  tenantId: string; deploymentId: string; executionId: string; flowVersionId: string;
  sequence: number; inputId: string; input: FlowInput; snapshot: FlowSnapshot;
  state: FlowExecutionState; authority: FlowEntitlements; environment: ControlledEnvironment;
}>;
export type FlowEngineResult = Readonly<{
  nextState: FlowExecutionState; messages: readonly FlowMessage[];
  commands: readonly FlowCommand[]; events: readonly FlowEvent[];
}>;

type MutableResult = { state: FlowExecutionState; messages: FlowMessage[]; commands: FlowCommand[]; events: FlowEvent[] };

export function advanceFlow(request: FlowEngineRequest): FlowEngineResult {
  if (request.authority.accessMode !== "active") throw new FlowRuntimeError("subscription_not_active");
  if (request.authority.entitlements["ai.enabled"] !== false) throw new FlowRuntimeError("non_ai_invariant_failed");
  if (request.snapshot.flowVersionId !== request.flowVersionId) throw new FlowRuntimeError("flow_version_mismatch");
  if (request.state.status === "completed" && request.input.type !== "action") throw new FlowRuntimeError("execution_completed");
  if (request.state.status === "handover" && !(request.input.type === "action" && request.input.payload.action === "return_to_flow")) {
    return { nextState: request.state, messages: [], commands: [], events: [{ type: "input_blocked_by_handover" }] };
  }

  const result: MutableResult = { state: request.state, messages: [], commands: [], events: [] };
  if (request.input.type === "start" || request.input.type === "action") {
    result.state = { ...request.state, status: "active", currentNodeId: request.snapshot.rootNodeId, activeFlowVersionId: request.flowVersionId, subflowStack: [] };
    result.events.push({ type: request.input.type === "start" ? "execution_started" : "execution_restarted" });
    return runAutomatic(request, result, request.snapshot.rootNodeId);
  }

  const activeGraph = graphFor(request.snapshot, request.state.activeFlowVersionId ?? request.flowVersionId);
  const current = request.state.currentNodeId ? activeGraph.nodes[request.state.currentNodeId] : undefined;
  if (!current) throw new FlowRuntimeError("current_node_missing");

  if (request.input.type === "option") {
    if (current.type !== "options") return handover(request, result, "invalid_option_state");
    const optionId = request.input.payload.optionId;
    const option = current.options.find((candidate) => candidate.id === optionId);
    if (!option) return handover(request, result, "invalid_option");
    result.events.push({ type: "option_selected", nodeId: current.id, detail: { optionId: option.id } });
    return runAutomatic(request, result, option.targetNodeId);
  }
  if (request.input.type === "form") {
    if (current.type !== "form" || current.id !== request.input.payload.nodeId) return handover(request, result, "invalid_form_state");
    const invalid = validateForm(current, request.input.payload.data);
    if (invalid.length) {
      result.messages.push({ type: "system", nodeId: current.id, content: { text: local(request.state.lang, "ขอข้อมูลที่จำเป็นให้ครบก่อนนะครับ", "Please complete the required details."), invalidFields: invalid } });
      result.events.push({ type: "form_rejected", nodeId: current.id, detail: { invalidFields: invalid } });
      return freeze(result);
    }
    result.commands.push(command(request, current.id, "lead.create", { sourceNodeId: current.id, data: request.input.payload.data }));
    result.events.push({ type: "form_accepted", nodeId: current.id });
    return current.nextNodeId ? runAutomatic(request, result, current.nextNodeId) : complete(result);
  }
  if (request.input.type === "text") {
    if (current.type === "input_capture") {
      result.state = { ...request.state, variables: { ...request.state.variables, [current.variableKey]: request.input.payload.text } };
      result.events.push({ type: "input_captured", nodeId: current.id, detail: { variableKey: current.variableKey } });
      return runAutomatic(request, result, current.nextNodeId);
    }
    if (current.type === "options") {
      const option = resolveTextOption(current, request.input.payload.text, request.state.lang);
      if (option) {
        result.events.push({ type: "option_selected", nodeId: current.id, detail: { optionId: option.id, source: "text" } });
        return runAutomatic(request, result, option.targetNodeId);
      }
    }
    const match = matchKeyword(request.input.payload.text, request.state.lang, activeGraph);
    if (match.kind === "match") {
      result.events.push({ type: "keyword_matched", nodeId: match.nodeId, detail: { tier: match.tier } });
      return runAutomatic(request, result, match.nodeId);
    }
    return handover(request, result, match.kind === "ambiguous" ? "ambiguous_keyword" : "keyword_miss");
  }
  if (request.input.type === "timer_fired") {
    if (current.type !== "delay" || current.id !== request.input.payload.nodeId) throw new FlowRuntimeError("invalid_timer_state");
    result.events.push({ type: "timer_fired", nodeId: current.id });
    return runAutomatic(request, result, current.nextNodeId);
  }
  if (request.input.type === "webhook_result") {
    if (current.type !== "webhook" || current.id !== request.input.payload.nodeId) throw new FlowRuntimeError("invalid_webhook_state");
    result.events.push({ type: "integration_completed", nodeId: current.id, detail: { success: request.input.payload.success } });
    return runAutomatic(request, result, request.input.payload.success ? current.nextNodeId : current.failureNodeId);
  }
  throw new FlowRuntimeError("unsupported_input");
}

function runAutomatic(request: FlowEngineRequest, result: MutableResult, startingNodeId: string): FlowEngineResult {
  let nodeId: string | null = startingNodeId;
  for (let transitions = 0; transitions < 100 && nodeId; transitions += 1) {
    const activeVersionId = result.state.activeFlowVersionId ?? request.flowVersionId;
    const activeGraph = graphFor(request.snapshot, activeVersionId);
    const node: FlowNode | undefined = activeGraph.nodes[nodeId];
    if (!node) throw new FlowRuntimeError("target_node_missing");
    if (flowNodeEntitlementIssue(node, request.authority)) throw new FlowRuntimeError("node_not_entitled");
    result.state = { ...result.state, currentNodeId: node.id, status: "active" };
    result.events.push({ type: "node_entered", nodeId: node.id, detail: { nodeType: node.type } });
    if (node.type === "message") { result.messages.push({ type: "text", nodeId: node.id, content: { text: localized(node.content, result.state.lang) } }); nodeId = node.nextNodeId; continue; }
    if (node.type === "media_reference") { result.messages.push({ type: "media", nodeId: node.id, content: { assetRef: node.assetRef, mediaType: node.mediaType, label: localized(node.label, result.state.lang) } }); nodeId = node.nextNodeId; continue; }
    if (node.type === "product_card") { result.messages.push({ type: "card", nodeId: node.id, content: localizeCard(node.card, result.state.lang) }); nodeId = node.nextNodeId; continue; }
    if (node.type === "carousel") { result.messages.push({ type: "carousel", nodeId: node.id, content: { cards: node.cards.map((card) => localizeCard(card, result.state.lang)) } }); nodeId = node.nextNodeId; continue; }
    if (node.type === "actions") { result.messages.push({ type: "actions", nodeId: node.id, content: { ...(node.prompt ? { text: localized(node.prompt, result.state.lang) } : {}), actions: localizeActions(node.actions, result.state.lang) } }); nodeId = node.nextNodeId; continue; }
    if (node.type === "options") { result.messages.push({ type: "options", nodeId: node.id, content: { text: localized(node.prompt, result.state.lang), options: node.options.map((option) => ({ id: option.id, label: localized(option.label, result.state.lang) })) } }); return freeze(result); }
    if (node.type === "input_capture") { result.messages.push({ type: "text", nodeId: node.id, content: { text: localized(node.prompt, result.state.lang), input: true } }); return freeze(result); }
    if (node.type === "form") { result.messages.push({ type: "form", nodeId: node.id, content: { text: localized(node.prompt, result.state.lang), fields: node.fields.map((field) => ({ key: field.key, label: localized(field.label, result.state.lang), type: field.type, required: field.required })) } }); return freeze(result); }
    if (node.type === "condition") { nodeId = evaluateClause(result.state.variables[node.variableKey], node.operator, node.value) ? node.trueNodeId : node.falseNodeId; continue; }
    if (node.type === "advanced_condition") { const decisions: boolean[] = node.clauses.map((clause) => evaluateClause(result.state.variables[clause.variableKey], clause.operator, clause.value)); nodeId = (node.mode === "all" ? decisions.every(Boolean) : decisions.some(Boolean)) ? node.trueNodeId : node.falseNodeId; continue; }
    if (node.type === "jump") { nodeId = node.targetNodeId; continue; }
    if (node.type === "variable_set") { result.state = { ...result.state, variables: { ...result.state.variables, [node.variableKey]: interpolate(node.valueTemplate, result.state.variables) } }; nodeId = node.nextNodeId; continue; }
    if (node.type === "business_hours") { nodeId = request.environment.isBusinessOpen(node.scheduleKey, node.timezone, request.environment.now) ? node.openNodeId : node.closedNodeId; continue; }
    if (node.type === "end") {
      if (node.message) result.messages.push({ type: "text", nodeId: node.id, content: { text: localized(node.message, result.state.lang) } });
      const frame = result.state.subflowStack.at(-1);
      if (!frame) return complete(result);
      result.state = {
        ...result.state,
        activeFlowVersionId: frame.flowVersionId,
        subflowStack: result.state.subflowStack.slice(0, -1),
      };
      result.events.push({ type: "subflow_completed", nodeId: node.id, detail: { flowVersionId: activeVersionId } });
      if (!frame.returnNodeId) return complete(result);
      nodeId = frame.returnNodeId;
      continue;
    }
    if (node.type === "delay") { result.state = { ...result.state, status: "waiting" }; result.commands.push(command(request, node.id, "timer.schedule", { delaySeconds: node.delaySeconds, nodeId: node.id })); return freeze(result); }
    if (node.type === "subflow") {
      const target = graphFor(request.snapshot, node.targetFlowVersionId);
      if (result.state.subflowStack.length >= 20) throw new FlowRuntimeError("subflow_depth_limit");
      result.state = {
        ...result.state,
        activeFlowVersionId: node.targetFlowVersionId,
        subflowStack: [...result.state.subflowStack, { flowVersionId: activeVersionId, returnNodeId: node.returnNodeId }],
      };
      result.events.push({ type: "subflow_entered", nodeId: node.id, detail: { flowVersionId: node.targetFlowVersionId } });
      nodeId = target.rootNodeId;
      continue;
    }
    if (node.type === "team_route") { if (node.message) result.messages.push({ type: "text", nodeId: node.id, content: { text: localized(node.message, result.state.lang) } }); result.state = { ...result.state, status: "handover" }; result.commands.push(command(request, node.id, "handover.request", { teamKey: node.teamKey, strategy: node.strategy })); return freeze(result); }
    if (node.type === "webhook") { result.state = { ...result.state, status: "waiting" }; result.commands.push(command(request, node.id, "integration.dispatch", { integrationProfileId: node.integrationProfileId, templateKey: node.templateKey, nodeId: node.id, variables: result.state.variables })); return freeze(result); }
  }
  throw new FlowRuntimeError("automatic_transition_limit");
}

function handover(request: FlowEngineRequest, result: MutableResult, reason: string): FlowEngineResult {
  result.state = { ...result.state, status: "handover" };
  result.messages.push({ type: "text", nodeId: result.state.currentNodeId ?? request.snapshot.rootNodeId, content: { text: local(result.state.lang, "ทีมงานจะช่วยดูต่อให้นะครับ", "Our team will continue from here.") } });
  result.commands.push(command(request, result.state.currentNodeId ?? request.snapshot.rootNodeId, "handover.request", { reason, strategy: "owner" }));
  result.events.push({ type: "handover_requested", detail: { reason } });
  return freeze(result);
}

function command(request: FlowEngineRequest, nodeId: string, type: FlowCommand["type"], payload: Record<string, unknown>): FlowCommand {
  return { type, idempotencyKey: `${request.executionId}:${request.sequence}:${nodeId}:${type}`, payload };
}
function complete(result: MutableResult): FlowEngineResult { result.state = { ...result.state, status: "completed", currentNodeId: null }; result.events.push({ type: "execution_completed" }); return freeze(result); }
function freeze(result: MutableResult): FlowEngineResult { return { nextState: result.state, messages: result.messages, commands: result.commands, events: result.events }; }
function localized(value: { th: string; en: string }, lang: "th" | "en") { return value[lang]; }
function local(lang: "th" | "en", th: string, en: string) { return lang === "th" ? th : en; }
function localizeActions(actions: readonly { type: string; label: { th: string; en: string }; url: string }[], lang: "th" | "en") {
  return actions.map((action) => ({ type: action.type, label: localized(action.label, lang), url: action.url }));
}
function localizeCard(card: { id: string; kind: string; title: { th: string; en: string }; description: { th: string; en: string }; imageUrl?: string | undefined; priceLabel?: { th: string; en: string } | undefined; actions: readonly { type: string; label: { th: string; en: string }; url: string }[] }, lang: "th" | "en") {
  return { id: card.id, kind: card.kind, title: localized(card.title, lang), description: localized(card.description, lang), ...(card.imageUrl ? { imageUrl: card.imageUrl } : {}), ...(card.priceLabel ? { priceLabel: localized(card.priceLabel, lang) } : {}), actions: localizeActions(card.actions, lang) };
}
function interpolate(template: string, variables: Record<string, string>) { return template.replace(/\{\{([a-z][a-z0-9_]*)\}\}/g, (_, key: string) => variables[key] ?? ""); }
function evaluateClause(actual: string | undefined, operator: string, expected?: string): boolean {
  if (operator === "exists") return Boolean(actual);
  if (operator === "equals") return actual === expected;
  if (operator === "not_equals") return actual !== expected;
  if (operator === "contains") return actual?.includes(expected ?? "") ?? false;
  if (operator === "greater_than") return Number(actual) > Number(expected);
  if (operator === "less_than") return Number(actual) < Number(expected);
  return false;
}
function validateForm(node: Extract<FlowNode, { type: "form" }>, data: Record<string, string>): string[] {
  return node.fields.filter((field) => {
    const value = String(data[field.key] ?? "").trim();
    if (field.required && !value) return true;
    if (value && field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return true;
    if (value && field.type === "phone" && value.replace(/\D/g, "").length < 7) return true;
    return false;
  }).map((field) => field.key);
}

function resolveTextOption(node: Extract<FlowNode, { type: "options" }>, value: string, lang: "th" | "en") {
  const normalized = normalize(value);
  const encoded = /^djay_option:([0-9a-f-]{36})$/i.exec(normalized)?.[1];
  if (encoded) return node.options.find((option) => option.id.toLowerCase() === encoded.toLowerCase());
  const matches = node.options.filter((option) => normalize(localized(option.label, lang)) === normalized);
  return matches.length === 1 ? matches[0] : undefined;
}

function normalize(value: string) { return value.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/g, " "); }
function graphFor(snapshot: FlowSnapshot, flowVersionId: string) {
  if (flowVersionId === snapshot.flowVersionId) return snapshot;
  const graph = snapshot.embeddedSubflows?.[flowVersionId];
  if (!graph) throw new FlowRuntimeError("subflow_snapshot_missing");
  return graph;
}

function matchKeyword(text: string, lang: "th" | "en", snapshot: Pick<FlowSnapshot, "keywords">): { kind: "match"; nodeId: string; tier: string } | { kind: "none" | "ambiguous" } {
  const input = normalize(text);
  const ranked = snapshot.keywords.filter((item) => item.lang === lang).map((item) => {
    const keyword = normalize(item.keyword); const exact = input === keyword;
    const contains = item.substringEnabled && (lang === "th" ? keyword.length >= 2 : keyword.length >= 3) && input.includes(keyword);
    return exact || contains ? { item, keyword, rank: exact ? 0 : 1 } : null;
  }).filter((item): item is NonNullable<typeof item> => Boolean(item)).sort((a, b) => a.rank - b.rank || b.keyword.length - a.keyword.length || a.item.priority - b.item.priority || a.item.order - b.item.order);
  if (!ranked[0]) return { kind: "none" };
  const first = ranked[0]; const tied = ranked.filter((item) => item.rank === first.rank && item.keyword.length === first.keyword.length && item.item.priority === first.item.priority);
  return tied.length > 1 ? { kind: "ambiguous" } : { kind: "match", nodeId: first.item.nodeId, tier: first.rank === 0 ? "exact" : "contains" };
}

export class FlowRuntimeError extends Error {
  constructor(readonly code: string) { super("Flow execution was rejected."); this.name = "FlowRuntimeError"; }
}
