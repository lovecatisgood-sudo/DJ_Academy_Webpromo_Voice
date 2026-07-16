import { describe, expect, it } from "vitest";
import {
  normalizeVoiceIncidentResolution,
  voiceIncidentResolutionError,
  voiceIncidentResolutionLimits,
  voiceIncidentResolutionSchema,
} from "./voice-incident-fields";

describe("Voice incident resolution contract", () => {
  it("publishes and enforces the database boundary after normalization", () => {
    expect(voiceIncidentResolutionLimits).toEqual({ minLength: 12, maxLength: 2_000 });
    expect(voiceIncidentResolutionSchema.safeParse("   ").success).toBe(false);
    expect(voiceIncidentResolutionSchema.safeParse("x".repeat(2_001)).success).toBe(false);
  });

  it("normalizes accepted evidence and returns field-safe guidance", () => {
    const resolution = "Route remains paused pending reviewed recovery.";
    expect(normalizeVoiceIncidentResolution(`  ${resolution}  `)).toBe(resolution);
    expect(voiceIncidentResolutionSchema.parse(`  ${resolution}  `)).toBe(resolution);
    expect(voiceIncidentResolutionError("short")).toContain("12–2,000 characters");
    expect(voiceIncidentResolutionError(resolution)).toBeNull();
  });
});
