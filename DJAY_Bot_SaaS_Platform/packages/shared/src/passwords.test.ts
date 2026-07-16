import { describe, expect, it } from "vitest";
import { newPasswordConstraints, passwordConfirmationError, passwordConfirmationMessage } from "./passwords";

describe("new password browser contract", () => {
  it("matches the server length boundary", () => {
    expect(newPasswordConstraints).toEqual({ minLength: 12, maxLength: 128 });
  });

  it("accepts identical passphrases", () => {
    expect(passwordConfirmationError("correct horse battery staple", "correct horse battery staple")).toBeNull();
  });

  it.each([
    ["correct horse battery staple", "different horse battery staple"],
    [null, "correct horse battery staple"],
    ["correct horse battery staple", null],
  ])("rejects a mismatched or missing confirmation", (password, confirmation) => {
    expect(passwordConfirmationError(password, confirmation)).toBe(passwordConfirmationMessage);
  });
});
