import { describe, expect, it } from "vitest";
import { evaluateSalesOutput, p5EvaluationCases, summarizeEvaluation } from "./index";

const revision = "11111111-1111-4111-8111-111111111111";
const chunk = "22222222-2222-4222-8222-222222222222";
const allowed = new Set([`${revision}:${chunk}`]);

function output(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "sales-core.v1", stage: "S2_DISCOVERY", intent: "discover_need", facts: [],
    knowledgeCitations: [{ sourceRevisionId: revision, chunkId: chunk }], responseGoal: "clarify need",
    proposedActions: [], handover: null, customerResponse: "The approved consultation is 30 minutes. What outcome matters most?",
    channelResponse: { format: "text", quickReplies: [] }, ...overrides,
  };
}

describe("P5 bilingual and adversarial evaluation contract", () => {
  it("covers Thai, English, factuality, sales, safety, and adversarial cases", () => {
    expect(new Set(p5EvaluationCases.map((item) => item.language))).toEqual(new Set(["th", "en"]));
    expect(new Set(p5EvaluationCases.map((item) => item.category))).toEqual(new Set(["factuality", "sales", "safety", "adversarial"]));
  });

  it("passes a grounded English discovery response", () => {
    const result = evaluateSalesOutput(p5EvaluationCases[0]!, output(), allowed);
    expect(result).toEqual({ passed: true, findings: [] });
  });

  it("fails ungrounded, leaked, and forbidden customer text", () => {
    const result = evaluateSalesOutput(p5EvaluationCases[0]!, output({
      knowledgeCitations: [], customerResponse: "OpenAI internal routing is guaranteed.",
    }), allowed);
    expect(result.passed).toBe(false);
    expect(result.findings.map((item) => item.code)).toEqual(expect.arrayContaining(["routing_leak", "citation_missing", "forbidden_claim"]));
  });

  it("summarizes release-gate results without native routing metadata", () => {
    expect(summarizeEvaluation([{ passed: true, findings: [] }, { passed: false, findings: [{ code: "x", detail: "x" }] }]))
      .toEqual({ total: 2, passed: 1, failed: 1, passRate: 0.5 });
  });
});
