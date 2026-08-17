import { describe, expect, it } from "vitest";
import { publicBuilderAiTestContext, publicBuilderDraftStrings } from "./public-builder-draft-context";

const business = {
  name: "DJAI Academy", summary: "Practical AI education", offers: "Courses", hours: "09:00–17:00",
  contact: "hello@example.test", faqs: [{ question: "Language?", answer: "English and Thai" }],
  agentObjective: "Help the customer", agentBehavior: "Be concise", agentBoundaries: "Do not invent facts",
};
const state = {
  configuration: {
    textDraft: { business },
    textPublishedDraft: { business: { ...business, name: "Published Academy" } },
    textUi: { role: "support", publishedRole: "sales" },
  },
};

describe("server-authoritative public Builder context", () => {
  it("selects draft and published business context without browser-supplied knowledge", () => {
    expect(publicBuilderAiTestContext(state, "draft")).toMatchObject({ role: "support", business: { name: "DJAI Academy" } });
    expect(publicBuilderAiTestContext(state, "published")).toMatchObject({ role: "sales", business: { name: "Published Academy" } });
  });

  it("indexes only exact non-empty strings from the saved draft", () => {
    const strings = publicBuilderDraftStrings(state);
    expect(strings.has("Practical AI education")).toBe(true);
    expect(strings.has("Not in the draft")).toBe(false);
  });

  it("fails closed when required saved context is absent", () => {
    expect(() => publicBuilderAiTestContext({}, "draft")).toThrow();
  });
});
