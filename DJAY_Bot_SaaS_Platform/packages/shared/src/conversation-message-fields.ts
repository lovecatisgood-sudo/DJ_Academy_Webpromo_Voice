import { z } from "zod";

export const conversationMessageTextLimits = Object.freeze({ minLength: 1, maxLength: 20_000 });

export const conversationMessageFieldConstraints = Object.freeze({
  maxLength: conversationMessageTextLimits.maxLength,
});

export const conversationMessageTextSchema = z.string()
  .trim()
  .min(conversationMessageTextLimits.minLength)
  .max(conversationMessageTextLimits.maxLength);

export function normalizeConversationMessageText(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

export function conversationMessageTextError(value: FormDataEntryValue | null): string | null {
  const normalized = normalizeConversationMessageText(value);
  if (normalized.length < conversationMessageTextLimits.minLength) {
    return "Write a reply with at least one visible character.";
  }
  if (normalized.length > conversationMessageTextLimits.maxLength) {
    return "Reply must be 20,000 characters or fewer after removing leading and trailing spaces.";
  }
  return null;
}
