import { describe, expect, it } from "vitest";
import { resolveChromeLocale, setupChrome } from "./setup-chrome";

describe("setup chrome i18n", () => {
  it("defaults unknown locales to English", () => {
    expect(resolveChromeLocale(undefined)).toBe("en");
    expect(resolveChromeLocale("fr")).toBe("en");
    expect(resolveChromeLocale("th")).toBe("th");
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
