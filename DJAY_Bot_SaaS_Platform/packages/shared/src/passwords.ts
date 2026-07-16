export const newPasswordConstraints = Object.freeze({ minLength: 12, maxLength: 128 });
export const passwordConfirmationMessage = "Passwords do not match. Enter the same password in both fields.";

export function passwordConfirmationError(
  password: FormDataEntryValue | null,
  confirmation: FormDataEntryValue | null,
): string | null {
  return typeof password === "string" && typeof confirmation === "string" && password === confirmation
    ? null
    : passwordConfirmationMessage;
}
