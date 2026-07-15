import { describe, expect, it } from "vitest";
import { planDefinitions, planForSelection, plansForProduct, publicCatalog } from "./index";

describe("six-plan catalog", () => {
  it("contains exactly two tiers for each of three products", () => {
    expect(Object.keys(planDefinitions)).toHaveLength(6);
    expect(plansForProduct("flowbot")).toHaveLength(2);
    expect(plansForProduct("ai_chat")).toHaveLength(2);
    expect(plansForProduct("voice")).toHaveLength(2);
  });

  it("keeps unapproved commercial numbers non-sellable", () => {
    for (const plan of Object.values(planDefinitions)) {
      expect(plan.sellable).toBe(false);
      expect(plan.recurringAmountMinor).toBeNull();
      expect(Object.values(plan.allowances).every((value) => value === null)).toBe(true);
    }
  });

  it("enforces the authoritative capability differences", () => {
    expect(planDefinitions.flowbot_basic.entitlements["flow.nodes.advanced"]).toBe(false);
    expect(planDefinitions.flowbot_premium.entitlements["flow.nodes.advanced"]).toBe(true);
    expect(planDefinitions.ai_chat_basic.entitlements["channel.line"]).toBe(false);
    expect(planDefinitions.ai_chat_premium.entitlements["channel.line"]).toBe(true);
    expect(planDefinitions.voice_basic_gen1.entitlements["voice.capability_profile"]).toBe("voice_gen1");
    expect(planDefinitions.voice_advanced_gen2.entitlements["voice.capability_profile"]).toBe("voice_gen2");
  });

  it("returns a provider-neutral public DTO and rejects unknown plan keys", () => {
    const payload = JSON.stringify(publicCatalog());
    expect(payload).not.toMatch(/provider|model|adapter|token/i);
    expect(() => planForSelection("voice_unlimited")).toThrow();
  });
});
