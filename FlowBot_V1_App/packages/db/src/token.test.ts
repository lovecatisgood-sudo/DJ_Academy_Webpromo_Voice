import { describe, expect, it } from "vitest";
import { createSessionToken, hashSessionToken, sessionTokenMatches } from "./token";

describe("visitor session token handling", () => {
  it("creates high-entropy URL-safe tokens and stores hashes", () => {
    const token = createSessionToken();
    const hash = hashSessionToken(token);

    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(hash).toBeInstanceOf(Buffer);
    expect(hash.toString("base64url")).not.toEqual(token);
    expect(sessionTokenMatches(token, hash)).toBe(true);
    expect(sessionTokenMatches(`${token}x`, hash)).toBe(false);
  });
});
