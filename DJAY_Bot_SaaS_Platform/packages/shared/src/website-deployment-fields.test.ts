import { describe, expect, it } from "vitest";
import {
  isExactWebsiteOrigin,
  normalizeExactWebsiteOrigin,
  websiteDeploymentFieldConstraints,
  websiteDeploymentFormError,
} from "./website-deployment-fields";

describe("website deployment field contract", () => {
  it("publishes the exact browser constraints", () => {
    expect(websiteDeploymentFieldConstraints).toEqual({
      name: { minLength: 2, maxLength: 160 },
      origin: { maxLength: 2048 },
    });
  });

  it.each([
    "https://merchant.example",
    "https://merchant.example:8443",
    "http://localhost:3111",
    "http://127.0.0.1:3111",
  ])("accepts an exact admitted origin: %s", (origin) => {
    expect(isExactWebsiteOrigin(origin)).toBe(true);
  });

  it.each([
    "http://merchant.example",
    "https://merchant.example/",
    "https://merchant.example/path",
    "https://merchant.example?preview=true",
    "https://merchant.example#install",
    "https://user:secret@merchant.example",
    "not a URL",
    "https://merchant.example/" + "a".repeat(2048),
  ])("rejects a non-exact or inadmissible origin: %s", (origin) => {
    expect(isExactWebsiteOrigin(origin)).toBe(false);
  });

  it("normalizes harmless surrounding whitespace before transport", () => {
    expect(normalizeExactWebsiteOrigin("  https://merchant.example  ")).toBe("https://merchant.example");
  });

  it("returns field-specific form errors", () => {
    expect(websiteDeploymentFormError({ name: " ", origin: "https://merchant.example" })).toMatchObject({ field: "name" });
    expect(websiteDeploymentFormError({ name: "Website", origin: "https://merchant.example/path" })).toMatchObject({ field: "origin" });
    expect(websiteDeploymentFormError({ name: "Website", origin: "https://merchant.example" })).toBeNull();
  });
});
