import { describe, expect, it } from "vitest";
import { hasSensitiveTenantAssurance } from "./tenant-assurance";

describe("tenant sensitive-action assurance", () => {
  const now = new Date("2026-07-18T12:00:00Z");

  it("requires both recent password and MFA verification", () => {
    expect(hasSensitiveTenantAssurance({ reauthenticatedAt: now, mfaVerifiedAt: now }, now)).toBe(true);
    expect(hasSensitiveTenantAssurance({ reauthenticatedAt: now, mfaVerifiedAt: null }, now)).toBe(false);
    expect(hasSensitiveTenantAssurance({
      reauthenticatedAt: now,
      mfaVerifiedAt: new Date(now.getTime() - 10 * 60 * 1000 - 1),
    }, now)).toBe(false);
  });
});
