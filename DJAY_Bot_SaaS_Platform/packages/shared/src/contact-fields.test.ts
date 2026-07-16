import { describe, expect, it } from "vitest";
import { contactCreationError, contactFieldLimits, normalizeContactText } from "./contact-fields";

describe("contact creation browser contract", () => {
  it("publishes the domain name and phone boundaries", () => {
    expect(contactFieldLimits).toEqual({
      displayName: { minLength: 1, maxLength: 200 },
      phone: { minLength: 7, maxLength: 32 },
    });
  });

  it("normalizes surrounding space", () => {
    expect(normalizeContactText("  +66 81 234 5678  ")).toBe("+66 81 234 5678");
    expect(normalizeContactText(null)).toBe("");
  });

  it.each([
    [{ displayName: "Customer", email: "customer@example.test", phone: "" }],
    [{ displayName: "Customer", email: "", phone: "+66812345678" }],
    [{ displayName: "Customer", email: "customer@example.test", phone: "+66812345678" }],
  ])("accepts a contact with at least one usable identity", (input) => {
    expect(contactCreationError(input)).toBeNull();
  });

  it.each([
    [{ displayName: "   ", email: "customer@example.test", phone: "" }, "displayName", "Contact name must be 1–200 characters"],
    [{ displayName: "Customer", email: "", phone: "" }, "email", "Enter an email address or phone number."],
    [{ displayName: "Customer", email: "", phone: "123" }, "phone", "Phone number must be 7–32 characters"],
    [{ displayName: "Customer", email: "", phone: "1".repeat(33) }, "phone", "Phone number must be 7–32 characters"],
  ])("returns field-specific correction guidance", (input, field, message) => {
    expect(contactCreationError(input)).toMatchObject({ field, message: expect.stringContaining(message) });
  });
});
