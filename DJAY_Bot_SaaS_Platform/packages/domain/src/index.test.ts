import { describe, expect, it } from "vitest";
import { canTransitionMode, decideIdentityMatch, leadStatuses, legacyLeadStatusMap } from "./index";

describe("shared domain contracts", () => {
  it("uses the accepted canonical lead stages", () => {
    expect(leadStatuses).toEqual([
      "new", "pending_follow_up", "appointment_made", "not_closed_follow", "closed_deal", "disqualified",
    ]);
    expect(legacyLeadStatusMap.appointment_set).toBe("review_required");
  });

  it("auto-links only one exact verified identity", () => {
    expect(decideIdentityMatch({
      kind: "email", normalizedValue: "person@example.test",
      candidates: [{ contactId: "a", kind: "email", normalizedValue: "person@example.test", verified: true }],
    })).toEqual({ decision: "exact_verified", contactId: "a" });
    expect(decideIdentityMatch({
      kind: "email", normalizedValue: "person@example.test",
      candidates: [{ contactId: "a", kind: "email", normalizedValue: "person@example.test", verified: false }],
    })).toEqual({ decision: "review_candidate" });
  });

  it("keeps closed conversations terminal", () => {
    expect(canTransitionMode("flowbot", "human")).toBe(true);
    expect(canTransitionMode("human", "voice")).toBe(true);
    expect(canTransitionMode("closed", "ai_text")).toBe(false);
  });
});
