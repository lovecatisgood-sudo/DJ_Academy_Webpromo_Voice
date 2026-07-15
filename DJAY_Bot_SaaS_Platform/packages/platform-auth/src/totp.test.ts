import { describe, expect, it } from "vitest";
import { generateTotpCode, verifyTotpCode } from "./index";

describe("platform TOTP", () => {
  it("matches the RFC 6238 SHA-1 test vector after truncating to six digits", () => {
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    const at = new Date(59_000);
    expect(generateTotpCode(secret, at)).toBe("287082");
    expect(verifyTotpCode(secret, "287082", at)).toBe(true);
    expect(verifyTotpCode(secret, "287083", at)).toBe(false);
  });
});
