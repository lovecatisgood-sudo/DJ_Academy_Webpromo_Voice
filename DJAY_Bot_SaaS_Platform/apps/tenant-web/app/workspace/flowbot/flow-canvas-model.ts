import dagre from "@dagrejs/dagre";
import type { OnboardingLocale } from "@djay/channel-onboarding/messages";
import { flowCtaNodeTypes, flowGraphAdvisories, flowNodeEdges, type FlowEdgeKind, type FlowNode, type FlowNodeType } from "@djay/flowbot-domain";
import { flowCanvasCopy, type FlowCanvasCopyKey } from "../../../lib/i18n/flow-canvas";

/**
 * Pure graph → canvas mapping. Deliberately free of React and of the DOM so the parts a merchant
 * depends on (branch labels, CTA marking, warning placement, auto-layout) are unit-testable.
 *
 * Every edge and every CTA decision comes from `@djay/flowbot-domain` — `flowNodeEdges`,
 * `flowCtaNodeTypes` and `flowGraphAdvisories`. Nothing about the graph is re-derived here: if the
 * canvas and publish validation ever disagreed about what an edge is, the canvas would be lying.
 */

export const flowCanvasNodeSize = { width: 264, height: 108 } as const;
const layoutOptions = { rankdir: "LR", nodesep: 44, ranksep: 96, marginx: 28, marginy: 28 } as const;

export type FlowCanvasWarningCode = "unreachable_node" | "cycle_detected" | "path_without_cta";
const warningCodes: readonly FlowCanvasWarningCode[] = ["unreachable_node", "cycle_detected", "path_without_cta"];

export type FlowCanvasNode = Readonly<{
  id: string;
  nodeType: string;
  title: string;
  typeLabel: string;
  isRoot: boolean;
  isCta: boolean;
  isTerminal: boolean;
  warnings: readonly FlowCanvasWarningCode[];
  position: Readonly<{ x: number; y: number }>;
}>;
export type FlowCanvasEdge = Readonly<{ id: string; source: string; target: string; kind: FlowEdgeKind; edgeIndex: number; label: string }>;
export type FlowCanvasWarning = Readonly<{ code: FlowCanvasWarningCode; nodeId: string; nodeTitle: string; label: string; detail: string }>;
export type FlowCanvasModel = Readonly<{ nodes: readonly FlowCanvasNode[]; edges: readonly FlowCanvasEdge[]; warnings: readonly FlowCanvasWarning[] }>;

type LooseGraph = Readonly<{ rootNodeId?: unknown; nodes?: unknown; keywords?: unknown; editor?: unknown }>;

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isWarningCode = (code: string): code is FlowCanvasWarningCode => (warningCodes as readonly string[]).includes(code);

function localized(value: unknown, locale: OnboardingLocale): string {
  if (!isRecord(value)) return "";
  const preferred = value[locale]; const fallback = value[locale === "th" ? "en" : "th"];
  if (typeof preferred === "string" && preferred.trim()) return preferred.trim();
  return typeof fallback === "string" ? fallback.trim() : "";
}

/**
 * Reads whatever the draft API returned. Definitions are read straight from a draft, so they may be
 * mid-edit and schema-invalid; the domain helpers are defensive by design and this must not throw.
 */
function readNodes(graph: LooseGraph): ReadonlyMap<string, FlowNode> {
  const nodes = new Map<string, FlowNode>();
  if (!isRecord(graph.nodes)) return nodes;
  for (const [id, node] of Object.entries(graph.nodes)) {
    if (isRecord(node) && typeof node.type === "string") nodes.set(id, node as unknown as FlowNode);
  }
  return nodes;
}

export function buildFlowCanvasModel(definition: unknown, locale: OnboardingLocale): FlowCanvasModel {
  const copy = flowCanvasCopy(locale);
  const graph: LooseGraph = isRecord(definition) ? definition : {};
  const nodes = readNodes(graph);
  if (!nodes.size) return { nodes: [], edges: [], warnings: [] };
  const rootNodeId = typeof graph.rootNodeId === "string" ? graph.rootNodeId : "";

  const typeLabel = (nodeType: string) => {
    const key = `node_${nodeType}` as FlowCanvasCopyKey;
    return copy[key] ?? nodeType.replaceAll("_", " ");
  };
  const edgeLabel = (kind: FlowEdgeKind, label: unknown) => {
    const optionText = kind === "option" ? localized(label, locale) : "";
    return optionText || copy[`edge_${kind}` as FlowCanvasCopyKey] || kind;
  };

  const edges: FlowCanvasEdge[] = [];
  for (const [id, node] of nodes) {
    flowNodeEdges(node).forEach((item, index) => {
      if (!nodes.has(item.targetNodeId)) return; // A dangling target is a publish blocker, not a drawable edge.
      edges.push({ id: `${id}:${item.kind}:${index}`, source: id, target: item.targetNodeId, kind: item.kind, edgeIndex: index, label: edgeLabel(item.kind, item.label) });
    });
  }

  const advisories = flowGraphAdvisories({
    ...(rootNodeId ? { rootNodeId } : {}),
    nodes: Object.fromEntries(nodes),
    keywords: Array.isArray(graph.keywords) ? graph.keywords.filter(isRecord).map((keyword) => ({ nodeId: String(keyword.nodeId ?? "") })) : [],
  });
  const perNodeWarnings = new Map<string, FlowCanvasWarningCode[]>();
  const warnings: FlowCanvasWarning[] = [];
  for (const advisory of advisories) {
    if (!advisory.nodeId || !isWarningCode(advisory.code)) continue;
    const node = nodes.get(advisory.nodeId); if (!node) continue;
    const existing = perNodeWarnings.get(advisory.nodeId) ?? [];
    existing.push(advisory.code); perNodeWarnings.set(advisory.nodeId, existing);
    const title = typeof node.title === "string" && node.title.trim() ? node.title.trim() : typeLabel(node.type);
    warnings.push({ code: advisory.code, nodeId: advisory.nodeId, nodeTitle: title, label: copy[advisory.code], detail: copy[`${advisory.code}_detail` as FlowCanvasCopyKey] });
  }

  const positions = layoutPositions([...nodes.keys()], edges, graph.editor);
  const canvasNodes = [...nodes].map(([id, node]) => {
    const label = typeLabel(node.type);
    return {
      id, nodeType: node.type, typeLabel: label,
      title: typeof node.title === "string" && node.title.trim() ? node.title.trim() : label,
      isRoot: id === rootNodeId,
      isCta: (flowCtaNodeTypes as readonly string[]).includes(node.type as FlowNodeType),
      isTerminal: flowNodeEdges(node).length === 0,
      warnings: perNodeWarnings.get(id) ?? [],
      position: positions.get(id) ?? { x: 0, y: 0 },
    } satisfies FlowCanvasNode;
  });
  return { nodes: canvasNodes, edges, warnings };
}

/**
 * Auto-layout, because no flow stores coordinates. Dagre is synchronous, so positions are produced
 * during the same render pass that reads the draft — no layout effect, no worker, no flash of an
 * unlaid-out graph. Left-to-right keeps branch labels on horizontal edges where they do not collide
 * with stacked sibling nodes. Returned positions are top-left corners for React Flow; dagre reports
 * node centres.
 */
function layoutPositions(nodeIds: readonly string[], edges: readonly FlowCanvasEdge[], editor: unknown): ReadonlyMap<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const storedPositions = isRecord(editor) && isRecord(editor.positions) ? editor.positions : {};
  const layout = new dagre.graphlib.Graph({ directed: true, multigraph: true });
  layout.setGraph({ ...layoutOptions });
  layout.setDefaultEdgeLabel(() => ({}));
  for (const id of nodeIds) layout.setNode(id, { ...flowCanvasNodeSize });
  for (const edge of edges) if (edge.source !== edge.target) layout.setEdge(edge.source, edge.target, {}, edge.id);
  try {
    dagre.layout(layout);
  } catch {
    // A layout failure must never blank the canvas; fall back to a readable column.
    nodeIds.forEach((id, index) => positions.set(id, { x: 0, y: index * (flowCanvasNodeSize.height + layoutOptions.nodesep) }));
    return positions;
  }
  nodeIds.forEach((id, index) => {
    const placed = layout.node(id);
    const x = typeof placed?.x === "number" ? placed.x - flowCanvasNodeSize.width / 2 : 0;
    const y = typeof placed?.y === "number" ? placed.y - flowCanvasNodeSize.height / 2 : index * (flowCanvasNodeSize.height + layoutOptions.nodesep);
    const stored = storedPositions[id];
    positions.set(id, isRecord(stored) && typeof stored.x === "number" && Number.isFinite(stored.x)
      && typeof stored.y === "number" && Number.isFinite(stored.y) ? { x: stored.x, y: stored.y } : { x, y });
  });
  return positions;
}

export function moveFlowCanvasNode(definition: unknown, nodeId: string, position: Readonly<{ x: number; y: number }>): Record<string, unknown> | null {
  if (!isRecord(definition) || !isRecord(definition.nodes) || !isRecord(definition.nodes[nodeId])) return null;
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) return null;
  const existingEditor = isRecord(definition.editor) ? definition.editor : {};
  const existingPositions = isRecord(existingEditor.positions) ? existingEditor.positions : {};
  return { ...definition, editor: { ...existingEditor, positions: { ...existingPositions, [nodeId]: { x: position.x, y: position.y } } } };
}

export function retargetFlowCanvasEdge(definition: unknown, edge: Pick<FlowCanvasEdge, "source" | "kind" | "edgeIndex">, targetNodeId: string): Record<string, unknown> | null {
  if (!isRecord(definition) || !isRecord(definition.nodes) || !isRecord(definition.nodes[targetNodeId])) return null;
  const sourceNode = definition.nodes[edge.source];
  if (!isRecord(sourceNode)) return null;
  let updated: Record<string, unknown> | null = null;
  if (edge.kind === "option" && Array.isArray(sourceNode.options)) {
    const options = sourceNode.options.map((option, index) => index === edge.edgeIndex && isRecord(option) ? { ...option, targetNodeId } : option);
    if (options[edge.edgeIndex] !== sourceNode.options[edge.edgeIndex]) updated = { ...sourceNode, options };
  } else if (edge.kind !== "option") {
    const field = ({ next: "nextNodeId", true: "trueNodeId", false: "falseNodeId", open: "openNodeId", closed: "closedNodeId", failure: "failureNodeId", jump: "targetNodeId", subflow_return: "returnNodeId" } as const)[edge.kind];
    if (field && field in sourceNode) updated = { ...sourceNode, [field]: targetNodeId };
  }
  return updated ? { ...definition, nodes: { ...definition.nodes, [edge.source]: updated } } : null;
}

export function connectFlowCanvasNodes(definition: unknown, sourceNodeId: string, targetNodeId: string): Record<string, unknown> | null {
  if (!isRecord(definition) || !isRecord(definition.nodes) || !isRecord(definition.nodes[targetNodeId])) return null;
  const sourceNode = definition.nodes[sourceNodeId];
  if (!isRecord(sourceNode) || typeof sourceNode.type !== "string") return null;
  const optionalNextTypes = new Set(["message", "media_reference", "product_card", "carousel", "actions", "form"]);
  let field: "nextNodeId" | "returnNodeId" | null = null;
  if (optionalNextTypes.has(sourceNode.type) && sourceNode.nextNodeId === null) field = "nextNodeId";
  if (sourceNode.type === "subflow" && sourceNode.returnNodeId === null) field = "returnNodeId";
  if (!field) return null;
  return { ...definition, nodes: { ...definition.nodes, [sourceNodeId]: { ...sourceNode, [field]: targetNodeId } } };
}

export function addFlowCanvasMessage(definition: unknown, nodeId: string, position: Readonly<{ x: number; y: number }>, title: string): Record<string, unknown> | null {
  if (!isRecord(definition) || !isRecord(definition.nodes) || definition.nodes[nodeId] || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return null;
  const withNode = { ...definition, nodes: { ...definition.nodes, [nodeId]: { id: nodeId, type: "message", title, content: { th: "ข้อความใหม่", en: "New message" }, nextNodeId: null } } };
  return moveFlowCanvasNode(withNode, nodeId, position);
}

export function duplicateFlowCanvasNode(definition: unknown, sourceNodeId: string, newNodeId: string): Record<string, unknown> | null {
  if (!isRecord(definition) || !isRecord(definition.nodes) || definition.nodes[newNodeId]) return null;
  const sourceNode = definition.nodes[sourceNodeId];
  if (!isRecord(sourceNode)) return null;
  const sourceTitle = typeof sourceNode.title === "string" ? sourceNode.title : "Node";
  const withNode = { ...definition, nodes: { ...definition.nodes, [newNodeId]: { ...sourceNode, id: newNodeId, title: `${sourceTitle} copy` } } };
  const model = buildFlowCanvasModel(definition, "th");
  const sourcePosition = model.nodes.find((node) => node.id === sourceNodeId)?.position ?? { x: 0, y: 0 };
  return moveFlowCanvasNode(withNode, newNodeId, { x: sourcePosition.x + 36, y: sourcePosition.y + 144 });
}

export function deleteFlowCanvasNodes(definition: unknown, nodeIds: readonly string[]): Record<string, unknown> | null {
  if (!isRecord(definition) || !isRecord(definition.nodes) || typeof definition.rootNodeId !== "string") return null;
  const removing = new Set(nodeIds);
  if (!removing.size || removing.has(definition.rootNodeId)) return null;
  for (const [id, node] of Object.entries(definition.nodes)) {
    if (removing.has(id) || !isRecord(node) || typeof node.type !== "string") continue;
    if (flowNodeEdges(node as unknown as FlowNode).some((edge) => removing.has(edge.targetNodeId))) return null;
  }
  const nodes = Object.fromEntries(Object.entries(definition.nodes).filter(([id]) => !removing.has(id)));
  const editor = isRecord(definition.editor) && isRecord(definition.editor.positions)
    ? { ...definition.editor, positions: Object.fromEntries(Object.entries(definition.editor.positions).filter(([id]) => !removing.has(id))) }
    : definition.editor;
  return { ...definition, nodes, ...(editor ? { editor } : {}) };
}
