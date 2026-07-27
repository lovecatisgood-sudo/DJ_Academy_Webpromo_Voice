import { createHash } from "node:crypto";
import { z } from "zod";

const optionalText = z.string().nullable().optional();
const optionalDate = z.coerce.date().nullable().optional();

export const legacyMessageSchema = z.object({
  id: z.uuid(),
  conversation_id: z.uuid(),
  channel: z.enum(["voice_widget", "text_widget"]),
  role: z.string().min(1).max(40),
  content: z.string().min(1).max(20_000),
  created_at: z.coerce.date(),
}).strip();

export const legacyLeadSchema = z.object({
  id: z.uuid(),
  conversation_id: z.uuid().nullable().optional(),
  name: optionalText,
  contact: optionalText,
  contact_type: optionalText,
  need: optionalText,
  preferred_time: optionalText,
  status: optionalText,
  client_name: optionalText,
  company_name: optionalText,
  phone: optionalText,
  email: optionalText,
  line_id: optionalText,
  whatsapp: optionalText,
  other_contact: optionalText,
  preferred_contact_method: optionalText,
  preferred_meeting_day: optionalText,
  preferred_meeting_time: optionalText,
  admin_notes: optionalText,
  created_at: z.coerce.date(),
  updated_at: optionalDate,
  source_channel: z.enum(["voice_widget", "text_widget"]).nullable().optional(),
  source_mode: z.enum(["voice", "text"]).nullable().optional(),
}).strip();

export const legacyConversationSchema = z.object({
  id: z.uuid(),
  started_at: z.coerce.date(),
  ended_at: optionalDate,
  duration_seconds: z.number().int().nonnegative().max(86_400).nullable().optional(),
  language: optionalText,
  transcript: z.unknown().nullable().optional(),
  summary: optionalText,
  business_type: optionalText,
  main_problem: optionalText,
  business_goal: optionalText,
  interest_level: optionalText,
  concern_or_objection: optionalText,
  recommended_service: optionalText,
  next_action: optionalText,
  starred: z.boolean().nullable().optional(),
  deleted_at: optionalDate,
  channel: z.enum(["voice_widget", "text_widget"]),
  interaction_mode: z.enum(["voice", "text"]),
  last_message_at: optionalDate,
  messages: z.array(legacyMessageSchema).default([]),
  leads: z.array(legacyLeadSchema).default([]),
}).strip();

export type LegacyConversation = z.infer<typeof legacyConversationSchema>;
export type LegacyLead = z.infer<typeof legacyLeadSchema>;

type ConvertedMessage = Readonly<{
  sourceId: string;
  actorType: "customer" | "ai" | "system";
  direction: "inbound" | "outbound" | "internal";
  text: string;
  createdAt: Date;
}>;

type ConvertedIdentity = Readonly<{ kind: "email" | "phone" | "channel"; value: string }>;

export type ConvertedLead = Readonly<{
  sourceId: string;
  displayName: string;
  locale: "en" | "th";
  identities: readonly ConvertedIdentity[];
  title: string;
  status: "new" | "pending_follow_up" | "appointment_made" | "not_closed_follow" | "closed_deal" | "disqualified";
  createdAt: Date;
  updatedAt: Date;
  facts: readonly Readonly<{ type: string; value: string }>[];
}>;

export type ConvertedConversation = Readonly<{
  sourceId: string;
  productKey: "voice" | "ai_chat";
  channelKind: "voice" | "web";
  locale: "en" | "th";
  startedAt: Date;
  closedAt: Date;
  durationSeconds: number | null;
  summary: string | null;
  starred: boolean;
  messages: readonly ConvertedMessage[];
  leads: readonly ConvertedLead[];
  facts: readonly Readonly<{ type: string; value: string }>[];
}>;

export type ConversionResult = Readonly<
  | { status: "converted"; value: ConvertedConversation; warnings: readonly string[] }
  | { status: "quarantined"; reasonCode: string; detail: string }
  | { status: "skipped"; reasonCode: "legacy_soft_deleted" }
>;

function stableUuid(seed: string) {
  const bytes = createHash("sha256").update(seed).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function deterministicLegacyId(tenantId: string, entityType: string, sourceId: string) {
  return stableUuid(`djay-voice-text-v2:${tenantId}:${entityType}:${sourceId}`);
}

export function redactedLocator(sourceId: string) {
  return createHash("sha256").update(sourceId).digest("hex").slice(0, 16);
}

function clean(value: string | null | undefined, max: number) {
  const normalized = value?.trim().replace(/\s+/g, " ").slice(0, max) ?? "";
  return normalized || null;
}

function locale(value: string | null | undefined): "en" | "th" {
  return value?.trim().toLowerCase().startsWith("th") ? "th" : "en";
}

function leadStatus(value: string | null | undefined): ConvertedLead["status"] | null {
  const mapping: Record<string, ConvertedLead["status"]> = {
    new: "new",
    pending_follow_up: "pending_follow_up",
    appointment_set: "appointment_made",
    appointment_made: "appointment_made",
    follow_up_later: "not_closed_follow",
    not_closed_follow: "not_closed_follow",
    deal_closed: "closed_deal",
    closed_deal: "closed_deal",
    no_deal: "disqualified",
    disqualified: "disqualified",
  };
  return mapping[value?.trim().toLowerCase() ?? "pending_follow_up"] ?? null;
}

function normalizePhone(value: string) {
  const normalized = value.replace(/[^0-9+]/g, "").toLowerCase();
  return /^\+?[0-9]{7,20}$/.test(normalized) ? normalized : null;
}

function normalizeEmail(value: string) {
  const normalized = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
}

function convertLead(input: LegacyLead, defaultLocale: "en" | "th"): ConvertedLead | null {
  const status = leadStatus(input.status);
  if (!status) return null;
  const displayName = clean(input.client_name, 200) ?? clean(input.name, 200) ?? "Imported visitor";
  const identities: ConvertedIdentity[] = [];
  const email = normalizeEmail(input.email ?? (input.contact_type === "email" ? input.contact ?? "" : ""));
  const phone = normalizePhone(input.phone ?? (input.contact_type === "phone" ? input.contact ?? "" : ""));
  if (email) identities.push({ kind: "email", value: email });
  if (phone) identities.push({ kind: "phone", value: phone });
  const channelValue = clean(input.line_id, 200) ?? clean(input.whatsapp, 200) ?? clean(input.other_contact, 200);
  if (channelValue) identities.push({ kind: "channel", value: channelValue.toLowerCase() });
  const facts = [
    ["need", clean(input.need, 2_000)],
    ["company", clean(input.company_name, 500)],
    ["preferred_contact_method", clean(input.preferred_contact_method, 200)],
    ["preferred_meeting_day", clean(input.preferred_meeting_day, 200)],
    ["preferred_meeting_time", clean(input.preferred_meeting_time, 200) ?? clean(input.preferred_time, 200)],
    ["legacy_admin_note", clean(input.admin_notes, 2_000)],
  ] as const;
  return {
    sourceId: input.id,
    displayName,
    locale: defaultLocale,
    identities,
    title: ((clean(input.need, 160)?.length ?? 0) >= 2 ? clean(input.need, 160)! : `${displayName} enquiry`).slice(0, 200),
    status,
    createdAt: input.created_at,
    updatedAt: input.updated_at ?? input.created_at,
    facts: facts.flatMap(([type, value]) => value ? [{ type, value }] : []),
  };
}

export function convertLegacyLead(input: unknown, defaultLocale: "en" | "th" = "th"): Readonly<
  | { status: "converted"; value: ConvertedLead }
  | { status: "quarantined"; reasonCode: string; detail: string }
> {
  const parsed = legacyLeadSchema.safeParse(input);
  if (!parsed.success) return {
    status: "quarantined",
    reasonCode: "legacy_lead_invalid",
    detail: parsed.error.issues[0]?.message ?? "invalid",
  };
  const converted = convertLead(parsed.data, defaultLocale);
  return converted
    ? { status: "converted", value: converted }
    : { status: "quarantined", reasonCode: "legacy_lead_status_invalid", detail: "unsupported status" };
}

function convertMessage(input: z.infer<typeof legacyMessageSchema>): ConvertedMessage | null {
  const role = input.role.trim().toLowerCase();
  const mapping: Record<string, Pick<ConvertedMessage, "actorType" | "direction">> = {
    user: { actorType: "customer", direction: "inbound" },
    customer: { actorType: "customer", direction: "inbound" },
    assistant: { actorType: "ai", direction: "outbound" },
    ai: { actorType: "ai", direction: "outbound" },
    tool: { actorType: "system", direction: "internal" },
    system: { actorType: "system", direction: "internal" },
  };
  const actor = mapping[role];
  const text = clean(input.content, 20_000);
  return actor && text ? { sourceId: input.id, ...actor, text, createdAt: input.created_at } : null;
}

function transcriptMessages(input: LegacyConversation): ConvertedMessage[] | null {
  if (input.messages.length) {
    const converted = input.messages.map(convertMessage);
    return converted.every((message): message is ConvertedMessage => message !== null) ? converted : null;
  }
  if (!Array.isArray(input.transcript)) return [];
  const converted: ConvertedMessage[] = [];
  for (const [index, item] of input.transcript.slice(0, 2_000).entries()) {
    if (!item || typeof item !== "object") return null;
    const raw = item as Record<string, unknown>;
    const role = typeof raw.role === "string" ? raw.role : "";
    const content = typeof raw.text === "string" ? raw.text : typeof raw.content === "string" ? raw.content : "";
    const at = typeof raw.t === "number" && Number.isFinite(raw.t) ? new Date(raw.t) : input.started_at;
    const message = convertMessage({
      id: stableUuid(`${input.id}:transcript:${index}`),
      conversation_id: input.id,
      channel: input.channel,
      role,
      content,
      created_at: at,
    });
    if (!message) return null;
    converted.push(message);
  }
  return converted;
}

export function convertLegacyConversation(input: unknown): ConversionResult {
  const parsed = legacyConversationSchema.safeParse(input);
  if (!parsed.success) return {
    status: "quarantined",
    reasonCode: "legacy_conversation_invalid",
    detail: parsed.error.issues[0]?.message ?? "invalid",
  };
  if (parsed.data.deleted_at) return { status: "skipped", reasonCode: "legacy_soft_deleted" };
  const expectedMode = parsed.data.channel === "voice_widget" ? "voice" : "text";
  if (parsed.data.interaction_mode !== expectedMode) return {
    status: "quarantined",
    reasonCode: "legacy_channel_mode_mismatch",
    detail: `${parsed.data.channel}:${parsed.data.interaction_mode}`,
  };
  const messages = transcriptMessages(parsed.data);
  if (!messages) return { status: "quarantined", reasonCode: "legacy_message_invalid", detail: "unsupported role or content" };
  const language = locale(parsed.data.language);
  const leads = parsed.data.leads.map((lead) => convertLead(lead, language));
  if (leads.some((lead) => lead === null)) return { status: "quarantined", reasonCode: "legacy_lead_status_invalid", detail: "unsupported status" };
  const closedAt = parsed.data.ended_at ?? parsed.data.last_message_at ?? parsed.data.started_at;
  const facts = [
    ["business_type", clean(parsed.data.business_type, 500)],
    ["main_problem", clean(parsed.data.main_problem, 2_000)],
    ["business_goal", clean(parsed.data.business_goal, 2_000)],
    ["interest_level", clean(parsed.data.interest_level, 200)],
    ["concern_or_objection", clean(parsed.data.concern_or_objection, 2_000)],
    ["recommended_service", clean(parsed.data.recommended_service, 1_000)],
    ["next_action", clean(parsed.data.next_action, 1_000)],
  ] as const;
  return {
    status: "converted",
    warnings: parsed.data.language && !/^(th|en)/i.test(parsed.data.language) ? ["language_defaulted_to_en"] : [],
    value: {
      sourceId: parsed.data.id,
      productKey: parsed.data.channel === "voice_widget" ? "voice" : "ai_chat",
      channelKind: parsed.data.channel === "voice_widget" ? "voice" : "web",
      locale: language,
      startedAt: parsed.data.started_at,
      closedAt: closedAt < parsed.data.started_at ? parsed.data.started_at : closedAt,
      durationSeconds: parsed.data.duration_seconds ?? null,
      summary: clean(parsed.data.summary, 5_000),
      starred: parsed.data.starred ?? false,
      messages: messages.sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime()),
      leads: leads as ConvertedLead[],
      facts: facts.flatMap(([type, value]) => value ? [{ type, value }] : []),
    },
  };
}
