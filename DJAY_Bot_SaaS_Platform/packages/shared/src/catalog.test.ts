import { describe, expect, it } from "vitest";
import { productForPlan, publicPlanKeys, voiceCapabilityProfiles } from "./catalog";

describe("public catalog constants", () => {
  it("contains exactly the six locked plans", () => {
    expect(publicPlanKeys).toEqual([
      "flowbot_basic",
      "flowbot_premium",
      "ai_chat_basic",
      "ai_chat_premium",
      "voice_basic_gen1",
      "voice_advanced_gen2",
    ]);
    expect(new Set(publicPlanKeys).size).toBe(6);
  });

  it("maps every plan to one product without provider metadata", () => {
    expect(Object.keys(productForPlan).sort()).toEqual([...publicPlanKeys].sort());
    expect(JSON.stringify(productForPlan)).not.toMatch(/provider|model/i);
    expect(voiceCapabilityProfiles).toEqual(["voice_gen1", "voice_gen2"]);
  });
});

