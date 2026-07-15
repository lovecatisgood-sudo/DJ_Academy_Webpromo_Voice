import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("admin password hashing", () => {
  it("uses Argon2id hashes and verifies passwords", async () => {
    const passwordHash = await hashPassword("correct horse battery staple");

    expect(passwordHash).toContain("argon2id");
    await expect(verifyPassword("correct horse battery staple", passwordHash)).resolves.toBe(true);
    await expect(verifyPassword("wrong password", passwordHash)).resolves.toBe(false);
  });
});
