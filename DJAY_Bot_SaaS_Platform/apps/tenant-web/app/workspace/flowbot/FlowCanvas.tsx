"use client";

import type { OnboardingLocale } from "@djay/channel-onboarding/messages";
import {
  applyNodeChanges, Background, Controls, Handle, MiniMap, Position, ReactFlow,
  type Connection, type Edge, type Node, type NodeChange, type NodeProps, type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo, useState } from "react";
import { flowCanvasCopy } from "../../../lib/i18n/flow-canvas";
import { addFlowCanvasMessage, buildFlowCanvasModel, connectFlowCanvasNodes, deleteFlowCanvasNodes, duplicateFlowCanvasNode, flowCanvasNodeSize, moveFlowCanvasNode, retargetFlowCanvasEdge, type FlowCanvasNode } from "./flow-canvas-model";

/**
 * Editable canvas. Every edge, CTA marking and warning comes from `flow-canvas-model`, which reads
 * `@djay/flowbot-domain`; this file only decides how those facts look. Colours come from the brand
 * tokens in `packages/shared/brand.css` via `app/styles.css` — the React Flow theme variables are
 * remapped there rather than restyled with new literals here.
 */

type CardData = {
  title: string; typeLabel: string;
  isRoot: boolean; isCta: boolean; isTerminal: boolean;
  rootLabel: string; ctaLabel: string; terminalLabel: string;
  editable: boolean;
  simulated: boolean; simulatedLabel: string;
  warningLabels: readonly string[];
};
type CardNode = Node<CardData, "flowCard">;

function FlowCard({ data }: NodeProps<CardNode>) {
  return (
    <div className="flow-canvas-card" data-root={data.isRoot || undefined} data-cta={data.isCta || undefined}
      data-terminal={data.isTerminal || undefined} data-warned={data.warningLabels.length ? true : undefined}
      data-simulated={data.simulated || undefined}>
      <Handle type="target" position={Position.Left} isConnectable={data.editable} />
      <p className="flow-canvas-card-type">{data.typeLabel}</p>
      <strong className="flow-canvas-card-title" data-no-localize>{data.title}</strong>
      <div className="flow-canvas-card-badges">
        {data.isRoot ? <span className="flow-canvas-badge is-root">{data.rootLabel}</span> : null}
        {data.isCta ? <span className="flow-canvas-badge is-cta">{data.ctaLabel}</span> : null}
        {data.isTerminal && !data.isCta ? <span className="flow-canvas-badge is-terminal">{data.terminalLabel}</span> : null}
        {data.simulated ? <span className="flow-canvas-badge is-simulated">{data.simulatedLabel}</span> : null}
        {data.warningLabels.map((label) => <span className="flow-canvas-badge is-warning" key={label}>{label}</span>)}
      </div>
      <Handle type="source" position={Position.Right} isConnectable={data.editable} />
    </div>
  );
}

const nodeTypes = { flowCard: FlowCard } as const;

const minimapClassName = (node: Node) => {
  const data = node.data as Partial<CardData>;
  if (data.warningLabels?.length) return "flow-canvas-mini-node is-warning";
  if (data.isCta) return "flow-canvas-mini-node is-cta";
  if (data.isRoot) return "flow-canvas-mini-node is-root";
  return "flow-canvas-mini-node";
};

export function FlowCanvas(props: Readonly<{
  definition: unknown; locale: OnboardingLocale; invalidDefinition?: boolean; readOnly?: boolean;
  onChange?: (definition: Record<string, unknown>) => void;
  onEditorMessage?: (message: string) => void;
  canUndo?: boolean; canRedo?: boolean;
  onUndo?: () => void; onRedo?: () => void;
  highlightedNodeIds?: readonly string[];
  onSelectedNodeChange?: (nodeId: string | null, title: string | null) => void;
}>) {
  const copy = flowCanvasCopy(props.locale);
  const model = useMemo(() => buildFlowCanvasModel(props.definition, props.locale), [props.definition, props.locale]);
  const [instance, setInstance] = useState<ReactFlowInstance<CardNode, Edge> | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<readonly string[]>([]);
  // React Flow measures the DOM, so it is mounted only in the browser. This keeps the route
  // prerenderable and hydration deterministic.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const editable = !props.readOnly && Boolean(props.onChange) && !props.invalidDefinition;
  const renderedNodes: CardNode[] = useMemo(() => model.nodes.map((node: FlowCanvasNode) => ({
    id: node.id, type: "flowCard" as const, position: { x: node.position.x, y: node.position.y },
    width: flowCanvasNodeSize.width, height: flowCanvasNodeSize.height,
    data: {
      title: node.title, typeLabel: node.typeLabel,
      isRoot: node.isRoot, isCta: node.isCta, isTerminal: node.isTerminal,
      simulated: props.highlightedNodeIds?.includes(node.id) ?? false, simulatedLabel: copy.simulatedBadge,
      editable,
      rootLabel: copy.rootBadge, ctaLabel: copy.ctaBadge, terminalLabel: copy.terminalBadge,
      warningLabels: node.warnings.map((code) => copy[code]),
    },
  })), [model, copy, editable, props.highlightedNodeIds]);
  const [nodes, setNodes] = useState<CardNode[]>(renderedNodes);
  useEffect(() => { setNodes(renderedNodes); }, [renderedNodes]);

  const edges: Edge[] = useMemo(() => model.edges.map((edge) => ({
    id: edge.id, source: edge.source, target: edge.target, label: edge.label,
    type: "smoothstep", className: `flow-canvas-edge is-${edge.kind}${props.highlightedNodeIds?.includes(edge.source) && props.highlightedNodeIds?.includes(edge.target) ? " is-simulated" : ""}`,
    labelShowBg: true, labelBgPadding: [6, 3] as [number, number], labelBgBorderRadius: 4,
  })), [model, props.highlightedNodeIds]);

  function revealNode(nodeId: string) {
    void instance?.fitView({ nodes: [{ id: nodeId }], duration: 320, maxZoom: 1.1, padding: 0.6 });
  }

  function changeNodes(changes: NodeChange<CardNode>[]) {
    if (editable) setNodes((current) => applyNodeChanges(changes, current));
  }

  function commitPosition(_: unknown, node: CardNode) {
    if (!editable) return;
    const changed = moveFlowCanvasNode(props.definition, node.id, node.position);
    if (changed) props.onChange?.(changed);
  }

  function connect(connection: Connection) {
    if (!editable || !connection.source || !connection.target) return;
    const changed = connectFlowCanvasNodes(props.definition, connection.source, connection.target);
    if (changed) props.onChange?.(changed);
    else props.onEditorMessage?.(copy.connectRejected);
  }

  function reconnect(oldEdge: Edge, connection: Connection) {
    if (!editable || !connection.target || connection.source !== oldEdge.source) {
      props.onEditorMessage?.(copy.edgeRejected); return;
    }
    const modelEdge = model.edges.find((item) => item.id === oldEdge.id);
    const changed = modelEdge ? retargetFlowCanvasEdge(props.definition, modelEdge, connection.target) : null;
    if (changed) props.onChange?.(changed);
    else props.onEditorMessage?.(copy.edgeRejected);
  }

  function addNode() {
    if (!editable) return;
    const rightmost = model.nodes.reduce((value, node) => Math.max(value, node.position.x), 0);
    const changed = addFlowCanvasMessage(props.definition, crypto.randomUUID(), { x: rightmost + 340, y: 40 }, props.locale === "th" ? "ข้อความใหม่" : "New message");
    if (changed) props.onChange?.(changed);
  }

  function duplicateNode() {
    if (!editable || selectedNodeIds.length !== 1) return;
    const changed = duplicateFlowCanvasNode(props.definition, selectedNodeIds[0]!, crypto.randomUUID());
    if (changed) { props.onChange?.(changed); setSelectedNodeIds([]); }
  }

  function deleteNodes() {
    if (!editable || !selectedNodeIds.length) return;
    const changed = deleteFlowCanvasNodes(props.definition, selectedNodeIds);
    if (changed) { props.onChange?.(changed); setSelectedNodeIds([]); }
    else props.onEditorMessage?.(copy.deleteRejected);
  }

  return (
    <div className="flow-canvas-shell">
      <p className="field-help">{editable ? copy.editNotice : copy.readOnlyNotice}</p>
      {props.invalidDefinition ? <p className="inline-message error" role="alert">{copy.invalidDefinition}</p> : null}
      {editable ? <div className="flow-canvas-toolbar" aria-label={copy.canvasLabel}>
        <button type="button" onClick={addNode}>{copy.addNode}</button>
        <button type="button" className="secondary-command" onClick={duplicateNode} disabled={selectedNodeIds.length !== 1}>{copy.duplicateNode}</button>
        <button type="button" className="secondary-command" onClick={deleteNodes} disabled={!selectedNodeIds.length}>{copy.deleteNode}</button>
        <button type="button" className="secondary-command" onClick={props.onUndo} disabled={!props.canUndo}>{copy.undo}</button>
        <button type="button" className="secondary-command" onClick={props.onRedo} disabled={!props.canRedo}>{copy.redo}</button>
        <button type="button" className="secondary-command" onClick={() => void instance?.fitView({ duration: 320, padding: 0.2 })} disabled={!instance}>{copy.fitView}</button>
        <span>{selectedNodeIds.length} {copy.selectionCount}</span>
      </div> : null}
      <div className="flow-canvas" role="group" aria-label={copy.canvasLabel} tabIndex={0}
        onKeyDown={(event) => {
          const target = event.target as HTMLElement;
          if (editable && !["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName) && (event.key === "Delete" || event.key === "Backspace")) {
            event.preventDefault(); deleteNodes();
          }
        }}>
        {mounted ? (
          <ReactFlow<CardNode, Edge>
            nodes={nodes} edges={edges} nodeTypes={nodeTypes} onInit={setInstance}
            onNodesChange={changeNodes} onNodeDragStop={commitPosition} onConnect={connect} onReconnect={reconnect}
            onSelectionChange={({ nodes: selected }) => {
              setSelectedNodeIds(selected.map((node) => node.id));
              const first = selected[0];
              props.onSelectedNodeChange?.(first?.id ?? null, first ? String(first.data.title) : null);
            }}
            fitView nodesDraggable={editable} nodesConnectable={editable} edgesReconnectable={editable} elementsSelectable
            deleteKeyCode={null} selectionOnDrag panOnDrag={[1, 2]}
            zoomOnDoubleClick={false} minZoom={0.15} proOptions={{ hideAttribution: false }}
          >
            <Background gap={22} />
            <MiniMap pannable zoomable nodeClassName={minimapClassName} ariaLabel={copy.minimapLabel} />
            <Controls showInteractive />
          </ReactFlow>
        ) : <p className="flow-canvas-placeholder">{copy.loading}</p>}
      </div>
      <dl className="flow-canvas-legend" aria-label={copy.legendTitle}>
        <div><dt className="flow-canvas-swatch is-root" /><dd>{copy.legendRoot}</dd></div>
        <div><dt className="flow-canvas-swatch is-cta" /><dd>{copy.legendCta}</dd></div>
        <div><dt className="flow-canvas-swatch is-terminal" /><dd>{copy.legendTerminal}</dd></div>
        <div><dt className="flow-canvas-swatch is-warning" /><dd>{copy.legendWarning}</dd></div>
      </dl>
      <section className="flow-canvas-warnings" aria-live="polite">
        <div className="band-heading"><div><p>{copy.advisoryTitle}</p><h3>{model.warnings.length ? `${model.warnings.length}` : copy.advisoryNone}</h3></div><span>{copy.advisoryNotBlocking}</span></div>
        {model.warnings.length ? <div className="data-table">
          {model.warnings.map((warning) => (
            <div className="data-row" key={`${warning.code}-${warning.nodeId}`}>
              <div><strong>{warning.nodeTitle}</strong><span>{warning.detail}</span></div>
              <span className="flow-canvas-badge is-warning">{warning.label}</span>
              <button type="button" className="secondary-command" onClick={() => revealNode(warning.nodeId)} disabled={!instance}>{copy.showOnMap}</button>
            </div>
          ))}
        </div> : null}
      </section>
    </div>
  );
}
