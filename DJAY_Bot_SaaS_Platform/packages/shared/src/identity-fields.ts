export const emailFieldConstraints = Object.freeze({ maxLength: 320 });
export const displayNameFieldConstraints = Object.freeze({ minLength: 2, maxLength: 160 });
export const businessNameFieldConstraints = Object.freeze({ minLength: 2, maxLength: 200 });

export type IdentityTextField = "displayName" | "businessName";

const identityTextFields = Object.freeze({
  displayName: Object.freeze({ label: "Name", ...displayNameFieldConstraints }),
  businessName: Object.freeze({ label: "Business name", ...businessNameFieldConstraints }),
});

export function normalizeIdentityText(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

export function identityTextError(value: FormDataEntryValue | null, field: IdentityTextField): string | null {
  const normalized = normalizeIdentityText(value);
  const contract = identityTextFields[field];
  return normalized.length >= contract.minLength && normalized.length <= contract.maxLength
    ? null
    : `${contract.label} must be ${contract.minLength}–${contract.maxLength} characters after removing leading and trailing spaces.`;
}
