import { describe, expect, it } from "vitest";
import {
  flowbotOperationKeyPattern,
  flowbotOperationsFieldConstraints,
  flowbotRoutingTeamFormError,
  flowbotScheduleFormError,
  isSupportedIanaTimezone,
} from "./flowbot-operations-fields";

describe("FlowBot Premium operations field contract", () => {
  it("publishes browser constraints that match storage", () => {
    expect(flowbotOperationsFieldConstraints).toEqual({
      key: { minLength: 1, maxLength: 100, pattern: "[a-z][a-z0-9_-]{0,99}" },
      name: { minLength: 2, maxLength: 160 },
      timezone: { minLength: 3, maxLength: 64 },
    });
    expect(flowbotOperationKeyPattern.test("sales_team-2")).toBe(true);
  });

  it.each(["Sales", "2sales", "sales team", "sales.team", "a".repeat(101)])("rejects a non-storage-safe key: %s", (key) => {
    expect(flowbotOperationKeyPattern.test(key)).toBe(false);
  });

  it("validates supported timezones", () => {
    expect(isSupportedIanaTimezone("Asia/Bangkok")).toBe(true);
    expect(isSupportedIanaTimezone("Mars/Colony")).toBe(false);
  });

  it("returns schedule field errors before accepting normalized input", () => {
    expect(flowbotScheduleFormError({ scheduleKey: "Sales", name: "Sales hours", timezone: "Asia/Bangkok" })).toMatchObject({ field: "scheduleKey" });
    expect(flowbotScheduleFormError({ scheduleKey: "sales", name: " ", timezone: "Asia/Bangkok" })).toMatchObject({ field: "name" });
    expect(flowbotScheduleFormError({ scheduleKey: "sales", name: "Sales hours", timezone: "Mars/Colony" })).toMatchObject({ field: "timezone" });
    expect(flowbotScheduleFormError({ scheduleKey: " sales ", name: " Sales hours ", timezone: " Asia/Bangkok " })).toBeNull();
  });

  it("requires a bounded non-empty routing team", () => {
    expect(flowbotRoutingTeamFormError({ teamKey: "sales", name: "Sales team", membershipIds: [] })).toMatchObject({ field: "membershipIds" });
    expect(flowbotRoutingTeamFormError({ teamKey: "sales", name: "Sales team", membershipIds: ["member"] })).toBeNull();
    expect(flowbotRoutingTeamFormError({ teamKey: "sales", name: "Sales team", membershipIds: Array.from({ length: 101 }, (_, index) => String(index)) })).toMatchObject({ field: "membershipIds" });
  });
});
