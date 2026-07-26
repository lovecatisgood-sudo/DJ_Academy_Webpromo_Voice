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
export type FlowCanvasEdge = Readonly<{ id: string; source: string; target: string; kind: FlowEdgeKind; label: string }>;
export type FlowCanvasWarning = Readonly<{ code: FlowCanvasWarningCode; nodeId: string; nodeTitle: string; label: string; detail: string }>;
export type FlowCanvasModel = Readonly<{ nodes: readonly FlowCanvasNode[]; edges: readonly FlowCanvasEdge[]; warnings: readonly FlowCanvasWarning[] }>;

type LooseGraph = Readonly<{ rootNodeId?: unknown; nodes?: unknown; keywords?: unknown }>;

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
      edges.push({ id: `${id}:${item.kind}:${index}`, source: id, target: item.targetNodeId, kind: item.kind, label: edgeLabel(item.kind, item.label) });
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

  const positions = layoutPositions([...nodes.keys()], edges);
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
function layoutPositions(nodeIds: readonly string[], edges: readonly FlowCanvasEdge[]): ReadonlyMap<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
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
    positions.set(id, { x, y });
  });
  return positions;
}
