import { describe, expect, it } from "vitest";
import { translateEnglishUi, translateThaiUi } from "./thai-ui";

describe("translateThaiUi", () => {
  it("translates exact static UI copy", () => {
    expect(translateThaiUi("Create workspace")).toBe("สร้างเวิร์กสเปซ");
  });

  it("does not rewrite ambiguous customer-entered values", () => {
    expect(translateThaiUi("Contact")).toBe("Contact");
    expect(translateThaiUi("Yes")).toBe("Yes");
    expect(translateThaiUi("No")).toBe("No");
    expect(translateThaiUi("Unknown")).toBe("Unknown");
    expect(translateThaiUi("unknown")).toBe("unknown");
  });

  it("does not rewrite arbitrary customer prose", () => {
    expect(translateThaiUi("took about 30s")).toBe("took about 30s");
  });

  it("restores exact Thai UI copy for the English presentation boundary", () => {
    expect(translateEnglishUi("สร้างเวิร์กสเปซ")).toBe("Create workspace");
    expect(translateEnglishUi("  สร้างเวิร์กสเปซ  ")).toBe("  Create workspace  ");
  });

  it("does not rewrite arbitrary Thai prose", () => {
    expect(translateEnglishUi("ข้อความจากลูกค้าที่ไม่ใช่ป้าย UI")).toBe("ข้อความจากลูกค้าที่ไม่ใช่ป้าย UI");
  });
});
