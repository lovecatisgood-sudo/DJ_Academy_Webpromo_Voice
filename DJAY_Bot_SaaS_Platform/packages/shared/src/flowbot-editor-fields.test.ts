import { describe, expect, it } from "vitest";
import { flowbotEditorFieldConstraints, flowbotEditorFieldLimits } from "./flowbot-editor-fields";

describe("FlowBot visual editor field contract", () => {
  it("matches the domain title and bilingual text boundaries", () => {
    expect(flowbotEditorFieldLimits).toEqual({
      title: { minLength: 1, maxLength: 160 },
      localizedText: { maxLength: 10_000 },
    });
    expect(flowbotEditorFieldConstraints).toEqual({
      title: { minLength: 1, maxLength: 160 },
      localizedText: { maxLength: 10_000 },
    });
  });
});
