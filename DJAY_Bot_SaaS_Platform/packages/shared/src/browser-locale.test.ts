import { afterEach, describe, expect, it, vi } from "vitest";
import { currentUiLocale, uiCopy } from "./browser-locale";

describe("browser locale", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to Thai when no document is available", () => {
    vi.stubGlobal("document", undefined);
    expect(currentUiLocale()).toBe("th");
  });

  it("reads the unified djay-locale cookie", () => {
    vi.stubGlobal("document", { cookie: "other=1; djay-locale=en" });
    expect(currentUiLocale()).toBe("en");
    expect(uiCopy("ไทย", "English")).toBe("English");
  });
});
