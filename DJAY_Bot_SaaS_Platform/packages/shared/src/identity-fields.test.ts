import { describe, expect, it } from "vitest";
import {
  businessNameFieldConstraints,
  displayNameFieldConstraints,
  emailFieldConstraints,
  identityTextError,
  normalizeIdentityText,
} from "./identity-fields";

describe("identity browser contracts", () => {
  it("matches the server field boundaries", () => {
    expect(emailFieldConstraints).toEqual({ maxLength: 320 });
    expect(displayNameFieldConstraints).toEqual({ minLength: 2, maxLength: 160 });
    expect(businessNameFieldConstraints).toEqual({ minLength: 2, maxLength: 200 });
  });

  it("normalizes surrounding space before submission", () => {
    expect(normalizeIdentityText("  DJAY Studio  ")).toBe("DJAY Studio");
    expect(normalizeIdentityText(null)).toBe("");
  });

  it.each([
    ["DJAY Owner", "displayName"],
    ["DJAY Studio", "businessName"],
  ] as const)("accepts a valid %s value", (value, field) => {
    expect(identityTextError(value, field)).toBeNull();
  });

  it.each([
    ["   ", "displayName", "Name must be 2–160 characters"],
    ["a", "displayName", "Name must be 2–160 characters"],
    ["a".repeat(161), "displayName", "Name must be 2–160 characters"],
    [" ", "businessName", "Business name must be 2–200 characters"],
    ["a".repeat(201), "businessName", "Business name must be 2–200 characters"],
  ] as const)("rejects an invalid normalized identity value", (value, field, message) => {
    expect(identityTextError(value, field)).toContain(message);
  });
});
