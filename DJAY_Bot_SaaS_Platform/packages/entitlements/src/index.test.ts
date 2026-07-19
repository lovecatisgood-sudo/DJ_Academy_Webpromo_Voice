import { planDefinitions } from "@djay/catalog";
import { describe, expect, it } from "vitest";
import {
  entitlementValue, evaluateResourceBoundaries, permits, requireEntitlement,
  resolveEntitlements, selectRetainedResources,
} from "./index";

function snapshot(planKey: keyof typeof planDefinitions, state: "active" | "past_due" = "active") {
  return resolveEntitlements({
    tenantId: "tenant-a", subscriptionId: "subscription-a", planVersionId: `version-${planKey}`,
    state, plan: planDefinitions[planKey], now: new Date("2026-07-14T00:00:00Z"),
  });
}

describe("generated six-plan entitlement matrix", () => {
  it.each([
    ["flowbot_basic", "flow.nodes.advanced", false],
    ["flowbot_premium", "flow.nodes.advanced", true],
    ["ai_chat_basic", "channel.line", false],
    ["ai_chat_premium", "channel.line", true],
    ["voice_basic_gen1", "voice.enabled", true],
    ["voice_advanced_gen2", "voice.advanced_quality", true],
  ] as const)("resolves %s / %s", (planKey, key, expected) => {
    expect(permits(snapshot(planKey), key)).toBe(expected);
  });

  it("does not let a caller request a different plan through an entitlement key", () => {
    const basic = snapshot("ai_chat_basic");
    expect(() => requireEntitlement(basic, "channel.whatsapp")).toThrow("does not permit");
    expect(entitlementValue(basic, "channel.whatsapp")).toBe(false);
  });

  it("blocks new work when the subscription is past due", () => {
    expect(permits(snapshot("ai_chat_premium", "past_due"), "channel.line")).toBe(false);
  });

  it("applies only effective, unexpired approved overrides", () => {
    const resolved = resolveEntitlements({
      tenantId: "tenant-a", subscriptionId: "subscription-a", planVersionId: "version-a",
      state: "active", plan: planDefinitions.flowbot_basic, now: new Date("2026-07-14T00:00:00Z"),
      overrides: [
        { key: "flow.team_routing", value: true, effectiveFrom: new Date("2026-07-01"), expiresAt: null },
        { key: "flow.webhook", value: true, effectiveFrom: new Date("2026-08-01"), expiresAt: null },
      ],
    });
    expect(entitlementValue(resolved, "flow.team_routing")).toBe(true);
    expect(entitlementValue(resolved, "flow.webhook")).toBe(false);
  });
});

describe("contract resource boundaries", () => {
  it("reports only actual excess and treats null as commercially unlimited", () => {
    expect(evaluateResourceBoundaries(
      { active_bots: 1, knowledge_collections: null, social_channels: 0 },
      { active_bots: 3, knowledge_collections: 9, social_channels: 1 },
    )).toEqual([
      { key: "active_bots", used: 3, limit: 1, excess: 2 },
      { key: "social_channels", used: 1, limit: 0, excess: 1 },
      { key: "knowledge_collections", used: 9, limit: null, excess: 0 },
    ]);
  });

  it("requires an exact retained selection and preserves excess data for restoration", () => {
    expect(selectRetainedResources(["a", "b", "c"], 1, ["b"])).toEqual({
      retained: ["b"], excess: ["a", "c"],
    });
    expect(() => selectRetainedResources(["a", "b", "c"], 1, [])).toThrowError(
      expect.objectContaining({ code: "invalid_retained_resource_selection" }),
    );
    expect(selectRetainedResources(["a"], null, [])).toEqual({ retained: ["a"], excess: [] });
  });
});
