import { describe, expect, it } from "vitest";
import { resolveChromeLocale, setupChrome } from "./setup-chrome";

describe("setup chrome i18n", () => {
  it("defaults unknown locales to Thai", () => {
    // Thai is the platform default; English is secondary and only by explicit selection.
    expect(resolveChromeLocale(undefined)).toBe("th");
    expect(resolveChromeLocale(null)).toBe("th");
    expect(resolveChromeLocale("")).toBe("th");
    expect(resolveChromeLocale("fr")).toBe("th");
    expect(resolveChromeLocale("th")).toBe("th");
    expect(resolveChromeLocale("en")).toBe("en");
  });

  it("exposes matching keys for English and Thai", () => {
    const en = setupChrome("en");
    const th = setupChrome("th");
    expect(Object.keys(en).sort()).toEqual(Object.keys(th).sort());
    expect(en.navSetup).toBe("Setup");
    expect(th.navSetup).toBe("เริ่มใช้งาน");
    expect(en.checkoutReturn).toContain("payment confirmation");
    expect(th.checkoutReturn.length).toBeGreaterThan(10);
  });
});
