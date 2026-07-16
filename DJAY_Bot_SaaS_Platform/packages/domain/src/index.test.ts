import { describe, expect, it } from "vitest";
import { canTransitionMode, contactInputSchema, decideIdentityMatch, leadStatuses, legacyLeadStatusMap } from "./index";

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

  it("requires one bounded contact identity after normalization", () => {
    expect(contactInputSchema.safeParse({ displayName: "Customer", locale: "en", consentStatus: "unknown" }).success).toBe(false);
    expect(contactInputSchema.safeParse({ displayName: "Customer", phone: "123", locale: "en", consentStatus: "unknown" }).success).toBe(false);
    expect(contactInputSchema.parse({ displayName: "  Customer  ", phone: "  +66812345678  ", locale: "en", consentStatus: "unknown" }))
      .toMatchObject({ displayName: "Customer", phone: "+66812345678" });
  });

  it("keeps closed conversations terminal", () => {
    expect(canTransitionMode("flowbot", "human")).toBe(true);
    expect(canTransitionMode("human", "voice")).toBe(true);
    expect(canTransitionMode("closed", "ai_text")).toBe(false);
  });
});
