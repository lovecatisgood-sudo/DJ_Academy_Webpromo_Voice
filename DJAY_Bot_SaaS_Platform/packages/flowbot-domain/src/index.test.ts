import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { countFlowTopics, flowbotDowngradeBlockers, flowCtaNodeTypes, flowGraphAdvisories, flowNodeEdges, flowNodeSchema, flowNodeTypes, flowSnapshotSchema, isWithinFlowBusinessSchedule, validateFlowForPublish, type FlowEntitlements, type FlowNode, type FlowNodeType, type FlowSnapshot } from "./index";

const root = randomUUID();
const premium = randomUUID();
const snapshot: FlowSnapshot = { schemaVersion: 1, flowVersionId: randomUUID(), rootNodeId: root, keywords: [], nodes: {
  [root]: { id: root, type: "message", title: "Welcome", content: { th: "สวัสดี", en: "Welcome" }, nextNodeId: premium },
  [premium]: { id: premium, type: "delay", title: "Wait", delaySeconds: 60, nextNodeId: root },
} };
const basic: FlowEntitlements = { planKey: "flowbot_basic", accessMode: "active", entitlements: { "ai.enabled": false, "flow.nodes.advanced": false, "flow.webhook": false, "flow.team_routing": "limited", "branding.remove": false }, limits: { active_bots: 1, flow_nodes_per_bot: 100 } };
const premiumAuthority: FlowEntitlements = { planKey: "flowbot_premium", accessMode: "active", entitlements: { "ai.enabled": false, "flow.nodes.advanced": true, "flow.delays": true, "flow.webhook": "approved", "flow.team_routing": true, "branding.remove": true }, limits: { active_bots: 5, flow_nodes_per_bot: 500 } };

describe("FlowBot plan validation", () => {
  it("accepts bounded editor positions without changing the runtime graph", () => {
    const positioned = { ...snapshot, editor: { positions: { [root]: { x: 120, y: -40 } } } };
    expect(flowSnapshotSchema.safeParse(positioned).success).toBe(true);
    expect(flowNodeEdges(positioned.nodes[root]!)).toEqual([{ targetNodeId: premium, kind: "next" }]);
    expect(flowSnapshotSchema.safeParse({ ...positioned, editor: { positions: { [root]: { x: Number.POSITIVE_INFINITY, y: 0 } } } }).success).toBe(false);
  });
  it("rejects Premium nodes for Basic and accepts them for Premium", () => {
    expect(validateFlowForPublish(snapshot, basic)).toContainEqual({ code: "premium_node_not_entitled", nodeId: premium, detail: "delay" });
    expect(validateFlowForPublish(snapshot, premiumAuthority)).toEqual([]);
  });
  it("reports downgrade blockers without deleting definitions", () => {
    const before = structuredClone(snapshot);
    expect(flowbotDowngradeBlockers({ snapshots: [snapshot], activeBotCount: 2, brandingRemoved: true, approvedIntegrationCount: 1 }, basic).map((item) => item.code)).toEqual(["premium_node_present", "active_bot_limit_exceeded", "branding_dependency", "integration_dependency"]);
    expect(snapshot).toEqual(before);
  });
  it("fails the non-AI runtime invariant", () => {
    expect(validateFlowForPublish(snapshot, { ...premiumAuthority, entitlements: { ...premiumAuthority.entitlements, "ai.enabled": true } })).toContainEqual({ code: "non_ai_invariant_failed" });
  });
  it("requires the specific Premium capability as well as the advanced-node umbrella", () => {
    const withoutDelays = { ...premiumAuthority, entitlements: { ...premiumAuthority.entitlements, "flow.delays": false } };
    expect(validateFlowForPublish(snapshot, withoutDelays)).toContainEqual({
      code: "node_entitlement_missing", nodeId: premium, detail: "delay:flow.delays",
    });
  });

  it("evaluates tenant business windows in the configured IANA timezone and honors closures", () => {
    const schedule = {
      scheduleKey: "sales", timezone: "Asia/Bangkok",
      weeklyWindows: [{ dayOfWeek: 1, startMinute: 9 * 60, endMinute: 17 * 60 }],
      closedDates: ["2026-07-20"],
    };
    expect(isWithinFlowBusinessSchedule(schedule, "2026-07-13T03:00:00.000Z")).toBe(true);
    expect(isWithinFlowBusinessSchedule(schedule, "2026-07-13T11:00:00.000Z")).toBe(false);
    expect(isWithinFlowBusinessSchedule(schedule, "2026-07-20T03:00:00.000Z")).toBe(false);
  });

  it("accepts typed customer actions and rejects unsafe action URLs", () => {
    const valid = {
      id: randomUUID(), type: "actions", title: "Contact us",
      prompt: { th: "ติดต่อเรา", en: "Contact us" },
      actions: [
        { type: "call", label: { th: "โทร", en: "Call" }, url: "tel:+6621234567" },
        { type: "checkout", label: { th: "ชำระเงิน", en: "Checkout" }, url: "https://checkout.example.test/order" },
      ], nextNodeId: null,
    };
    expect(flowNodeSchema.safeParse(valid).success).toBe(true);
    expect(flowNodeSchema.safeParse({ ...valid, actions: [{ type: "website", label: { th: "เปิด", en: "Open" }, url: "javascript:alert(1)" }] }).success).toBe(false);
    expect(flowNodeSchema.safeParse({ ...valid, actions: [{ type: "website", label: { th: "เปิด", en: "Open" }, url: "http://example.test" }] }).success).toBe(false);
  });

  it("counts distinct entry destinations as commercial conversation topics", () => {
    const second = randomUUID();
    const topicSnapshot = { ...snapshot, keywords: [
      { id: randomUUID(), nodeId: root, keyword: "welcome", lang: "en" as const, priority: 100, substringEnabled: true, order: 0 },
      { id: randomUUID(), nodeId: second, keyword: "pricing", lang: "en" as const, priority: 100, substringEnabled: true, order: 1 },
    ] };
    expect(countFlowTopics(topicSnapshot)).toBe(2);
    expect(validateFlowForPublish(topicSnapshot, { ...premiumAuthority, limits: { ...premiumAuthority.limits, topics: 1 } })).toContainEqual({ code: "plan_topic_limit_exceeded", detail: "2/1" });
  });
});

const target = randomUUID();
const alternate = randomUUID();
const optionLabel = { th: "เมนูหลัก", en: "Main menu" };
const alternateLabel = { th: "คุยกับทีม", en: "Talk to the team" };
const sampleCard = { id: randomUUID(), kind: "product" as const, title: { th: "สินค้า", en: "Product" }, description: { th: "รายละเอียด", en: "Details" }, actions: [] };
const nodeOfEveryType: Readonly<Record<FlowNodeType, FlowNode>> = {
  message: { id: randomUUID(), type: "message", title: "Message", content: { th: "ข้อความ", en: "Message" }, nextNodeId: target },
  media_reference: { id: randomUUID(), type: "media_reference", title: "Media", assetRef: "https://assets.example.test/a.png", mediaType: "image", label: { th: "รูป", en: "Image" }, nextNodeId: target },
  product_card: { id: randomUUID(), type: "product_card", title: "Card", card: sampleCard, nextNodeId: target },
  carousel: { id: randomUUID(), type: "carousel", title: "Carousel", cards: [sampleCard], nextNodeId: target },
  actions: { id: randomUUID(), type: "actions", title: "Actions", actions: [{ type: "call", label: { th: "โทร", en: "Call" }, url: "tel:+6621234567" }], nextNodeId: target },
  options: { id: randomUUID(), type: "options", title: "Options", prompt: { th: "เลือก", en: "Choose" }, options: [{ id: randomUUID(), label: optionLabel, targetNodeId: target }, { id: randomUUID(), label: alternateLabel, targetNodeId: alternate }] },
  input_capture: { id: randomUUID(), type: "input_capture", title: "Capture", prompt: { th: "ชื่อ", en: "Name" }, variableKey: "customer_name", nextNodeId: target },
  form: { id: randomUUID(), type: "form", title: "Form", prompt: { th: "กรอกข้อมูล", en: "Fill in" }, fields: [{ key: "name", label: { th: "ชื่อ", en: "Name" }, type: "text", required: true }], nextNodeId: target },
  condition: { id: randomUUID(), type: "condition", title: "Condition", variableKey: "customer_name", operator: "exists", trueNodeId: target, falseNodeId: alternate },
  jump: { id: randomUUID(), type: "jump", title: "Jump", targetNodeId: target },
  end: { id: randomUUID(), type: "end", title: "End", message: { th: "จบ", en: "Done" } },
  advanced_condition: { id: randomUUID(), type: "advanced_condition", title: "Advanced", mode: "all", clauses: [{ variableKey: "customer_name", operator: "exists" }], trueNodeId: target, falseNodeId: alternate },
  variable_set: { id: randomUUID(), type: "variable_set", title: "Set", variableKey: "stage", valueTemplate: "qualified", nextNodeId: target },
  delay: { id: randomUUID(), type: "delay", title: "Delay", delaySeconds: 60, nextNodeId: target },
  subflow: { id: randomUUID(), type: "subflow", title: "Subflow", targetFlowVersionId: randomUUID(), returnNodeId: target },
  business_hours: { id: randomUUID(), type: "business_hours", title: "Hours", timezone: "Asia/Bangkok", scheduleKey: "sales", openNodeId: target, closedNodeId: alternate },
  team_route: { id: randomUUID(), type: "team_route", title: "Route", teamKey: "sales", strategy: "owner" },
  webhook: { id: randomUUID(), type: "webhook", title: "Webhook", integrationProfileId: randomUUID(), templateKey: "order_created", nextNodeId: target, failureNodeId: alternate },
};

describe("FlowBot labelled edge model", () => {
  it("covers every declared node type with a schema-valid fixture", () => {
    expect(Object.keys(nodeOfEveryType).sort()).toEqual([...flowNodeTypes].sort());
    for (const node of Object.values(nodeOfEveryType)) expect(flowNodeSchema.safeParse(node).success).toBe(true);
  });

  it("labels the outgoing edges of every node type", () => {
    const next = [{ targetNodeId: target, kind: "next" }];
    expect(flowNodeEdges(nodeOfEveryType.message)).toEqual(next);
    expect(flowNodeEdges(nodeOfEveryType.media_reference)).toEqual(next);
    expect(flowNodeEdges(nodeOfEveryType.product_card)).toEqual(next);
    expect(flowNodeEdges(nodeOfEveryType.carousel)).toEqual(next);
    expect(flowNodeEdges(nodeOfEveryType.actions)).toEqual(next);
    expect(flowNodeEdges(nodeOfEveryType.form)).toEqual(next);
    expect(flowNodeEdges(nodeOfEveryType.input_capture)).toEqual(next);
    expect(flowNodeEdges(nodeOfEveryType.variable_set)).toEqual(next);
    expect(flowNodeEdges(nodeOfEveryType.delay)).toEqual(next);
    expect(flowNodeEdges(nodeOfEveryType.options)).toEqual([
      { targetNodeId: target, kind: "option", label: optionLabel },
      { targetNodeId: alternate, kind: "option", label: alternateLabel },
    ]);
    expect(flowNodeEdges(nodeOfEveryType.condition)).toEqual([{ targetNodeId: target, kind: "true" }, { targetNodeId: alternate, kind: "false" }]);
    expect(flowNodeEdges(nodeOfEveryType.advanced_condition)).toEqual([{ targetNodeId: target, kind: "true" }, { targetNodeId: alternate, kind: "false" }]);
    expect(flowNodeEdges(nodeOfEveryType.business_hours)).toEqual([{ targetNodeId: target, kind: "open" }, { targetNodeId: alternate, kind: "closed" }]);
    expect(flowNodeEdges(nodeOfEveryType.webhook)).toEqual([{ targetNodeId: target, kind: "next" }, { targetNodeId: alternate, kind: "failure" }]);
    expect(flowNodeEdges(nodeOfEveryType.jump)).toEqual([{ targetNodeId: target, kind: "jump" }]);
    expect(flowNodeEdges(nodeOfEveryType.subflow)).toEqual([{ targetNodeId: target, kind: "subflow_return" }]);
    expect(flowNodeEdges(nodeOfEveryType.end)).toEqual([]);
    expect(flowNodeEdges(nodeOfEveryType.team_route)).toEqual([]);
  });

  it("treats optional and absent transitions as no edge", () => {
    expect(flowNodeEdges({ ...nodeOfEveryType.message, nextNodeId: null } as FlowNode)).toEqual([]);
    expect(flowNodeEdges({ ...nodeOfEveryType.subflow, returnNodeId: null } as FlowNode)).toEqual([]);
    expect(flowNodeEdges({ id: randomUUID(), type: "unknown_future_node", title: "Unknown" } as unknown as FlowNode)).toEqual([]);
  });

  it("exposes the CTA node types as a reviewable constant", () => {
    expect([...flowCtaNodeTypes]).toEqual(["actions", "form", "team_route"]);
    expect(flowCtaNodeTypes).not.toContain("end");
    expect(flowCtaNodeTypes).not.toContain("input_capture");
  });
});

describe("FlowBot graph validation", () => {
  const graphAuthority = premiumAuthority;
  const codesFor = (issues: readonly { code: string }[]) => issues.map((issue) => issue.code);
  const buildSnapshot = (rootNodeId: string, nodes: Readonly<Record<string, FlowNode>>, keywords: FlowSnapshot["keywords"] = []): FlowSnapshot =>
    ({ schemaVersion: 1, flowVersionId: randomUUID(), rootNodeId, nodes, keywords });

  it("reports a subflow returning to a node that does not exist", () => {
    const entry = randomUUID(); const subflowNode = randomUUID(); const missing = randomUUID();
    const broken = buildSnapshot(entry, {
      [entry]: { id: entry, type: "message", title: "Welcome", content: { th: "สวัสดี", en: "Welcome" }, nextNodeId: subflowNode },
      [subflowNode]: { id: subflowNode, type: "subflow", title: "Reuse", targetFlowVersionId: randomUUID(), returnNodeId: missing },
    });
    expect(validateFlowForPublish(broken, graphAuthority)).toContainEqual({ code: "target_node_missing", nodeId: subflowNode, detail: missing });
    const returning = buildSnapshot(entry, {
      [entry]: { id: entry, type: "message", title: "Welcome", content: { th: "สวัสดี", en: "Welcome" }, nextNodeId: subflowNode },
      [subflowNode]: { id: subflowNode, type: "subflow", title: "Reuse", targetFlowVersionId: randomUUID(), returnNodeId: entry },
    });
    expect(codesFor(validateFlowForPublish(returning, graphAuthority))).not.toContain("target_node_missing");
  });

  it("reports nodes unreachable from the root while honouring keyword entry points", () => {
    const entry = randomUUID(); const orphan = randomUUID(); const keywordEntry = randomUUID();
    const nodes: Record<string, FlowNode> = {
      [entry]: { id: entry, type: "end", title: "Welcome", message: { th: "สวัสดี", en: "Welcome" } },
      [orphan]: { id: orphan, type: "end", title: "Orphan", message: { th: "ลอย", en: "Orphan" } },
      [keywordEntry]: { id: keywordEntry, type: "end", title: "Pricing", message: { th: "ราคา", en: "Pricing" } },
    };
    const withKeyword = buildSnapshot(entry, nodes, [{ id: randomUUID(), nodeId: keywordEntry, keyword: "pricing", lang: "en", priority: 100, substringEnabled: true, order: 0 }]);
    const advisories = flowGraphAdvisories(withKeyword);
    expect(advisories).toContainEqual({ code: "unreachable_node", nodeId: orphan, detail: "end", severity: "warning" });
    expect(advisories.filter((issue) => issue.code === "unreachable_node").map((issue) => issue.nodeId)).toEqual([orphan]);
    expect(codesFor(validateFlowForPublish(withKeyword, graphAuthority))).not.toContain("unreachable_node");
  });

  it("reports a reachable cycle entry once without blocking publish", () => {
    const advisories = flowGraphAdvisories(snapshot);
    expect(advisories.filter((issue) => issue.code === "cycle_detected")).toEqual([{ code: "cycle_detected", nodeId: root, detail: "message", severity: "warning" }]);
    expect(validateFlowForPublish(snapshot, premiumAuthority)).toEqual([]);
    const linear = randomUUID(); const done = randomUUID();
    const acyclic = buildSnapshot(linear, {
      [linear]: { id: linear, type: "message", title: "Welcome", content: { th: "สวัสดี", en: "Welcome" }, nextNodeId: done },
      [done]: { id: done, type: "end", title: "End", message: { th: "จบ", en: "Done" } },
    });
    expect(codesFor(flowGraphAdvisories(acyclic))).not.toContain("cycle_detected");
  });

  it("reports only the terminal paths that never reach a CTA", () => {
    const menu = randomUUID(); const cta = randomUUID(); const afterCta = randomUUID(); const chat = randomUUID(); const deadEnd = randomUUID();
    const branching = buildSnapshot(menu, {
      [menu]: { id: menu, type: "options", title: "Menu", prompt: { th: "เลือก", en: "Choose" }, options: [
        { id: randomUUID(), label: { th: "ซื้อ", en: "Buy" }, targetNodeId: cta },
        { id: randomUUID(), label: { th: "ข้อมูล", en: "Info" }, targetNodeId: chat },
      ] },
      [cta]: { id: cta, type: "actions", title: "Buy now", actions: [{ type: "checkout", label: { th: "ชำระเงิน", en: "Checkout" }, url: "https://checkout.example.test/order" }], nextNodeId: afterCta },
      [afterCta]: { id: afterCta, type: "end", title: "Thanks", message: { th: "ขอบคุณ", en: "Thanks" } },
      [chat]: { id: chat, type: "message", title: "Info", content: { th: "ข้อมูล", en: "Info" }, nextNodeId: deadEnd },
      [deadEnd]: { id: deadEnd, type: "end", title: "Bye", message: { th: "บาย", en: "Bye" } },
    });
    const advisories = flowGraphAdvisories(branching);
    expect(advisories.filter((issue) => issue.code === "path_without_cta")).toEqual([{ code: "path_without_cta", nodeId: deadEnd, detail: "end", severity: "warning" }]);
    expect(codesFor(validateFlowForPublish(branching, graphAuthority))).not.toContain("path_without_cta");
  });

  it("treats a terminal team_route or form path as carrying a CTA", () => {
    const menu = randomUUID(); const handover = randomUUID(); const lead = randomUUID(); const thanks = randomUUID();
    const covered = buildSnapshot(menu, {
      [menu]: { id: menu, type: "options", title: "Menu", prompt: { th: "เลือก", en: "Choose" }, options: [
        { id: randomUUID(), label: { th: "คุยกับทีม", en: "Team" }, targetNodeId: handover },
        { id: randomUUID(), label: { th: "ฝากข้อมูล", en: "Lead" }, targetNodeId: lead },
      ] },
      [handover]: { id: handover, type: "team_route", title: "Team", teamKey: "sales", strategy: "owner" },
      [lead]: { id: lead, type: "form", title: "Lead", prompt: { th: "กรอกข้อมูล", en: "Fill in" }, fields: [{ key: "name", label: { th: "ชื่อ", en: "Name" }, type: "text", required: true }], nextNodeId: thanks },
      [thanks]: { id: thanks, type: "end", title: "Thanks", message: { th: "ขอบคุณ", en: "Thanks" } },
    });
    expect(codesFor(flowGraphAdvisories(covered))).toEqual([]);
  });

  it("never throws on a malformed graph", () => {
    const dangling = randomUUID(); const missing = randomUUID();
    const brokenEdge = buildSnapshot(dangling, {
      [dangling]: { id: dangling, type: "message", title: "Welcome", content: { th: "สวัสดี", en: "Welcome" }, nextNodeId: missing },
    });
    expect(flowGraphAdvisories(brokenEdge)).toEqual([]);
    expect(flowGraphAdvisories(buildSnapshot(missing, {}))).toEqual([]);
    for (const malformed of [
      {}, { rootNodeId: null, nodes: null, keywords: null }, { rootNodeId: dangling, nodes: [] }, { rootNodeId: 7, nodes: { [dangling]: null } },
      { rootNodeId: dangling, nodes: { [dangling]: { id: dangling, type: "options" } } },
      { rootNodeId: dangling, nodes: { [dangling]: { id: dangling, type: "message", nextNodeId: dangling } }, keywords: [null, { nodeId: 3 }] },
    ]) expect(() => flowGraphAdvisories(malformed as never)).not.toThrow();
  });
});
