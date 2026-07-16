import { describe, expect, it } from "vitest";
import { deriveOnboardingStage } from "./tenant-workspace-store";

describe("server-derived onboarding stage", () => {
  it.each([
    [{ businessProfile: false, productSelected: false, launchReady: false }, "account_created"],
    [{ businessProfile: true, productSelected: false, launchReady: false }, "business_profile"],
    [{ businessProfile: true, productSelected: true, launchReady: false }, "product_selection"],
    [{ businessProfile: true, productSelected: true, launchReady: true }, "ready"],
  ] as const)("derives %s as %s", (readiness, expected) => {
    expect(deriveOnboardingStage(readiness)).toBe(expected);
  });

  it("cannot become ready from product selection without launch evidence", () => {
    expect(deriveOnboardingStage({
      businessProfile: true, productSelected: true, launchReady: false,
    })).not.toBe("ready");
  });
});
