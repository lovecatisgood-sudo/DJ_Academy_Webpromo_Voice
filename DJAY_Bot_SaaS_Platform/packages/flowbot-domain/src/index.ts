import { flowbotOperationKeyPattern, flowbotOperationsFieldLimits, isSupportedIanaTimezone } from "@djay/shared";
import { z } from "zod";

const localizedTextSchema = z.object({ th: z.string().max(10_000), en: z.string().max(10_000) }).strict();
const nextNodeSchema = z.uuid().nullable();
const baseNode = { id: z.uuid(), title: z.string().trim().min(1).max(160) } as const;

const formFieldSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  label: localizedTextSchema,
  type: z.enum(["text", "email", "phone", "textarea"]),
  required: z.boolean(),
}).strict();

export const coreFlowNodeTypes = [
  "message", "media_reference", "options", "input_capture", "form", "condition", "jump", "end",
] as const;
export const premiumFlowNodeTypes = [
  "advanced_condition", "variable_set", "delay", "subflow", "business_hours", "team_route", "webhook",
] as const;
export const flowNodeTypes = [...coreFlowNodeTypes, ...premiumFlowNodeTypes] as const;
export type FlowNodeType = (typeof flowNodeTypes)[number];

export const flowNodeSchema = z.discriminatedUnion("type", [
  z.object({ ...baseNode, type: z.literal("message"), content: localizedTextSchema, nextNodeId: nextNodeSchema }).strict(),
  z.object({ ...baseNode, type: z.literal("media_reference"), assetRef: z.string().min(1).max(500), label: localizedTextSchema, nextNodeId: nextNodeSchema }).strict(),
  z.object({ ...baseNode, type: z.literal("options"), prompt: localizedTextSchema, options: z.array(z.object({ id: z.uuid(), label: localizedTextSchema, targetNodeId: z.uuid() }).strict()).min(1).max(8) }).strict(),
  z.object({ ...baseNode, type: z.literal("input_capture"), prompt: localizedTextSchema, variableKey: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/), nextNodeId: z.uuid() }).strict(),
  z.object({ ...baseNode, type: z.literal("form"), prompt: localizedTextSchema, fields: z.array(formFieldSchema).min(1).max(20), nextNodeId: nextNodeSchema }).strict(),
  z.object({ ...baseNode, type: z.literal("condition"), variableKey: z.string().min(1).max(64), operator: z.enum(["equals", "not_equals", "exists"]), value: z.string().max(1000).optional(), trueNodeId: z.uuid(), falseNodeId: z.uuid() }).strict(),
  z.object({ ...baseNode, type: z.literal("jump"), targetNodeId: z.uuid() }).strict(),
  z.object({ ...baseNode, type: z.literal("end"), message: localizedTextSchema.optional() }).strict(),
  z.object({ ...baseNode, type: z.literal("advanced_condition"), mode: z.enum(["all", "any"]), clauses: z.array(z.object({ variableKey: z.string().min(1).max(64), operator: z.enum(["equals", "not_equals", "contains", "greater_than", "less_than", "exists"]), value: z.string().max(1000).optional() }).strict()).min(1).max(20), trueNodeId: z.uuid(), falseNodeId: z.uuid() }).strict(),
  z.object({ ...baseNode, type: z.literal("variable_set"), variableKey: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/), valueTemplate: z.string().max(5000), nextNodeId: z.uuid() }).strict(),
  z.object({ ...baseNode, type: z.literal("delay"), delaySeconds: z.number().int().min(1).max(2_592_000), nextNodeId: z.uuid() }).strict(),
  z.object({ ...baseNode, type: z.literal("subflow"), targetFlowVersionId: z.uuid(), returnNodeId: z.uuid().nullable() }).strict(),
  z.object({ ...baseNode, type: z.literal("business_hours"), timezone: z.string().min(3).max(64), scheduleKey: z.string().regex(flowbotOperationKeyPattern), openNodeId: z.uuid(), closedNodeId: z.uuid() }).strict(),
  z.object({ ...baseNode, type: z.literal("team_route"), teamKey: z.string().regex(flowbotOperationKeyPattern), strategy: z.enum(["owner", "round_robin", "least_active"]), message: localizedTextSchema.optional() }).strict(),
  z.object({ ...baseNode, type: z.literal("webhook"), integrationProfileId: z.uuid(), templateKey: z.string().min(2).max(100), nextNodeId: z.uuid(), failureNodeId: z.uuid() }).strict(),
]);
export type FlowNode = z.infer<typeof flowNodeSchema>;

export const flowKeywordSchema = z.object({
  id: z.uuid(), nodeId: z.uuid(), keyword: z.string().trim().min(1).max(120),
  lang: z.enum(["th", "en"]), priority: z.number().int().min(0).max(1000).default(100),
  substringEnabled: z.boolean().default(true), order: z.number().int().nonnegative().default(0),
}).strict();

export const flowSnapshotSchema = z.object({
  schemaVersion: z.literal(1), flowVersionId: z.uuid(), rootNodeId: z.uuid(),
  nodes: z.record(z.uuid(), flowNodeSchema), keywords: z.array(flowKeywordSchema).max(2000).default([]),
  embeddedSubflows: z.record(z.uuid(), z.object({
    rootNodeId: z.uuid(), nodes: z.record(z.uuid(), flowNodeSchema),
    keywords: z.array(flowKeywordSchema).max(2000).default([]),
  }).strict()).optional(),
}).strict();
export type FlowSnapshot = z.infer<typeof flowSnapshotSchema>;

export const flowInputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start"), payload: z.object({}).strict() }).strict(),
  z.object({ type: z.literal("text"), payload: z.object({ text: z.string().trim().min(1).max(4000) }).strict() }).strict(),
  z.object({ type: z.literal("option"), payload: z.object({ optionId: z.uuid() }).strict() }).strict(),
  z.object({ type: z.literal("form"), payload: z.object({ nodeId: z.uuid(), data: z.record(z.string(), z.string().max(5000)) }).strict() }).strict(),
  z.object({ type: z.literal("timer_fired"), payload: z.object({ timerId: z.uuid(), nodeId: z.uuid() }).strict() }).strict(),
  z.object({ type: z.literal("webhook_result"), payload: z.object({ dispatchId: z.uuid(), nodeId: z.uuid(), success: z.boolean() }).strict() }).strict(),
  z.object({ type: z.literal("action"), payload: z.object({ action: z.enum(["restart", "return_to_flow"]) }).strict() }).strict(),
]);
export type FlowInput = z.infer<typeof flowInputSchema>;

export const publicFlowInputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), payload: z.object({ text: z.string().trim().min(1).max(4000) }).strict() }).strict(),
  z.object({ type: z.literal("option"), payload: z.object({ optionId: z.uuid() }).strict() }).strict(),
  z.object({ type: z.literal("form"), payload: z.object({ nodeId: z.uuid(), data: z.record(z.string(), z.string().max(5000)) }).strict() }).strict(),
  z.object({ type: z.literal("action"), payload: z.object({ action: z.enum(["restart", "return_to_flow"]) }).strict() }).strict(),
]);
export type PublicFlowInput = z.infer<typeof publicFlowInputSchema>;

export const flowExecutionStateSchema = z.object({
  currentNodeId: z.uuid().nullable(), status: z.enum(["active", "waiting", "handover", "completed"]),
  lang: z.enum(["th", "en"]), variables: z.record(z.string(), z.string()).default({}),
  subflowStack: z.array(z.object({ flowVersionId: z.uuid(), returnNodeId: z.uuid().nullable() }).strict()).max(20).default([]),
  activeFlowVersionId: z.uuid().optional(),
}).strict();
export type FlowExecutionState = z.infer<typeof flowExecutionStateSchema>;

export type FlowEntitlements = Readonly<{
  planKey: "flowbot_basic" | "flowbot_premium";
  accessMode: "none" | "read_only" | "active";
  entitlements: Readonly<Record<string, boolean | string | number | null>>;
  limits: Readonly<Record<string, number | null>>;
}>;

export type FlowValidationIssue = Readonly<{ code: string; nodeId?: string; detail?: string }>;

export const flowBusinessScheduleSchema = z.object({
  scheduleKey: z.string().trim().regex(flowbotOperationKeyPattern),
  timezone: z.string().trim()
    .min(flowbotOperationsFieldLimits.timezone.minLength)
    .max(flowbotOperationsFieldLimits.timezone.maxLength)
    .refine(isSupportedIanaTimezone),
  weeklyWindows: z.array(z.object({
    dayOfWeek: z.number().int().min(0).max(6),
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(1).max(1440),
  }).strict().refine((window) => window.endMinute > window.startMinute, "endMinute must be after startMinute")).max(100),
  closedDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(366).default([]),
}).strict();
export type FlowBusinessSchedule = z.infer<typeof flowBusinessScheduleSchema>;

const weekdayNumber: Readonly<Record<string, number>> = Object.freeze({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 });

export function isWithinFlowBusinessSchedule(scheduleInput: FlowBusinessSchedule, instant: string): boolean {
  const schedule = flowBusinessScheduleSchema.parse(scheduleInput);
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) return false;
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: schedule.timezone, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(date);
  } catch {
    return false;
  }
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const dayOfWeek = weekdayNumber[value("weekday")];
  const localDate = `${value("year")}-${value("month")}-${value("day")}`;
  const minute = Number(value("hour")) * 60 + Number(value("minute"));
  if (dayOfWeek === undefined || schedule.closedDates.includes(localDate)) return false;
  return schedule.weeklyWindows.some((window) => window.dayOfWeek === dayOfWeek && minute >= window.startMinute && minute < window.endMinute);
}

const nodeEntitlement: Partial<Record<FlowNodeType, readonly [string, boolean | string]>> = {
  advanced_condition: ["flow.nodes.advanced", true],
  variable_set: ["flow.variables", true],
  delay: ["flow.delays", true],
  subflow: ["flow.subflows", true],
  business_hours: ["flow.business_hours", true],
  team_route: ["flow.team_routing", true],
  webhook: ["flow.webhook", "approved"],
};

export function flowNodeEntitlementIssue(node: FlowNode, authority: FlowEntitlements): FlowValidationIssue | null {
  const requirement = nodeEntitlement[node.type];
  if (!requirement) return null;
  const [key, expected] = requirement;
  return authority.entitlements[key] === expected
    ? null
    : { code: "node_entitlement_missing", nodeId: node.id, detail: `${node.type}:${key}` };
}

function references(node: FlowNode): readonly string[] {
  switch (node.type) {
    case "message": case "media_reference": case "form": return node.nextNodeId ? [node.nextNodeId] : [];
    case "input_capture": case "variable_set": case "delay": return [node.nextNodeId];
    case "options": return node.options.map((option) => option.targetNodeId);
    case "condition": case "advanced_condition": return [node.trueNodeId, node.falseNodeId];
    case "jump": return [node.targetNodeId];
    case "business_hours": return [node.openNodeId, node.closedNodeId];
    case "webhook": return [node.nextNodeId, node.failureNodeId];
    default: return [];
  }
}

export function validateFlowForPublish(snapshotInput: unknown, authority: FlowEntitlements): readonly FlowValidationIssue[] {
  const parsed = flowSnapshotSchema.safeParse(snapshotInput);
  if (!parsed.success) {
    const detail = parsed.error.issues[0]?.message;
    return [{ code: "invalid_snapshot", ...(detail ? { detail } : {}) }];
  }
  const snapshot = parsed.data; const issues: FlowValidationIssue[] = [];
  if (authority.accessMode !== "active") issues.push({ code: "subscription_not_active" });
  if (authority.entitlements["ai.enabled"] !== false) issues.push({ code: "non_ai_invariant_failed" });
  if (!snapshot.nodes[snapshot.rootNodeId]) issues.push({ code: "root_node_missing" });
  const nodes = Object.values(snapshot.nodes);
  if (nodes.length > 500) issues.push({ code: "absolute_node_safety_limit" });
  const configuredLimit = authority.limits.flow_nodes_per_bot;
  if (typeof configuredLimit === "number" && nodes.length > configuredLimit) issues.push({ code: "plan_node_limit_exceeded" });
  for (const node of nodes) {
    if (premiumFlowNodeTypes.includes(node.type as (typeof premiumFlowNodeTypes)[number]) && authority.entitlements["flow.nodes.advanced"] !== true) issues.push({ code: "premium_node_not_entitled", nodeId: node.id, detail: node.type });
    const entitlementIssue = flowNodeEntitlementIssue(node, authority);
    if (entitlementIssue) issues.push(entitlementIssue);
    for (const target of references(node)) if (!snapshot.nodes[target]) issues.push({ code: "target_node_missing", nodeId: node.id, detail: target });
  }
  for (const keyword of snapshot.keywords) if (!snapshot.nodes[keyword.nodeId]) issues.push({ code: "keyword_target_missing", detail: keyword.id });
  return issues;
}

export type DowngradeState = Readonly<{ snapshots: readonly FlowSnapshot[]; activeBotCount: number; brandingRemoved: boolean; approvedIntegrationCount: number }>;
export function flowbotDowngradeBlockers(state: DowngradeState, destination: FlowEntitlements): readonly FlowValidationIssue[] {
  const blockers: FlowValidationIssue[] = [];
  for (const snapshot of state.snapshots) for (const node of Object.values(snapshot.nodes)) {
    if (premiumFlowNodeTypes.includes(node.type as (typeof premiumFlowNodeTypes)[number])) blockers.push({ code: "premium_node_present", nodeId: node.id, detail: node.type });
  }
  const botLimit = destination.limits.active_bots;
  if (typeof botLimit === "number" && state.activeBotCount > botLimit) blockers.push({ code: "active_bot_limit_exceeded" });
  if (state.brandingRemoved && destination.entitlements["branding.remove"] !== true) blockers.push({ code: "branding_dependency" });
  if (state.approvedIntegrationCount > 0 && destination.entitlements["flow.webhook"] !== "approved") blockers.push({ code: "integration_dependency" });
  return blockers;
}
