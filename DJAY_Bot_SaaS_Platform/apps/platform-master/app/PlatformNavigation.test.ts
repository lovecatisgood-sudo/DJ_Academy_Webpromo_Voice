import { describe, expect, it } from "vitest";
import { platformNavigationForRole } from "./PlatformNavigation";

const labels = (role: string) => platformNavigationForRole(role).map((item) => item.label);

describe("role-aware platform navigation", () => {
  it("shows every governed area to the platform owner", () => {
    expect(labels("platform_owner")).toEqual(["ภาพรวม", "การเปิดใช้", "การใช้งาน", "ระบบเสียง", "เหตุขัดข้อง", "กู้คืนคิว", "การค้า", "ส่งมอบบริการ", "คำขอช่วยเหลือ", "สนับสนุน"]);
  });

  it("limits navigation to each operational role", () => {
    expect(labels("platform_ai_operations")).toEqual(["ภาพรวม", "การเปิดใช้", "ระบบเสียง", "เหตุขัดข้อง", "กู้คืนคิว", "สนับสนุน"]);
    expect(labels("platform_support")).toEqual(["ภาพรวม", "การเปิดใช้", "เหตุขัดข้อง", "กู้คืนคิว", "ส่งมอบบริการ", "คำขอช่วยเหลือ", "สนับสนุน"]);
    expect(labels("platform_finance")).toEqual(["ภาพรวม", "การเปิดใช้", "การใช้งาน", "การค้า", "ส่งมอบบริการ", "สนับสนุน"]);
  });

  it("fails closed for an unknown role", () => {
    expect(labels("platform_unknown")).toEqual([]);
  });

  it("uses stable operational routes instead of a monolithic anchor menu", () => {
    expect(platformNavigationForRole("platform_owner").map((item) => item.href)).toEqual([
      "/operations/overview", "/operations/release", "/operations/usage", "/operations/voice", "/operations/incidents",
      "/operations/recovery", "/operations/commerce", "/operations/fulfillment",
      "/operations/support-tickets", "/operations/support-access",
    ]);
  });
});
