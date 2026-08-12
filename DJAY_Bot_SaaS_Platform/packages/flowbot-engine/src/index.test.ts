import { randomUUID } from "node:crypto";
import type { FlowEngineRequest } from "./index";
import { advanceFlow, simulateFlow } from "./index";
import { describe, expect, it } from "vitest";

const ids = { version: randomUUID(), root: randomUUID(), form: randomUUID(), end: randomUUID(), option: randomUUID() };
const base: FlowEngineRequest = {
  tenantId: randomUUID(), deploymentId: randomUUID(), executionId: randomUUID(), flowVersionId: ids.version,
  sequence: 1, inputId: randomUUID(), input: { type: "start", payload: {} },
  snapshot: { schemaVersion: 1, flowVersionId: ids.version, rootNodeId: ids.root, keywords: [], nodes: {
    [ids.root]: { id: ids.root, type: "options", title: "Start", prompt: { th: "เลือก", en: "Choose" }, options: [{ id: ids.option, label: { th: "ติดต่อ", en: "Contact" }, targetNodeId: ids.form }] },
    [ids.form]: { id: ids.form, type: "form", title: "Lead", prompt: { th: "ข้อมูล", en: "Details" }, fields: [{ key: "email", label: { th: "อีเมล", en: "Email" }, type: "email", required: true }], nextNodeId: ids.end },
    [ids.end]: { id: ids.end, type: "end", title: "Done", message: { th: "ขอบคุณ", en: "Thank you" } },
  } },
  state: { currentNodeId: null, status: "active", lang: "en", variables: {}, subflowStack: [] },
  authority: { planKey: "flowbot_basic", accessMode: "active", entitlements: { "ai.enabled": false, "flow.nodes.advanced": false }, limits: {} },
  environment: { now: new Date().toISOString(), isBusinessOpen: () => true },
};

describe("deterministic FlowBot engine", () => {
  it("runs an option and form lead journey with typed commands", () => {
    const started = advanceFlow(base);
    expect(started.messages[0]?.type).toBe("options");
    const selected = advanceFlow({ ...base, sequence: 2, input: { type: "option", payload: { optionId: ids.option } }, state: started.nextState });
    expect(selected.messages[0]?.type).toBe("form");
    const completed = advanceFlow({ ...base, sequence: 3, input: { type: "form", payload: { nodeId: ids.form, data: { email: "customer@example.test" } } }, state: selected.nextState });
    expect(completed.commands).toMatchObject([{ type: "lead.create" }]);
    expect(completed.nextState.status).toBe("completed");
  });
  it("resolves a social option postback deterministically", () => {
    const started = advanceFlow(base);
    const selected = advanceFlow({ ...base, sequence: 2, input: { type: "text", payload: { text: `djay_option:${ids.option}` } }, state: started.nextState });
    expect(selected.messages[0]?.type).toBe("form");
    expect(selected.events).toContainEqual(expect.objectContaining({ type: "option_selected", detail: { optionId: ids.option, source: "text" } }));
  });
  it("pins execution to the original immutable version", () => {
    expect(() => advanceFlow({ ...base, flowVersionId: randomUUID() })).toThrowError("Flow execution was rejected.");
  });
  it("never emits provider or AI commands", () => {
    const serialized = JSON.stringify(advanceFlow(base));
    expect(serialized).not.toMatch(/provider|model|openai|anthropic|gemini|gpt/i);
  });
  it("rejects a Premium node when its specific runtime capability is absent", () => {
    const delayId = randomUUID();
    const snapshot = {
      ...base.snapshot,
      rootNodeId: delayId,
      nodes: {
        ...base.snapshot.nodes,
        [delayId]: { id: delayId, type: "delay" as const, title: "Wait", delaySeconds: 30, nextNodeId: ids.end },
      },
    };
    expect(() => advanceFlow({
      ...base, snapshot, authority: {
        ...base.authority, planKey: "flowbot_premium", entitlements: { "ai.enabled": false, "flow.nodes.advanced": true, "flow.delays": false },
      },
    })).toThrowError("Flow execution was rejected.");
  });

  it("executes an immutable embedded subflow and returns to the parent graph", () => {
    const childVersion = randomUUID(); const subflowNode = randomUUID();
    const childRoot = randomUUID(); const childEnd = randomUUID(); const parentEnd = randomUUID();
    const snapshot = {
      schemaVersion: 1 as const, flowVersionId: ids.version, rootNodeId: subflowNode, keywords: [],
      nodes: {
        [subflowNode]: { id: subflowNode, type: "subflow" as const, title: "Reusable greeting", targetFlowVersionId: childVersion, returnNodeId: parentEnd },
        [parentEnd]: { id: parentEnd, type: "end" as const, title: "Parent done", message: { th: "เสร็จแล้ว", en: "Parent complete" } },
      },
      embeddedSubflows: {
        [childVersion]: {
          rootNodeId: childRoot, keywords: [], nodes: {
            [childRoot]: { id: childRoot, type: "message" as const, title: "Child greeting", content: { th: "สวัสดี", en: "Child greeting" }, nextNodeId: childEnd },
            [childEnd]: { id: childEnd, type: "end" as const, title: "Child done" },
          },
        },
      },
    };
    const result = advanceFlow({
      ...base,
      snapshot,
      authority: {
        ...base.authority,
        planKey: "flowbot_premium",
        entitlements: { "ai.enabled": false, "flow.nodes.advanced": true, "flow.subflows": true },
      },
    });
    expect(result.messages.map((message) => message.content.text)).toEqual(["Child greeting", "Parent complete"]);
    expect(result.events.map((event) => event.type)).toContain("subflow_completed");
    expect(result.nextState).toMatchObject({ status: "completed", subflowStack: [] });
  });

  it("emits localized rich media, cards, carousels, and typed actions deterministically", () => {
    const media = randomUUID(); const card = randomUUID(); const carousel = randomUUID(); const actions = randomUUID();
    const richSnapshot = {
      schemaVersion: 1 as const, flowVersionId: ids.version, rootNodeId: media, keywords: [], nodes: {
        [media]: { id: media, type: "media_reference" as const, title: "Photo", assetRef: "https://cdn.example.test/photo.jpg", mediaType: "image" as const, label: { th: "ภาพ", en: "Photo" }, nextNodeId: card },
        [card]: { id: card, type: "product_card" as const, title: "Product", card: { id: randomUUID(), kind: "product" as const, title: { th: "สินค้า", en: "Product" }, description: { th: "รายละเอียด", en: "Details" }, priceLabel: { th: "฿100", en: "THB 100" }, actions: [{ type: "website" as const, label: { th: "ดู", en: "View" }, url: "https://example.test/product" }] }, nextNodeId: carousel },
        [carousel]: { id: carousel, type: "carousel" as const, title: "Services", cards: [{ id: randomUUID(), kind: "service" as const, title: { th: "บริการ", en: "Service" }, description: { th: "รายละเอียด", en: "Details" }, actions: [] }], nextNodeId: actions },
        [actions]: { id: actions, type: "actions" as const, title: "Actions", actions: [{ type: "call" as const, label: { th: "โทร", en: "Call" }, url: "tel:+6621234567" }], nextNodeId: ids.end },
        [ids.end]: base.snapshot.nodes[ids.end]!,
      },
    };
    const result = advanceFlow({ ...base, snapshot: richSnapshot });
    expect(result.messages.map((message) => message.type)).toEqual(["media", "card", "carousel", "actions", "text"]);
    expect(result.messages[1]?.content).toMatchObject({ title: "Product", priceLabel: "THB 100", actions: [{ type: "website", label: "View" }] });
    expect(result.nextState.status).toBe("completed");
  });

  it("simulates from a selected node without dispatching or persisting commands", () => {
    const simulation = simulateFlow({
      snapshot: base.snapshot, authority: base.authority, language: "en",
      startNodeId: ids.form, inputs: [{ type: "form", payload: { nodeId: ids.form, data: { email: "customer@example.test" } } }],
      businessOpen: true, now: "2026-08-11T00:00:00.000Z",
    });
    expect(simulation.turns).toHaveLength(2);
    expect(simulation.turns[0]?.result.messages[0]?.type).toBe("form");
    expect(simulation.turns[1]?.result.commands).toMatchObject([{ type: "lead.create" }]);
    expect(simulation.finalState.status).toBe("completed");
  });

  it("rejects an unknown simulation start node", () => {
    expect(() => simulateFlow({
      snapshot: base.snapshot, authority: base.authority, language: "en",
      startNodeId: randomUUID(), inputs: [], businessOpen: true, now: "2026-08-11T00:00:00.000Z",
    })).toThrowError("Flow execution was rejected.");
  });
});
