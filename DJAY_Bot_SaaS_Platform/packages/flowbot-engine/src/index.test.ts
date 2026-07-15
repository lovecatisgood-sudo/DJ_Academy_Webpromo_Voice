import { randomUUID } from "node:crypto";
import type { FlowEngineRequest } from "./index";
import { advanceFlow } from "./index";
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
});
