import { z } from "zod";

export const voiceRuntimeReasonLimits = Object.freeze({ minLength: 3, maxLength: 200 });
export const voiceRoutingActionReasonLimits = Object.freeze({ minLength: 12, maxLength: 500 });

export const voiceRuntimeReasonFieldConstraints = Object.freeze({
  minLength: voiceRuntimeReasonLimits.minLength,
  maxLength: voiceRuntimeReasonLimits.maxLength,
});
export const voiceRoutingActionReasonFieldConstraints = Object.freeze({
  minLength: voiceRoutingActionReasonLimits.minLength,
  maxLength: voiceRoutingActionReasonLimits.maxLength,
});

export const voiceRuntimeReasonSchema = z.string().trim()
  .min(voiceRuntimeReasonLimits.minLength).max(voiceRuntimeReasonLimits.maxLength);
export const voiceRoutingActionReasonSchema = z.string().trim()
  .min(voiceRoutingActionReasonLimits.minLength).max(voiceRoutingActionReasonLimits.maxLength);

export function normalizePlatformVoiceReason(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedLengthError(
  value: FormDataEntryValue | null,
  limits: Readonly<{ minLength: number; maxLength: number }>,
  label: string,
): string | null {
  const length = normalizePlatformVoiceReason(value).length;
  return length < limits.minLength || length > limits.maxLength
    ? `${label} must be ${limits.minLength}–${limits.maxLength} characters after removing leading and trailing spaces.`
    : null;
}

export function voiceRuntimeReasonError(value: FormDataEntryValue | null): string | null {
  return normalizedLengthError(value, voiceRuntimeReasonLimits, "Operational reason");
}

export function voiceRoutingActionReasonError(value: FormDataEntryValue | null): string | null {
  return normalizedLengthError(value, voiceRoutingActionReasonLimits, "Action reason");
}
