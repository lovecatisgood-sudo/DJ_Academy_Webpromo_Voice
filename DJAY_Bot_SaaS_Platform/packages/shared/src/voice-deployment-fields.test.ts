import { describe, expect, it } from "vitest";
import { voiceDeploymentFieldConstraints, voiceDeploymentFieldLimits, voiceDeploymentValidationError } from "./voice-deployment-fields";

const valid = {
  name: "Website voice", agentName: "Mali", businessName: "Merchant Store",
  allowedOrigins: ["https://merchant.example"], greetingTh: "สวัสดีค่ะ", greetingEn: "Hello",
  automatedDisclosureTh: "นี่คือผู้ช่วยเสียงอัตโนมัติ", automatedDisclosureEn: "This is an automated voice assistant.",
  maxCallSeconds: 900, reconnectWindowSeconds: 30,
};

describe("Voice deployment field contract", () => {
  it("matches the immutable Sales Core greeting maximum", () => {
    expect(voiceDeploymentFieldLimits.greeting.maxLength).toBe(500);
    expect(voiceDeploymentFieldConstraints.greeting).toEqual({ minLength: 1, maxLength: 500 });
  });

  it("accepts a valid deployment", () => {
    expect(voiceDeploymentValidationError(valid)).toBeNull();
  });

  it.each([
    [{ greetingEn: "a".repeat(501) }, "voice", "1–500"],
    [{ automatedDisclosureTh: "short" }, "disclosure", "8–500"],
    [{ allowedOrigins: Array.from({ length: 21 }, (_, index) => `https://${index}.example`) }, "entry", "1–20"],
    [{ maxCallSeconds: 30.5 }, "entry", "whole number"],
  ])("rejects a deployment outside its browser/server boundary", (patch, tab, message) => {
    expect(voiceDeploymentValidationError({ ...valid, ...patch })).toMatchObject({ tab, message: expect.stringContaining(message) });
  });
});
