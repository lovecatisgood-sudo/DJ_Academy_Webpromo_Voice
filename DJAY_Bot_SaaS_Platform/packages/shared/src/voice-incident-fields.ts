import { z } from "zod";

export const voiceIncidentResolutionLimits = Object.freeze({ minLength: 12, maxLength: 2_000 });

export const voiceIncidentResolutionFieldConstraints = Object.freeze({
  maxLength: voiceIncidentResolutionLimits.maxLength,
});

export const voiceIncidentResolutionSchema = z.string()
  .trim()
  .min(voiceIncidentResolutionLimits.minLength)
  .max(voiceIncidentResolutionLimits.maxLength);

export function normalizeVoiceIncidentResolution(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

export function voiceIncidentResolutionError(value: FormDataEntryValue | null): string | null {
  const normalized = normalizeVoiceIncidentResolution(value);
  if (normalized.length < voiceIncidentResolutionLimits.minLength
    || normalized.length > voiceIncidentResolutionLimits.maxLength) {
    return "Resolution must be 12–2,000 characters after removing leading and trailing spaces.";
  }
  return null;
}
