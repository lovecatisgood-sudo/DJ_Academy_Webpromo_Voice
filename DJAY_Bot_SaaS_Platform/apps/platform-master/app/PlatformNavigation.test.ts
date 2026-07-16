import { describe, expect, it } from "vitest";
import { platformNavigationForRole } from "./PlatformNavigation";

const labels = (role: string) => platformNavigationForRole(role).map((item) => item.label);

describe("role-aware platform navigation", () => {
  it("shows every governed area to the platform owner", () => {
    expect(labels("platform_owner")).toEqual(["Overview", "Release", "Usage", "Voice", "Recovery", "Commerce", "Support"]);
  });

  it("limits navigation to each operational role", () => {
    expect(labels("platform_ai_operations")).toEqual(["Overview", "Release", "Voice", "Recovery", "Support"]);
    expect(labels("platform_support")).toEqual(["Overview", "Release", "Recovery", "Support"]);
    expect(labels("platform_finance")).toEqual(["Overview", "Release", "Usage", "Commerce", "Support"]);
  });

  it("fails closed for an unknown role", () => {
    expect(labels("platform_unknown")).toEqual([]);
  });
});
