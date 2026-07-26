"use client";

import type { OnboardingLocale } from "@djay/channel-onboarding/messages";
import {
  Background, Controls, Handle, MiniMap, Position, ReactFlow,
  type Edge, type Node, type NodeProps, type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo, useState } from "react";
import { flowCanvasCopy } from "../../../lib/i18n/flow-canvas";
import { buildFlowCanvasModel, flowCanvasNodeSize, type FlowCanvasNode } from "./flow-canvas-model";

/**
 * Read-only canvas. Every edge, CTA marking and warning comes from `flow-canvas-model`, which reads
 * `@djay/flowbot-domain`; this file only decides how those facts look. Colours come from the brand
 * tokens in `packages/shared/brand.css` via `app/styles.css` — the React Flow theme variables are
 * remapped there rather than restyled with new literals here.
 */

type CardData = {
  title: string; typeLabel: string;
  isRoot: boolean; isCta: boolean; isTerminal: boolean;
  rootLabel: string; ctaLabel: string; terminalLabel: string;
  warningLabels: readonly string[];
};
type CardNode = Node<CardData, "flowCard">;

const ctaGlyph = (
  <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true" focusable="false">
    <path d="M8 1.5 10 6l4.5.5-3.3 3.1.9 4.4L8 11.9 3.9 14l.9-4.4L1.5 6.5 6 6Z" fill="currentColor" />
  </svg>
);

function FlowCard({ data }: NodeProps<CardNode>) {
  return (
    <div className="flow-canvas-card" data-root={data.isRoot || undefined} data-cta={data.isCta || undefined}
      data-terminal={data.isTerminal || undefined} data-warned={data.warningLabels.length ? true : undefined}>
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <p className="flow-canvas-card-type">{data.typeLabel}</p>
      <strong className="flow-canvas-card-title">{data.title}</strong>
      <div className="flow-canvas-card-badges">
        {data.isRoot ? <span className="flow-canvas-badge is-root">{data.rootLabel}</span> : null}
        {data.isCta ? <span className="flow-canvas-badge is-cta">{ctaGlyph}{data.ctaLabel}</span> : null}
        {data.isTerminal && !data.isCta ? <span className="flow-canvas-badge is-terminal">{data.terminalLabel}</span> : null}
        {data.warningLabels.map((label) => <span className="flow-canvas-badge is-warning" key={label}>{label}</span>)}
      </div>
      <Handle type="source" position={Position.Right} isConnectable={false} />
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

export function FlowCanvas(props: Readonly<{ definition: unknown; locale: OnboardingLocale; invalidDefinition?: boolean }>) {
  const copy = flowCanvasCopy(props.locale);
  const model = useMemo(() => buildFlowCanvasModel(props.definition, props.locale), [props.definition, props.locale]);
  const [instance, setInstance] = useState<ReactFlowInstance<CardNode, Edge> | null>(null);
  // React Flow measures the DOM, so it is mounted only in the browser. This keeps the route
  // prerenderable and hydration deterministic.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const nodes: CardNode[] = useMemo(() => model.nodes.map((node: FlowCanvasNode) => ({
    id: node.id, type: "flowCard" as const, position: { x: node.position.x, y: node.position.y },
    width: flowCanvasNodeSize.width, height: flowCanvasNodeSize.height,
    data: {
      title: node.title, typeLabel: node.typeLabel,
      isRoot: node.isRoot, isCta: node.isCta, isTerminal: node.isTerminal,
      rootLabel: copy.rootBadge, ctaLabel: copy.ctaBadge, terminalLabel: copy.terminalBadge,
      warningLabels: node.warnings.map((code) => copy[code]),
    },
  })), [model, copy]);

  const edges: Edge[] = useMemo(() => model.edges.map((edge) => ({
    id: edge.id, source: edge.source, target: edge.target, label: edge.label,
    type: "smoothstep", className: `flow-canvas-edge is-${edge.kind}`,
    labelShowBg: true, labelBgPadding: [6, 3] as [number, number], labelBgBorderRadius: 4,
  })), [model]);

  function revealNode(nodeId: string) {
    void instance?.fitView({ nodes: [{ id: nodeId }], duration: 320, maxZoom: 1.1, padding: 0.6 });
  }

  return (
    <div className="flow-canvas-shell">
      <p className="field-help">{copy.readOnlyNotice}</p>
      {props.invalidDefinition ? <p className="inline-message error" role="alert">{copy.invalidDefinition}</p> : null}
      <div className="flow-canvas" role="group" aria-label={copy.canvasLabel}>
        {mounted ? (
          <ReactFlow<CardNode, Edge>
            nodes={nodes} edges={edges} nodeTypes={nodeTypes} onInit={setInstance}
            fitView nodesDraggable={false} nodesConnectable={false} elementsSelectable={false}
            zoomOnDoubleClick={false} minZoom={0.15} proOptions={{ hideAttribution: false }}
          >
            <Background gap={22} />
            <MiniMap pannable zoomable nodeClassName={minimapClassName} ariaLabel={copy.minimapLabel} />
            <Controls showInteractive={false} />
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
