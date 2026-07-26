import { flowEdgeKinds, flowNodeTypes } from "@djay/flowbot-domain";
import { describe, expect, it } from "vitest";
import { flowCanvasCopy } from "../../../lib/i18n/flow-canvas";
import { buildFlowCanvasModel } from "./flow-canvas-model";

const id = (label: string) => `00000000-0000-4000-8000-0000000000${label}`;
const menu = id("01"); const buy = id("02"); const thanks = id("03"); const info = id("04"); const bye = id("05");
const orphan = id("06"); const hours = id("07"); const closed = id("08"); const back = id("09");

const branching = {
  schemaVersion: 1, flowVersionId: id("99"), rootNodeId: menu, keywords: [],
  nodes: {
    [menu]: { id: menu, type: "options", title: "Main menu", prompt: { th: "เลือก", en: "Choose" }, options: [
      { id: id("11"), label: { th: "ซื้อสินค้า", en: "Buy" }, targetNodeId: buy },
      { id: id("12"), label: { th: "สอบถามข้อมูล", en: "Ask a question" }, targetNodeId: info },
    ] },
    [buy]: { id: buy, type: "actions", title: "Checkout", actions: [{ type: "checkout", label: { th: "ชำระเงิน", en: "Checkout" }, url: "https://checkout.example.test/order" }], nextNodeId: thanks },
    [thanks]: { id: thanks, type: "end", title: "Thanks", message: { th: "ขอบคุณ", en: "Thanks" } },
    [info]: { id: info, type: "business_hours", title: "Hours", timezone: "Asia/Bangkok", scheduleKey: "sales", openNodeId: bye, closedNodeId: closed },
    [bye]: { id: bye, type: "end", title: "Goodbye", message: { th: "บาย", en: "Bye" } },
    [closed]: { id: closed, type: "message", title: "Closed", content: { th: "ปิดแล้ว", en: "Closed" }, nextNodeId: back },
    [back]: { id: back, type: "jump", title: "Back to menu", targetNodeId: menu },
    [orphan]: { id: orphan, type: "end", title: "Orphan", message: { th: "ลอย", en: "Orphan" } },
    [hours]: { id: hours, type: "webhook", title: "Notify", integrationProfileId: id("13"), templateKey: "lead_captured", nextNodeId: thanks, failureNodeId: bye },
  },
};

const nodeById = (model: ReturnType<typeof buildFlowCanvasModel>, nodeId: string) => model.nodes.find((node) => node.id === nodeId)!;
const edgeLabels = (model: ReturnType<typeof buildFlowCanvasModel>, source: string) =>
  model.edges.filter((item) => item.source === source).map((item) => `${item.kind}:${item.label}`);

describe("FlowBot canvas model", () => {
  it("labels every branch it draws, in the requested locale", () => {
    const th = buildFlowCanvasModel(branching, "th");
    const en = buildFlowCanvasModel(branching, "en");
    expect(edgeLabels(th, menu)).toEqual(["option:ซื้อสินค้า", "option:สอบถามข้อมูล"]);
    expect(edgeLabels(en, menu)).toEqual(["option:Buy", "option:Ask a question"]);
    expect(edgeLabels(en, info)).toEqual(["open:Open hours", "closed:Closed hours"]);
    expect(edgeLabels(th, info)).toEqual(["open:เวลาทำการ", "closed:นอกเวลาทำการ"]);
    expect(edgeLabels(en, hours)).toEqual(["next:Next", "failure:On failure"]);
    expect(edgeLabels(en, back)).toEqual(["jump:Jumps to"]);
    expect(en.edges.every((item) => item.label.trim().length > 0)).toBe(true);
    expect(th.edges.every((item) => item.label.trim().length > 0)).toBe(true);
  });

  it("draws exactly the edges the domain reports and no others", () => {
    const model = buildFlowCanvasModel(branching, "en");
    expect(model.edges.map((item) => `${item.source}->${item.target}`).sort()).toEqual([
      `${back}->${menu}`, `${buy}->${thanks}`, `${closed}->${back}`, `${hours}->${bye}`, `${hours}->${thanks}`,
      `${info}->${bye}`, `${info}->${closed}`, `${menu}->${buy}`, `${menu}->${info}`,
    ].sort());
    expect(new Set(model.edges.map((item) => item.id)).size).toBe(model.edges.length);
  });

  it("does not draw an edge to a node that is not in the flow", () => {
    const missing = id("77");
    const dangling = { rootNodeId: menu, keywords: [], nodes: {
      [menu]: { id: menu, type: "message", title: "Welcome", content: { th: "สวัสดี", en: "Welcome" }, nextNodeId: missing },
      [buy]: { id: buy, type: "message", title: "Second", content: { th: "สอง", en: "Second" }, nextNodeId: menu },
    } };
    const model = buildFlowCanvasModel(dangling, "en");
    // The broken edge is a publish blocker (`target_node_missing`), not a drawable connection: a
    // phantom line to nowhere would be worse for a merchant than no line at all.
    expect(model.edges.map((edge) => edge.target)).toEqual([menu]);
    expect(model.edges.some((edge) => edge.target === missing)).toBe(false);
  });

  it("marks the entry point, CTA nodes and endings", () => {
    const model = buildFlowCanvasModel(branching, "en");
    expect(nodeById(model, menu).isRoot).toBe(true);
    expect(nodeById(model, buy).isCta).toBe(true);
    expect(nodeById(model, buy).isTerminal).toBe(false);
    expect(nodeById(model, thanks).isCta).toBe(false);
    expect(nodeById(model, thanks).isTerminal).toBe(true);
    expect(nodeById(model, menu).isTerminal).toBe(false);
    expect(model.nodes.filter((node) => node.isCta).map((node) => node.id)).toEqual([buy]);
  });

  it("attaches domain advisories to the nodes they belong to", () => {
    const model = buildFlowCanvasModel(branching, "en");
    expect(nodeById(model, orphan).warnings).toEqual(["unreachable_node"]);
    expect(nodeById(model, hours).warnings).toEqual(["unreachable_node"]);
    expect(nodeById(model, menu).warnings).toEqual(["cycle_detected"]);
    expect(nodeById(model, bye).warnings).toEqual(["path_without_cta"]);
    expect(nodeById(model, thanks).warnings).toEqual([]);
    expect(model.warnings.map((item) => item.code)).toEqual(["unreachable_node", "unreachable_node", "cycle_detected", "path_without_cta"]);
    expect(model.warnings.find((item) => item.nodeId === bye)).toMatchObject({ label: "Path without a CTA", nodeTitle: "Goodbye" });
  });

  it("keeps a keyword entry point out of the unreachable list and lints it as an entry path", () => {
    const withKeyword = { ...branching, keywords: [{ id: id("21"), nodeId: orphan, keyword: "help", lang: "en", priority: 100, substringEnabled: true, order: 0 }] };
    const model = buildFlowCanvasModel(withKeyword, "en");
    // A keyword target is a real entry point, so it stops being unreachable — and this one is an
    // `end` node, so the CTA lint now legitimately reaches it as a terminal path with no CTA.
    expect(nodeById(model, orphan).warnings).toEqual(["path_without_cta"]);
    expect(nodeById(model, hours).warnings).toEqual(["unreachable_node"]);
  });

  it("lays every node out at a distinct position without stored coordinates", () => {
    const model = buildFlowCanvasModel(branching, "en");
    expect(model.nodes).toHaveLength(9);
    const positions = model.nodes.map((node) => `${node.position.x},${node.position.y}`);
    expect(new Set(positions).size).toBe(positions.length);
    expect(model.nodes.every((node) => Number.isFinite(node.position.x) && Number.isFinite(node.position.y))).toBe(true);
    // Left-to-right ranking: a node's successor sits further right than the node itself.
    expect(nodeById(model, buy).position.x).toBeGreaterThan(nodeById(model, menu).position.x);
    expect(nodeById(model, thanks).position.x).toBeGreaterThan(nodeById(model, buy).position.x);
  });

  it("survives a malformed or empty definition without throwing", () => {
    for (const malformed of [undefined, null, {}, [], "definition", { nodes: null }, { rootNodeId: menu, nodes: [] },
      { rootNodeId: 7, nodes: { [menu]: null } }, { rootNodeId: menu, nodes: { [menu]: { id: menu, type: "options" } } },
      { rootNodeId: menu, nodes: { [menu]: { id: menu, type: "message", nextNodeId: menu } }, keywords: [null] }]) {
      const model = buildFlowCanvasModel(malformed, "th");
      expect(Array.isArray(model.nodes)).toBe(true);
      expect(Array.isArray(model.edges)).toBe(true);
    }
    expect(buildFlowCanvasModel({}, "th").nodes).toEqual([]);
    expect(buildFlowCanvasModel({ rootNodeId: menu, nodes: { [menu]: { id: menu, type: "options" } } }, "th").nodes).toHaveLength(1);
  });

  it("titles nodes that have no readable title", () => {
    const model = buildFlowCanvasModel({ rootNodeId: menu, nodes: { [menu]: { id: menu, type: "message", nextNodeId: null } } }, "en");
    expect(nodeById(model, menu).title).toBe("Message");
    expect(nodeById(model, menu).typeLabel).toBe("Message");
  });
});

describe("FlowBot canvas copy", () => {
  it("covers every node type and every edge kind the domain can emit", () => {
    for (const locale of ["th", "en"] as const) {
      const copy = flowCanvasCopy(locale);
      for (const type of flowNodeTypes) expect(copy[`node_${type}`], `${locale}:node_${type}`).toBeTruthy();
      for (const kind of flowEdgeKinds) expect(copy[`edge_${kind}`], `${locale}:edge_${kind}`).toBeTruthy();
      for (const code of ["unreachable_node", "cycle_detected", "path_without_cta"] as const) {
        expect(copy[code], `${locale}:${code}`).toBeTruthy();
        expect(copy[`${code}_detail`], `${locale}:${code}_detail`).toBeTruthy();
      }
    }
  });

  it("keeps Thai and English keys in step and defaults to Thai", () => {
    expect(Object.keys(flowCanvasCopy("th")).sort()).toEqual(Object.keys(flowCanvasCopy("en")).sort());
    expect(flowCanvasCopy("th").ctaBadge).toBe("CTA");
    expect(flowCanvasCopy("en").title).toBe("Conversation map");
    expect(flowCanvasCopy(undefined as never).title).toBe(flowCanvasCopy("th").title);
  });
});
