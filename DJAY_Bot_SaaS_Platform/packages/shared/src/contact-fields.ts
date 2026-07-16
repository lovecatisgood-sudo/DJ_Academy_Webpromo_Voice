export const contactFieldLimits = Object.freeze({
  displayName: Object.freeze({ minLength: 1, maxLength: 200 }),
  phone: Object.freeze({ minLength: 7, maxLength: 32 }),
});

export const contactDisplayNameFieldConstraints = Object.freeze({
  maxLength: contactFieldLimits.displayName.maxLength,
});
export const contactPhoneFieldConstraints = Object.freeze({
  maxLength: contactFieldLimits.phone.maxLength,
});

export type ContactCreationField = "displayName" | "email" | "phone";
export type ContactCreationError = Readonly<{ field: ContactCreationField; message: string }>;

export function normalizeContactText(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

export function contactCreationError(input: Readonly<{
  displayName: FormDataEntryValue | null;
  email: FormDataEntryValue | null;
  phone: FormDataEntryValue | null;
}>): ContactCreationError | null {
  const displayName = normalizeContactText(input.displayName);
  const email = normalizeContactText(input.email);
  const phone = normalizeContactText(input.phone);
  if (displayName.length < contactFieldLimits.displayName.minLength
    || displayName.length > contactFieldLimits.displayName.maxLength) {
    return Object.freeze({
      field: "displayName" as const,
      message: "Contact name must be 1–200 characters after removing leading and trailing spaces.",
    });
  }
  if (!email && !phone) {
    return Object.freeze({ field: "email" as const, message: "Enter an email address or phone number." });
  }
  if (phone && (phone.length < contactFieldLimits.phone.minLength || phone.length > contactFieldLimits.phone.maxLength)) {
    return Object.freeze({
      field: "phone" as const,
      message: "Phone number must be 7–32 characters after removing leading and trailing spaces.",
    });
  }
  return null;
}
