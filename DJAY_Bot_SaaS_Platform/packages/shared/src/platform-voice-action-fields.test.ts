import { describe, expect, it } from "vitest";
import {
  normalizePlatformVoiceReason,
  voiceRoutingActionReasonError,
  voiceRoutingActionReasonSchema,
  voiceRuntimeReasonError,
  voiceRuntimeReasonSchema,
} from "./platform-voice-action-fields";

describe("Platform Voice action reason contracts", () => {
  it("normalizes runtime reasons and rejects invisible evidence", () => {
    expect(voiceRuntimeReasonSchema.parse("  planned maintenance  ")).toBe("planned maintenance");
    expect(voiceRuntimeReasonSchema.safeParse("   ").success).toBe(false);
    expect(voiceRuntimeReasonError("  ")).toContain("3–200 characters");
  });

  it("keeps routing action evidence within the database boundary", () => {
    const reason = "Promote after reviewed canary evidence";
    expect(normalizePlatformVoiceReason(`  ${reason}  `)).toBe(reason);
    expect(voiceRoutingActionReasonSchema.parse(`  ${reason}  `)).toBe(reason);
    expect(voiceRoutingActionReasonError("too short")).toContain("12–500 characters");
    expect(voiceRoutingActionReasonSchema.safeParse("x".repeat(501)).success).toBe(false);
  });
});
