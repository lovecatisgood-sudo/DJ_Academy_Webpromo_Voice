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
        templateOrRole: { templateKey: "lead-capture" },
      },
    })).toMatchObject({ revision: 3, productFamily: "flow" });
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
