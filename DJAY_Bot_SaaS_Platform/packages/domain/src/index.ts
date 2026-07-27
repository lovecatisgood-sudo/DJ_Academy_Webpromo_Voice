import { contactFieldLimits, conversationMessageTextSchema, productKeySchema, publicPlanKeySchema } from "@djay/shared";
import { z } from "zod";

export const leadStatuses = [
  "new", "pending_follow_up", "appointment_made", "not_closed_follow",
  "closed_deal", "disqualified",
] as const;
export const leadStatusSchema = z.enum(leadStatuses);
export type LeadStatus = z.infer<typeof leadStatusSchema>;

export const appointmentStatuses = [
  "requested", "pending_confirmation", "confirmed", "completed", "cancelled", "rejected", "no_show",
] as const;
export const appointmentStatusSchema = z.enum(appointmentStatuses);

export const channelKinds = ["web", "line", "whatsapp", "messenger", "voice", "internal"] as const;
export const channelKindSchema = z.enum(channelKinds);

export const automationModes = ["flowbot", "ai_text", "voice", "human", "closed"] as const;
export const automationModeSchema = z.enum(automationModes);

export const messageActorTypes = ["customer", "flowbot", "ai", "human", "system"] as const;
export const messageActorTypeSchema = z.enum(messageActorTypes);

export const contactInputSchema = z.object({
  displayName: z.string().trim().min(contactFieldLimits.displayName.minLength).max(contactFieldLimits.displayName.maxLength),
  email: z.email().max(320).optional(),
  phone: z.string().trim().min(contactFieldLimits.phone.minLength).max(contactFieldLimits.phone.maxLength).optional(),
  locale: z.enum(["en", "th"]).default("th"),
  consentStatus: z.enum(["unknown", "granted", "denied", "withdrawn"]).default("unknown"),
}).strict().refine((value) => value.email || value.phone, { message: "At least one contact identity is required." });

export const leadInputSchema = z.object({
  contactId: z.uuid(),
  title: z.string().trim().min(2).max(200),
  source: z.string().trim().min(2).max(80),
  status: leadStatusSchema.default("new"),
}).strict();

export const conversationInputSchema = z.object({
  contactId: z.uuid(),
  leadId: z.uuid().optional(),
  productKey: productKeySchema,
  publicPlanKey: publicPlanKeySchema,
  entitlementSnapshotId: z.uuid(),
  channelKind: channelKindSchema,
  automationMode: automationModeSchema,
}).strict();

export const messageInputSchema = z.object({
  actorType: messageActorTypeSchema,
  direction: z.enum(["inbound", "outbound", "internal"]),
  text: conversationMessageTextSchema,
  externalMessageId: z.string().max(300).optional(),
}).strict();

export type IdentityCandidate = Readonly<{
  contactId: string;
  kind: "email" | "phone" | "channel";
  normalizedValue: string;
  verified: boolean;
}>;

export type IdentityMatch = Readonly<{
  decision: "exact_verified" | "review_candidate" | "no_match";
  contactId?: string;
}>;

export function decideIdentityMatch(input: Readonly<{
  kind: IdentityCandidate["kind"];
  normalizedValue: string;
  candidates: readonly IdentityCandidate[];
}>): IdentityMatch {
  const exact = input.candidates.filter((candidate) =>
    candidate.kind === input.kind && candidate.normalizedValue === input.normalizedValue,
  );
  const verified = exact.filter((candidate) => candidate.verified);
  if (verified.length === 1) return { decision: "exact_verified", contactId: verified[0]!.contactId };
  if (exact.length > 0 || input.candidates.length > 0) return { decision: "review_candidate" };
  return { decision: "no_match" };
}

const allowedModeTransitions: Readonly<Record<string, readonly string[]>> = Object.freeze({
  flowbot: ["ai_text", "human", "closed"],
  ai_text: ["human", "closed"],
  voice: ["human", "closed"],
  human: ["flowbot", "ai_text", "voice", "closed"],
  closed: [],
});

export function canTransitionMode(from: string, to: string): boolean {
  return allowedModeTransitions[from]?.includes(to) ?? false;
}

export const legacyLeadStatusMap: Readonly<Record<string, LeadStatus | "review_required">> = Object.freeze({
  new: "new",
  pending_follow_up: "pending_follow_up",
  appointment_made: "appointment_made",
  appointment_set: "review_required",
  closed_deal: "closed_deal",
  deal_closed: "closed_deal",
  no_deal: "disqualified",
  disqualified: "disqualified",
});
