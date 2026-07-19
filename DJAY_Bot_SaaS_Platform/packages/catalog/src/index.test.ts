import { describe, expect, it } from "vitest";
import {
  addOnDefinitions,
  planDefinitions,
  planForSelection,
  planVersionDefinitionSchema,
  plansForProduct,
  professionalServiceDefinitions,
  publicCatalog,
  usagePackDefinitions,
} from "./index";

describe("six-plan catalog", () => {
  it("contains exactly two tiers for each of three products", () => {
    expect(Object.keys(planDefinitions)).toHaveLength(6);
    expect(plansForProduct("flowbot")).toHaveLength(2);
    expect(plansForProduct("ai_chat")).toHaveLength(2);
    expect(plansForProduct("voice")).toHaveLength(2);
  });

  it("publishes exact approved commercial numbers but keeps checkout disabled", () => {
    expect(Object.fromEntries(Object.entries(planDefinitions).map(([key, plan]) => [key, [
      plan.firstTermAmountMinor, plan.renewalAmountMinor, plan.firstTermDiscountMinor,
    ]]))).toEqual({
      flowbot_basic: [249_900, 499_900, 250_000],
      flowbot_premium: [445_000, 890_000, 445_000],
      ai_chat_basic: [595_000, 1_190_000, 595_000],
      ai_chat_premium: [1_245_000, 2_490_000, 1_245_000],
      voice_basic_gen1: [1_495_000, 2_990_000, 1_495_000],
      voice_advanced_gen2: [2_995_000, 5_990_000, 2_995_000],
    });
    for (const plan of Object.values(planDefinitions)) {
      expect(plan.sellable).toBe(false);
      expect(plan.stripeMappingState).toBe("missing");
      expect(plan.billingInterval).toBe("year");
    }
  });

  it("does not derive the Flow Starter offer from percentage rounding", () => {
    expect(planDefinitions.flowbot_basic.renewalAmountMinor - planDefinitions.flowbot_basic.firstTermAmountMinor)
      .toBe(250_000);
    expect(planDefinitions.flowbot_basic.firstTermAmountMinor).toBe(249_900);
  });

  it("locks the stated allowances, rates, packs, add-ons, and setup prices", () => {
    expect(planDefinitions.flowbot_basic.allowances.flow_execution).toBe(50_000);
    expect(planDefinitions.flowbot_premium.allowances.flow_execution).toBe(100_000);
    expect(planDefinitions.ai_chat_basic.allowances.ai_response).toBe(2_000);
    expect(planDefinitions.ai_chat_premium.allowances.ai_response).toBe(10_000);
    expect(planDefinitions.voice_basic_gen1.allowances.voice_minute).toBe(150);
    expect(planDefinitions.voice_advanced_gen2.allowances.voice_minute).toBe(500);
    expect(planDefinitions.ai_chat_basic.overageRatesMinor.ai_response).toBe(35);
    expect(planDefinitions.voice_advanced_gen2.overageRatesMinor.voice_minute).toBe(500);
    expect(usagePackDefinitions.ai_starter_1000).toMatchObject({ quantity: 1_000, amountMinor: 29_900 });
    expect(addOnDefinitions.additional_social_channel.amountMinor).toBe(29_900);
    expect(professionalServiceDefinitions.voice_custom_automation.amountMinor).toBe(1_990_000);
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

  it("rejects sellability when the live Stripe mapping is missing", () => {
    expect(() => planVersionDefinitionSchema.parse({ ...planDefinitions.ai_chat_basic, sellable: true }))
      .toThrow(/sellable_requires_live_stripe_mapping/);
  });
});
