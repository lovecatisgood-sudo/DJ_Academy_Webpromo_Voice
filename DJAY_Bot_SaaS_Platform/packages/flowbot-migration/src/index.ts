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
