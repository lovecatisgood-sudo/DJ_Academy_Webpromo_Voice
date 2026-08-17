import { describe, expect, it } from "vitest";
import { publicBuilderDraftUpdateSchema } from "./public-builder-draft";

describe("public Builder draft contract", () => {
  it("accepts a versioned Flow draft", () => {
    expect(publicBuilderDraftUpdateSchema.parse({
      revision: 3,
      productFamily: "flow",
      planKey: "flowbot_basic",
      state: {
        schemaVersion: 1,
        locale: "th",
        family: "flow",
        access: { product: "flow", plan: "flowbot_basic", intent: "trial" },
        templateOrRole: { templateKey: "lead-capture" },
      },
    })).toMatchObject({ revision: 3, productFamily: "flow" });
  });

  it("rejects trial intent for Advanced and Voice plans", () => {
    for (const [productFamily, planKey] of [["flow", "flowbot_premium"], ["text", "ai_chat_premium"], ["voice", "voice_basic_gen1"]] as const) {
      expect(publicBuilderDraftUpdateSchema.safeParse({
        revision: 1, productFamily, planKey,
        state: { schemaVersion: 1, locale: "en", family: productFamily, access: { product: productFamily, plan: planKey, intent: "trial" } },
      }).success).toBe(false);
    }
  });

  it("rejects browser access authority that differs from the draft envelope", () => {
    expect(publicBuilderDraftUpdateSchema.safeParse({
      revision: 1, productFamily: "text", planKey: "ai_chat_basic",
      state: { schemaVersion: 1, locale: "en", family: "text", access: { product: "flow", plan: "flowbot_basic", intent: "trial" } },
    }).success).toBe(false);
  });

  it("rejects a plan from another product family", () => {
    const result = publicBuilderDraftUpdateSchema.safeParse({
      revision: 1,
      productFamily: "voice",
      planKey: "ai_chat_basic",
      state: { schemaVersion: 1, locale: "en", family: "voice" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown top-level state that cannot be migrated safely", () => {
    const result = publicBuilderDraftUpdateSchema.safeParse({
      revision: 1,
      productFamily: null,
      planKey: null,
      state: { schemaVersion: 1, locale: "en", surprise: true },
    });
    expect(result.success).toBe(false);
  });
});
