import { createHash } from "node:crypto";
import { flowSnapshotSchema, type FlowSnapshot } from "@djay/flowbot-domain";
import { z } from "zod";

const localizedLegacyNodeSchema = z.object({
  id: z.uuid(),
  type: z.enum(["message", "options", "cta_link", "cta_lead_form", "cta_contact_card", "cta_live_chat", "cta_scheduler"]),
  title: z.string(), contentTh: z.string(), contentEn: z.string(),
  nextNodeId: z.uuid().nullable().optional(),
  options: z.array(z.object({ id: z.uuid(), labelTh: z.string(), labelEn: z.string(), targetNodeId: z.uuid() }).strict()).default([]),
  config: z.record(z.string(), z.unknown()).default({}),
}).strict();

export const legacyFlowSnapshotSchema = z.object({
  flowVersionId: z.uuid(), rootNodeId: z.uuid(),
  nodes: z.record(z.uuid(), localizedLegacyNodeSchema),
  keywords: z.array(z.object({
    nodeId: z.uuid(), keyword: z.string().min(1), lang: z.enum(["th", "en"]),
    priority: z.number().int().default(100), substringEnabled: z.boolean().default(true), order: z.number().int().nonnegative().default(0),
  }).strict()).default([]),
}).strict();

function stableUuid(seed: string) {
  const bytes = createHash("sha256").update(seed).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const builderFlowFieldSchema = z.object({
  label: z.string().trim().min(1).max(200),
  type: z.enum(["text", "email", "phone", "tel", "textarea"]),
  required: z.boolean(),
}).strict();

const builderFlowNodeSchema = z.object({
  id: z.string().trim().min(1).max(200),
  type: z.enum(["message", "options", "input", "form", "card", "handover", "end"]),
  title: z.string().trim().min(1).max(160),
  en: z.string().trim().min(1).max(5000),
  th: z.string().trim().min(1).max(5000),
  x: z.number().finite().min(-1_000_000).max(1_000_000),
  y: z.number().finite().min(-1_000_000).max(1_000_000),
  keywords: z.array(z.string().trim().min(1).max(120)).max(100).default([]),
  next: z.string().trim().min(1).max(200).nullable().default(null),
  options: z.array(z.object({
    en: z.string().trim().min(1).max(5000),
    th: z.string().trim().min(1).max(5000),
    target: z.string().trim().min(1).max(200),
  }).strict()).max(8).default([]),
  fields: z.array(builderFlowFieldSchema).max(20).default([]),
}).passthrough();

const builderFlowDraftSchema = z.object({
  template: z.enum(["faq", "lead", "appointment", "product", "support", "blank"]).optional(),
  identity: z.object({
    botName: z.string().trim().min(2).max(160),
    languageMode: z.literal("customer-choice").optional(),
    greetingEn: z.string().trim().min(1).max(5000).optional(),
    greetingTh: z.string().trim().min(1).max(5000).optional(),
    brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    position: z.enum(["Bottom right", "Bottom left"]).optional(),
    businessHours: z.string().trim().max(1000).optional(),
    handoverContact: z.string().trim().max(500).optional(),
    privacyUrl: z.string().trim().max(2000).optional(),
  }).passthrough(),
  lead: z.object({ fields: z.array(builderFlowFieldSchema).max(20), consent: z.string().trim().max(2000) }).strict().optional(),
  handover: z.object({
    team: z.string().trim().max(160), fallbackEn: z.string().trim().max(5000),
    fallbackTh: z.string().trim().max(5000), outsideHours: z.string().trim().max(2000),
  }).strict().optional(),
  widget: z.object({ domain: z.string().trim().max(2000), openOnLoad: z.boolean() }).strict().optional(),
  nodes: z.array(builderFlowNodeSchema).min(1).max(500),
  entryId: z.string().trim().min(1).max(200),
}).passthrough().superRefine((draft, context) => {
  const ids = new Set(draft.nodes.map((node) => node.id));
  if (ids.size !== draft.nodes.length) context.addIssue({ code: "custom", path: ["nodes"], message: "duplicate_node_id" });
  if (!ids.has(draft.entryId)) context.addIssue({ code: "custom", path: ["entryId"], message: "entry_node_missing" });
  draft.nodes.forEach((node, index) => {
    if (["message", "input", "form", "card"].includes(node.type) && node.next && !ids.has(node.next)) {
      context.addIssue({ code: "custom", path: ["nodes", index, "next"], message: "next_node_missing" });
    }
    if (node.type === "input" && !node.next) context.addIssue({ code: "custom", path: ["nodes", index, "next"], message: "input_destination_required" });
    if (node.type === "options" && node.options.length === 0) context.addIssue({ code: "custom", path: ["nodes", index, "options"], message: "options_required" });
    if (node.type === "form" && node.fields.length === 0) context.addIssue({ code: "custom", path: ["nodes", index, "fields"], message: "fields_required" });
    node.options.forEach((option, optionIndex) => {
      if (!ids.has(option.target)) context.addIssue({ code: "custom", path: ["nodes", index, "options", optionIndex, "target"], message: "option_target_missing" });
    });
  });
});

const claimedBuilderStateSchema = z.object({
  schemaVersion: z.literal(1),
  locale: z.enum(["th", "en"]),
  family: z.literal("flow").optional(),
  configuration: z.object({ flowDraft: builderFlowDraftSchema }).passthrough(),
}).passthrough();

function builderFieldKey(label: string, index: number, used: Set<string>) {
  const normalized = label.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const base = /^[a-z]/.test(normalized) ? normalized.slice(0, 56) : `field_${index + 1}`;
  let key = base;
  for (let suffix = 2; used.has(key); suffix += 1) key = `${base.slice(0, 56)}_${suffix}`;
  used.add(key);
  return key;
}

function convertBuilderFields(source: readonly z.infer<typeof builderFlowFieldSchema>[]) {
  const used = new Set<string>();
  return source.map((field, index) => ({
    key: builderFieldKey(field.label, index, used), label: { en: field.label, th: field.label },
    type: field.type === "tel" ? "phone" as const : field.type, required: field.required,
  }));
}

/** Converts the approved anonymous Flow Builder shape into the production deterministic graph. */
export function convertClaimedBuilderFlow(input: unknown, targetFlowVersionId: string): Readonly<{
  status: "converted"; snapshot: FlowSnapshot; botName: string; defaultLanguage: "th" | "en"; warnings: readonly string[];
} | { status: "invalid"; reasonCode: string; detail: string }> {
  const parsed = claimedBuilderStateSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid", reasonCode: "builder_flow_invalid", detail: parsed.error.issues[0]?.message ?? "invalid" };
  const source = parsed.data.configuration.flowDraft;
  const nodeIds = new Map(source.nodes.map((node) => [node.id, stableUuid(`${targetFlowVersionId}:builder-node:${node.id}`)]));
  const targetId = (id: string | null) => id ? nodeIds.get(id) ?? null : null;
  const warnings = source.nodes.some((node) => node.type === "card") ? ["card_materialized_as_message"] : [];
  try {
    const nodes = Object.fromEntries(source.nodes.map((node, index) => {
      const id = nodeIds.get(node.id)!;
      const localized = { th: node.th, en: node.en };
      if (node.type === "options") return [id, {
        id, type: "options", title: node.title, prompt: localized,
        options: node.options.map((option, optionIndex) => ({
          id: stableUuid(`${targetFlowVersionId}:builder-option:${node.id}:${optionIndex}`),
          label: { th: option.th, en: option.en }, targetNodeId: targetId(option.target),
        })),
      }];
      if (node.type === "input") return [id, {
        id, type: "input_capture", title: node.title, prompt: localized,
        variableKey: `answer_${index + 1}`, nextNodeId: targetId(node.next),
      }];
      if (node.type === "form") {
        return [id, {
          id, type: "form", title: node.title, prompt: localized,
          fields: convertBuilderFields(node.fields),
          nextNodeId: targetId(node.next),
        }];
      }
      if (node.type === "handover") return [id, { id, type: "handover", title: node.title, message: localized }];
      if (node.type === "end") return [id, { id, type: "end", title: node.title, message: localized }];
      return [id, { id, type: "message", title: node.title, content: localized, nextNodeId: targetId(node.next) }];
    }));
    const keywords = source.nodes.flatMap((node, nodeIndex) => node.keywords.flatMap((keyword, keywordIndex) => (["en", "th"] as const).map((lang) => ({
      id: stableUuid(`${targetFlowVersionId}:builder-keyword:${node.id}:${keywordIndex}:${lang}`),
      nodeId: nodeIds.get(node.id)!, keyword, lang, priority: 100, substringEnabled: true,
      order: nodeIndex * 200 + keywordIndex * 2 + (lang === "th" ? 1 : 0),
    }))));
    const snapshot = flowSnapshotSchema.parse({
      schemaVersion: 1, flowVersionId: targetFlowVersionId,
      rootNodeId: nodeIds.get(source.entryId), nodes, keywords,
      authoring: {
        ...(source.template ? { templateKey: source.template } : {}),
        identity: {
          ...(source.identity.greetingEn && source.identity.greetingTh
            ? { greeting: { en: source.identity.greetingEn, th: source.identity.greetingTh } } : {}),
          ...(source.identity.brandColor ? { brandColor: source.identity.brandColor } : {}),
          ...(source.identity.position ? { widgetPosition: source.identity.position === "Bottom left" ? "bottom_left" : "bottom_right" } : {}),
          ...(source.identity.businessHours !== undefined ? { businessHours: source.identity.businessHours } : {}),
          ...(source.identity.handoverContact !== undefined ? { handoverContact: source.identity.handoverContact } : {}),
          ...(source.identity.privacyUrl !== undefined ? { privacyUrl: source.identity.privacyUrl } : {}),
        },
        ...(source.lead ? { lead: { fields: convertBuilderFields(source.lead.fields), consent: source.lead.consent } } : {}),
        ...(source.handover ? { handover: { teamLabel: source.handover.team,
          fallback: { en: source.handover.fallbackEn, th: source.handover.fallbackTh },
          outsideHoursMessage: source.handover.outsideHours } } : {}),
        ...(source.widget ? { widget: source.widget } : {}),
      },
      editor: { positions: Object.fromEntries(source.nodes.map((node) => [nodeIds.get(node.id), { x: node.x, y: node.y }])) },
    });
    return { status: "converted", snapshot, botName: source.identity.botName, defaultLanguage: parsed.data.locale, warnings };
  } catch (error) {
    return { status: "invalid", reasonCode: "builder_flow_target_invalid", detail: error instanceof Error ? error.message.slice(0, 300) : "invalid" };
  }
}

function fields(config: Record<string, unknown>) {
  if (!Array.isArray(config.fields)) return [
    { key: "name", label: { th: "ชื่อ", en: "Name" }, type: "text" as const, required: true },
    { key: "phone", label: { th: "เบอร์โทร", en: "Phone" }, type: "phone" as const, required: true },
    { key: "email", label: { th: "อีเมล", en: "Email" }, type: "email" as const, required: false },
  ];
  return config.fields.flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const field = raw as Record<string, unknown>;
    const rawKey = String(field.name ?? field.key ?? `field_${index + 1}`).toLowerCase().replace(/[^a-z0-9_]/g, "_");
    const key = /^[a-z]/.test(rawKey) ? rawKey.slice(0, 64) : `field_${index + 1}`;
    const rawType = String(field.type ?? key);
    const type = rawType.includes("email") ? "email" as const : rawType.includes("phone") ? "phone" as const : rawType.includes("textarea") ? "textarea" as const : "text" as const;
    return [{ key, label: { th: String(field.labelTh ?? field.label ?? key), en: String(field.labelEn ?? field.label ?? key) }, type, required: field.required !== false }];
  }).slice(0, 20);
}

export function convertLegacyFlowSnapshot(input: unknown, targetFlowVersionId: string): Readonly<{
  status: "converted"; snapshot: FlowSnapshot; warnings: readonly string[];
} | { status: "quarantined"; reasonCode: string; detail: string }> {
  const parsed = legacyFlowSnapshotSchema.safeParse(input);
  if (!parsed.success) return { status: "quarantined", reasonCode: "legacy_snapshot_invalid", detail: parsed.error.issues[0]?.message ?? "invalid" };
  const unsupported = Object.values(parsed.data.nodes).filter((node) => !["message", "options", "cta_lead_form"].includes(node.type));
  if (unsupported.length) return {
    status: "quarantined", reasonCode: "legacy_node_requires_remediation",
    detail: [...new Set(unsupported.map((node) => node.type))].sort().join(","),
  };
  try {
    const snapshot = flowSnapshotSchema.parse({
      schemaVersion: 1, flowVersionId: targetFlowVersionId,
      rootNodeId: parsed.data.rootNodeId,
      nodes: Object.fromEntries(Object.values(parsed.data.nodes).map((node) => {
        if (node.type === "message") return [node.id, { id: node.id, type: "message", title: node.title, content: { th: node.contentTh, en: node.contentEn }, nextNodeId: node.nextNodeId ?? null }];
        if (node.type === "options") return [node.id, { id: node.id, type: "options", title: node.title, prompt: { th: node.contentTh, en: node.contentEn }, options: node.options.map((option) => ({ id: option.id, label: { th: option.labelTh, en: option.labelEn }, targetNodeId: option.targetNodeId })) }];
        return [node.id, { id: node.id, type: "form", title: node.title, prompt: { th: node.contentTh, en: node.contentEn }, fields: fields(node.config), nextNodeId: node.nextNodeId ?? null }];
      })),
      keywords: parsed.data.keywords.map((keyword, index) => ({
        id: stableUuid(`${targetFlowVersionId}:keyword:${index}:${keyword.nodeId}:${keyword.lang}:${keyword.keyword}`),
        ...keyword,
      })),
    });
    return { status: "converted", snapshot, warnings: [] };
  } catch (error) {
    return { status: "quarantined", reasonCode: "target_snapshot_invalid", detail: error instanceof Error ? error.message.slice(0, 300) : "invalid" };
  }
}

export function deterministicMigrationId(tenantId: string, entityType: string, sourceId: string) {
  return stableUuid(`djay-flowbot-v1:${tenantId}:${entityType}:${sourceId}`);
}
