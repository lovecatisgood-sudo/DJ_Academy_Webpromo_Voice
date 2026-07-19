import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { countFlowTopics, flowbotDowngradeBlockers, flowNodeSchema, isWithinFlowBusinessSchedule, validateFlowForPublish, type FlowEntitlements, type FlowSnapshot } from "./index";

const root = randomUUID();
const premium = randomUUID();
const snapshot: FlowSnapshot = { schemaVersion: 1, flowVersionId: randomUUID(), rootNodeId: root, keywords: [], nodes: {
  [root]: { id: root, type: "message", title: "Welcome", content: { th: "สวัสดี", en: "Welcome" }, nextNodeId: premium },
  [premium]: { id: premium, type: "delay", title: "Wait", delaySeconds: 60, nextNodeId: root },
} };
const basic: FlowEntitlements = { planKey: "flowbot_basic", accessMode: "active", entitlements: { "ai.enabled": false, "flow.nodes.advanced": false, "flow.webhook": false, "flow.team_routing": "limited", "branding.remove": false }, limits: { active_bots: 1, flow_nodes_per_bot: 100 } };
const premiumAuthority: FlowEntitlements = { planKey: "flowbot_premium", accessMode: "active", entitlements: { "ai.enabled": false, "flow.nodes.advanced": true, "flow.delays": true, "flow.webhook": "approved", "flow.team_routing": true, "branding.remove": true }, limits: { active_bots: 5, flow_nodes_per_bot: 500 } };

describe("FlowBot plan validation", () => {
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
