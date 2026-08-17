import {
  flowbotEditorFieldLimits,
  flowbotOperationKeyPattern,
  flowbotOperationsFieldLimits,
  isSupportedIanaTimezone,
} from "@djay/shared";
import { z } from "zod";

const localizedTextSchema = z.object({
  th: z.string().max(flowbotEditorFieldLimits.localizedText.maxLength),
  en: z.string().max(flowbotEditorFieldLimits.localizedText.maxLength),
}).strict();
const httpsUrlSchema = z.string().trim().min(1).max(2000).url().refine((value) => new URL(value).protocol === "https:", "URL must use HTTPS");
const telephoneUrlSchema = z.string().trim().max(64).regex(/^tel:\+?[0-9(). -]{7,30}$/);
const nextNodeSchema = z.uuid().nullable();
const baseNode = {
  id: z.uuid(),
  title: z.string().trim().min(flowbotEditorFieldLimits.title.minLength).max(flowbotEditorFieldLimits.title.maxLength),
} as const;

const formFieldSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  label: localizedTextSchema,
  type: z.enum(["text", "email", "phone", "textarea"]),
  required: z.boolean(),
}).strict();

export const flowActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("call"), label: localizedTextSchema, url: telephoneUrlSchema }).strict(),
  z.object({ type: z.literal("line"), label: localizedTextSchema, url: httpsUrlSchema }).strict(),
  z.object({ type: z.literal("website"), label: localizedTextSchema, url: httpsUrlSchema }).strict(),
  z.object({ type: z.literal("booking"), label: localizedTextSchema, url: httpsUrlSchema }).strict(),
  z.object({ type: z.literal("checkout"), label: localizedTextSchema, url: httpsUrlSchema }).strict(),
]);
export type FlowAction = z.infer<typeof flowActionSchema>;

const flowCardSchema = z.object({
  id: z.uuid(),
  kind: z.enum(["product", "service"]),
  title: localizedTextSchema,
  description: localizedTextSchema,
  imageUrl: httpsUrlSchema.optional(),
  priceLabel: localizedTextSchema.optional(),
  actions: z.array(flowActionSchema).max(5).default([]),
}).strict();

export const coreFlowNodeTypes = [
  "message", "media_reference", "product_card", "carousel", "actions", "options", "input_capture", "form", "condition", "jump", "handover", "end",
] as const;
export const premiumFlowNodeTypes = [
  "advanced_condition", "variable_set", "delay", "subflow", "business_hours", "team_route", "webhook",
] as const;
export const flowNodeTypes = [...coreFlowNodeTypes, ...premiumFlowNodeTypes] as const;
export type FlowNodeType = (typeof flowNodeTypes)[number];

export const flowNodeSchema = z.discriminatedUnion("type", [
  z.object({ ...baseNode, type: z.literal("message"), content: localizedTextSchema, nextNodeId: nextNodeSchema }).strict(),
  z.object({ ...baseNode, type: z.literal("media_reference"), assetRef: httpsUrlSchema, mediaType: z.enum(["image", "video"]).default("image"), label: localizedTextSchema, nextNodeId: nextNodeSchema }).strict(),
  z.object({ ...baseNode, type: z.literal("product_card"), card: flowCardSchema, nextNodeId: nextNodeSchema }).strict(),
  z.object({ ...baseNode, type: z.literal("carousel"), cards: z.array(flowCardSchema).min(1).max(10), nextNodeId: nextNodeSchema }).strict(),
  z.object({ ...baseNode, type: z.literal("actions"), prompt: localizedTextSchema.optional(), actions: z.array(flowActionSchema).min(1).max(8), nextNodeId: nextNodeSchema }).strict(),
  z.object({ ...baseNode, type: z.literal("options"), prompt: localizedTextSchema, options: z.array(z.object({ id: z.uuid(), label: localizedTextSchema, targetNodeId: z.uuid() }).strict()).min(1).max(8) }).strict(),
  z.object({ ...baseNode, type: z.literal("input_capture"), prompt: localizedTextSchema, variableKey: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/), nextNodeId: z.uuid() }).strict(),
  z.object({ ...baseNode, type: z.literal("form"), prompt: localizedTextSchema, fields: z.array(formFieldSchema).min(1).max(20), nextNodeId: nextNodeSchema }).strict(),
  z.object({ ...baseNode, type: z.literal("condition"), variableKey: z.string().min(1).max(64), operator: z.enum(["equals", "not_equals", "exists"]), value: z.string().max(1000).optional(), trueNodeId: z.uuid(), falseNodeId: z.uuid() }).strict(),
  z.object({ ...baseNode, type: z.literal("jump"), targetNodeId: z.uuid() }).strict(),
  // Core handover uses the tenant's default inbox. Named-team and routing-strategy selection remain Premium-only.
  z.object({ ...baseNode, type: z.literal("handover"), message: localizedTextSchema.optional() }).strict(),
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
  authoring: z.object({
    templateKey: z.enum(["faq", "lead", "appointment", "product", "support", "blank"]).optional(),
    identity: z.object({
      greeting: localizedTextSchema.optional(),
      brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      widgetPosition: z.enum(["bottom_right", "bottom_left"]).optional(),
      businessHours: z.string().trim().max(1000).optional(),
      handoverContact: z.string().trim().max(500).optional(),
      privacyUrl: z.union([z.literal(""), httpsUrlSchema]).optional(),
    }).strict().optional(),
    lead: z.object({
      fields: z.array(formFieldSchema).max(20),
      consent: z.string().trim().max(2000),
    }).strict().optional(),
    handover: z.object({
      teamLabel: z.string().trim().max(160),
      fallback: localizedTextSchema,
      outsideHoursMessage: z.string().trim().max(2000),
    }).strict().optional(),
    widget: z.object({ domain: z.string().trim().max(2000), openOnLoad: z.boolean() }).strict().optional(),
  }).strict().optional(),
  editor: z.object({
    positions: z.record(z.uuid(), z.object({
      x: z.number().finite().min(-1_000_000).max(1_000_000),
      y: z.number().finite().min(-1_000_000).max(1_000_000),
    }).strict()).default({}),
  }).strict().optional(),
  embeddedSubflows: z.record(z.uuid(), z.object({
    rootNodeId: z.uuid(), nodes: z.record(z.uuid(), flowNodeSchema),
    keywords: z.array(flowKeywordSchema).max(2000).default([]),
  }).strict()).optional(),
}).strict();
export type FlowSnapshot = z.infer<typeof flowSnapshotSchema>;

export const flowStarterTemplateKeys = ["faq", "lead", "appointment", "product", "support", "blank"] as const;
export type FlowStarterTemplateKey = (typeof flowStarterTemplateKeys)[number];

/** Creates one editable tenant draft from an approved deterministic starting journey. */
export function createFlowStarterTemplate(templateKey: FlowStarterTemplateKey, createId: () => string): FlowSnapshot {
  const id = () => z.uuid().parse(createId());
  const flowVersionId = id();
  const finish = (rootNodeId: string, nodes: FlowSnapshot["nodes"], authoring: AuthoringSeed = {}) => flowSnapshotSchema.parse({
    schemaVersion: 1, flowVersionId, rootNodeId, nodes, keywords: [],
    authoring: { ...authoring, templateKey },
  });
  type NodeMap = FlowSnapshot["nodes"];
  type AuthoringSeed = Omit<NonNullable<FlowSnapshot["authoring"]>, "templateKey">;

  if (templateKey === "blank") {
    const welcome = id();
    return finish(welcome, { [welcome]: { id: welcome, type: "message", title: "Welcome", content: { th: "สวัสดีครับ", en: "Welcome" }, nextNodeId: null } });
  }

  if (templateKey === "faq") {
    const root = id(); const hours = id(); const services = id(); const contact = id(); const handover = id(); const done = id();
    const nodes: NodeMap = {
      [root]: { id: root, type: "options", title: "FAQ and contact", prompt: { th: "สวัสดีครับ ต้องการทราบเรื่องใด?", en: "Welcome. What would you like to know?" }, options: [
        { id: id(), label: { th: "เวลาทำการ", en: "Opening hours" }, targetNodeId: hours },
        { id: id(), label: { th: "บริการ", en: "Services" }, targetNodeId: services },
        { id: id(), label: { th: "ฝากข้อมูลติดต่อ", en: "Leave contact details" }, targetNodeId: contact },
        { id: id(), label: { th: "คุยกับทีมงาน", en: "Talk to the team" }, targetNodeId: handover },
      ] },
      [hours]: { id: hours, type: "options", title: "Opening hours answer", prompt: { th: "เพิ่มเวลาทำการที่อนุมัติของคุณที่นี่", en: "Add your approved opening hours here." }, options: [
        { id: id(), label: { th: "กลับเมนู", en: "Back to menu" }, targetNodeId: root },
        { id: id(), label: { th: "ฝากข้อมูลติดต่อ", en: "Leave contact details" }, targetNodeId: contact },
      ] },
      [services]: { id: services, type: "options", title: "Services answer", prompt: { th: "เพิ่มข้อมูลบริการและราคาที่อนุมัติของคุณที่นี่", en: "Add your approved services and prices here." }, options: [
        { id: id(), label: { th: "กลับเมนู", en: "Back to menu" }, targetNodeId: root },
        { id: id(), label: { th: "คุยกับทีมงาน", en: "Talk to the team" }, targetNodeId: handover },
      ] },
      [contact]: { id: contact, type: "form", title: "Contact details", prompt: { th: "ฝากข้อมูลเพื่อให้ทีมงานติดต่อกลับ", en: "Leave your details for the team to contact you." }, fields: contactFields(), nextNodeId: done },
      [handover]: { id: handover, type: "handover", title: "Human handover", message: { th: "กำลังส่งต่อให้ทีมงาน", en: "Connecting you with the team." } },
      [done]: { id: done, type: "end", title: "Request received", message: { th: "รับข้อมูลแล้ว ทีมงานจะติดต่อกลับ", en: "Your details were received. The team will contact you." } },
    };
    return finish(root, nodes, defaultAuthoring("faq"));
  }

  if (templateKey === "lead") {
    const root = id(); const form = id(); const handover = id(); const done = id();
    return finish(root, {
      [root]: { id: root, type: "options", title: "Lead enquiry", prompt: { th: "สนใจให้เราช่วยเรื่องใด?", en: "What can we help you with?" }, options: [
        { id: id(), label: { th: "สินค้าและบริการ", en: "Products and services" }, targetNodeId: form },
        { id: id(), label: { th: "ขอใบเสนอราคา", en: "Request a quotation" }, targetNodeId: form },
        { id: id(), label: { th: "คุยกับทีมงาน", en: "Talk to the team" }, targetNodeId: handover },
      ] },
      [form]: { id: form, type: "form", title: "Lead details", prompt: { th: "ฝากข้อมูลและสิ่งที่สนใจ", en: "Share your contact details and enquiry." }, fields: [...contactFields(), { key: "interest", label: { th: "สิ่งที่สนใจ", en: "What are you interested in?" }, type: "textarea", required: true }], nextNodeId: done },
      [handover]: { id: handover, type: "handover", title: "Human handover", message: { th: "กำลังส่งต่อให้ทีมงาน", en: "Connecting you with the team." } },
      [done]: { id: done, type: "end", title: "Lead received", message: { th: "รับข้อมูลแล้ว ทีมงานจะติดต่อกลับ", en: "Your details were received. The team will contact you." } },
    }, defaultAuthoring("lead"));
  }

  if (templateKey === "appointment") {
    const root = id(); const form = id(); const handover = id(); const done = id();
    return finish(root, {
      [root]: { id: root, type: "options", title: "Choose a service", prompt: { th: "ต้องการขอนัดหมายบริการใด?", en: "Which service would you like to request?" }, options: [
        { id: id(), label: { th: "บริการหลัก", en: "Main service" }, targetNodeId: form },
        { id: id(), label: { th: "บริการอื่น", en: "Another service" }, targetNodeId: form },
        { id: id(), label: { th: "ขอความช่วยเหลือ", en: "Ask for help" }, targetNodeId: handover },
      ] },
      [form]: { id: form, type: "form", title: "Appointment request", prompt: { th: "แจ้งวันเวลาที่สะดวก ทีมงานจะยืนยันภายหลัง", en: "Share a preferred time. The team will confirm separately." }, fields: [...contactFields(), { key: "preferred_time", label: { th: "วันและเวลาที่สะดวก", en: "Preferred date and time" }, type: "text", required: true }], nextNodeId: done },
      [handover]: { id: handover, type: "handover", title: "Human handover", message: { th: "กำลังส่งต่อให้ทีมงาน", en: "Connecting you with the team." } },
      [done]: { id: done, type: "end", title: "Appointment requested", message: { th: "รับคำขอแล้ว แต่ยังไม่ได้ยืนยันนัดหมาย", en: "Your request was received. The appointment is not yet confirmed." } },
    }, defaultAuthoring("appointment"));
  }

  if (templateKey === "product") {
    const root = id(); const products = id(); const services = id(); const question = id(); const handover = id(); const done = id();
    return finish(root, {
      [root]: { id: root, type: "options", title: "Product or service guide", prompt: { th: "ต้องการดูข้อมูลใด?", en: "What would you like to explore?" }, options: [
        { id: id(), label: { th: "สินค้า", en: "Products" }, targetNodeId: products },
        { id: id(), label: { th: "บริการ", en: "Services" }, targetNodeId: services },
        { id: id(), label: { th: "ถามคำถาม", en: "Ask a question" }, targetNodeId: question },
        { id: id(), label: { th: "ขอความช่วยเหลือ", en: "Request help" }, targetNodeId: handover },
      ] },
      [products]: { id: products, type: "options", title: "Product categories", prompt: { th: "เพิ่มหมวดสินค้าและข้อมูลที่อนุมัติของคุณที่นี่", en: "Add your approved product categories and details here." }, options: [{ id: id(), label: { th: "กลับเมนู", en: "Back to menu" }, targetNodeId: root }, { id: id(), label: { th: "ถามคำถาม", en: "Ask a question" }, targetNodeId: question }] },
      [services]: { id: services, type: "options", title: "Service categories", prompt: { th: "เพิ่มบริการและข้อมูลที่อนุมัติของคุณที่นี่", en: "Add your approved services and details here." }, options: [{ id: id(), label: { th: "กลับเมนู", en: "Back to menu" }, targetNodeId: root }, { id: id(), label: { th: "ถามคำถาม", en: "Ask a question" }, targetNodeId: question }] },
      [question]: { id: question, type: "form", title: "Product question", prompt: { th: "ฝากคำถามและข้อมูลติดต่อ", en: "Leave your question and contact details." }, fields: [...contactFields(), { key: "question", label: { th: "คำถาม", en: "Question" }, type: "textarea", required: true }], nextNodeId: done },
      [handover]: { id: handover, type: "handover", title: "Human handover", message: { th: "กำลังส่งต่อให้ทีมงาน", en: "Connecting you with the team." } },
      [done]: { id: done, type: "end", title: "Question received", message: { th: "รับคำถามแล้ว ทีมงานจะติดต่อกลับ", en: "Your question was received. The team will contact you." } },
    }, defaultAuthoring("product"));
  }

  const root = id(); const context = id(); const guidance = id(); const handover = id(); const done = id();
  return finish(root, {
    [root]: { id: root, type: "options", title: "Support routing", prompt: { th: "ต้องการความช่วยเหลือเรื่องใด?", en: "What do you need help with?" }, options: [
      { id: id(), label: { th: "การใช้งาน", en: "Using the service" }, targetNodeId: context },
      { id: id(), label: { th: "การชำระเงิน", en: "Billing" }, targetNodeId: context },
      { id: id(), label: { th: "ปัญหาอื่น", en: "Another issue" }, targetNodeId: context },
      { id: id(), label: { th: "คุยกับทีมงาน", en: "Talk to the team" }, targetNodeId: handover },
    ] },
    [context]: { id: context, type: "form", title: "Issue context", prompt: { th: "อธิบายปัญหาและฝากข้อมูลติดต่อ", en: "Describe the issue and leave contact details." }, fields: [...contactFields(), { key: "issue", label: { th: "รายละเอียดปัญหา", en: "Issue details" }, type: "textarea", required: true }], nextNodeId: guidance },
    [guidance]: { id: guidance, type: "options", title: "Approved guidance", prompt: { th: "เพิ่มคำแนะนำที่อนุมัติของคุณที่นี่", en: "Add your approved support guidance here." }, options: [{ id: id(), label: { th: "แก้ไขได้แล้ว", en: "Resolved" }, targetNodeId: done }, { id: id(), label: { th: "ยังต้องการทีมงาน", en: "I still need the team" }, targetNodeId: handover }] },
    [handover]: { id: handover, type: "handover", title: "Human handover", message: { th: "กำลังส่งต่อรายละเอียดให้ทีมงาน", en: "Passing the collected context to the team." } },
    [done]: { id: done, type: "end", title: "Support complete", message: { th: "ขอบคุณครับ", en: "Thank you." } },
  }, defaultAuthoring("support"));

  function contactFields(): LeadFieldSeed[] {
    return [
      { key: "name", label: { th: "ชื่อ", en: "Name" }, type: "text", required: true },
      { key: "phone", label: { th: "เบอร์โทร", en: "Phone" }, type: "phone", required: false },
      { key: "email", label: { th: "อีเมล", en: "Email" }, type: "email", required: false },
    ];
  }
  type LeadFieldSeed = Extract<FlowNode, { type: "form" }>["fields"][number];
  function defaultAuthoring(kind: FlowStarterTemplateKey): AuthoringSeed {
    return {
      lead: { fields: contactFields(), consent: "กรุณายืนยันว่าธุรกิจสามารถใช้ข้อมูลนี้เพื่อติดต่อกลับ / Please confirm the business may use these details to contact you." },
      handover: { teamLabel: "Shared inbox", fallback: { th: "ทีมงานจะดูแลต่อ", en: "Our team will continue." }, outsideHoursMessage: "ทีมงานจะตอบกลับในเวลาทำการ / The team will reply during business hours." },
      ...(kind === "blank" ? {} : { identity: { widgetPosition: "bottom_right", brandColor: "#126149" } }),
    };
  }
}

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

/**
 * `severity` is optional and absent means "error". Every current caller of
 * `validateFlowForPublish` (packages/db/src/flowbot-store.ts updateDraft/publish/rollback and
 * apps/workers/src/migrate-flowbot-v1.ts) treats any non-empty issue list as a hard block, so an
 * issue returned from that function is by definition a blocker. Advisory graph findings are
 * therefore returned separately by `flowGraphAdvisories` and carry `severity: "warning"`.
 */
export type FlowValidationSeverity = "error" | "warning";
export type FlowValidationIssue = Readonly<{ code: string; nodeId?: string; detail?: string; severity?: FlowValidationSeverity }>;

export function countFlowTopics(snapshot: Pick<FlowSnapshot, "rootNodeId" | "keywords">) {
  return new Set([snapshot.rootNodeId, ...snapshot.keywords.map((keyword) => keyword.nodeId)]).size;
}

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

export type FlowLocalizedText = z.infer<typeof localizedTextSchema>;
export const flowEdgeKinds = ["next", "option", "true", "false", "open", "closed", "failure", "jump", "subflow_return"] as const;
export type FlowEdgeKind = (typeof flowEdgeKinds)[number];
export type FlowNodeEdge = Readonly<{ targetNodeId: string; kind: FlowEdgeKind; label?: FlowLocalizedText }>;

const edge = (targetNodeId: string | null | undefined, kind: FlowEdgeKind, label?: FlowLocalizedText): readonly FlowNodeEdge[] =>
  typeof targetNodeId === "string" && targetNodeId ? [{ targetNodeId, kind, ...(label ? { label } : {}) }] : [];

/**
 * The single source of truth for a node's outgoing transitions: every consumer (publish
 * validation, graph analysis, the authoring canvas) reads edges from here so an edge can never be
 * known to one consumer and unknown to another. Defensive against malformed nodes because graph
 * analysis runs on unpublished drafts.
 */
export function flowNodeEdges(node: FlowNode): readonly FlowNodeEdge[] {
  switch (node.type) {
    case "message": case "media_reference": case "product_card": case "carousel": case "actions": case "form":
    case "input_capture": case "variable_set": case "delay": return edge(node.nextNodeId, "next");
    case "options": return Array.isArray(node.options) ? node.options.flatMap((option) => edge(option?.targetNodeId, "option", option?.label)) : [];
    case "condition": case "advanced_condition": return [...edge(node.trueNodeId, "true"), ...edge(node.falseNodeId, "false")];
    case "jump": return edge(node.targetNodeId, "jump");
    case "business_hours": return [...edge(node.openNodeId, "open"), ...edge(node.closedNodeId, "closed")];
    case "webhook": return [...edge(node.nextNodeId, "next"), ...edge(node.failureNodeId, "failure")];
    // The engine resumes at `returnNodeId` when the embedded subflow ends (flowbot-engine/src/index.ts:137),
    // so it is a real outgoing edge and must be validated like any other target.
    case "subflow": return edge(node.returnNodeId, "subflow_return");
    case "handover": case "end": case "team_route": return [];
    default: { const exhaustive: never = node; void exhaustive; return []; }
  }
}

function references(node: FlowNode): readonly string[] {
  return flowNodeEdges(node).map((item) => item.targetNodeId);
}

/**
 * Conversion nodes for the `path_without_cta` lint. `end` is deliberately excluded: a path that
 * simply ends without asking the customer for anything is exactly what the lint is meant to catch.
 * `input_capture` is also excluded: it is a generic mid-flow variable capture (a name, an order
 * number) and does not by itself ask for a call, a booking, a checkout, a lead or a human.
 */
export const flowCtaNodeTypes = ["actions", "form", "handover", "team_route"] as const;
export type FlowCtaNodeType = (typeof flowCtaNodeTypes)[number];
const isCtaNode = (node: FlowNode) => (flowCtaNodeTypes as readonly string[]).includes(node.type);

export type FlowGraphInput = Readonly<{
  rootNodeId?: string | null;
  nodes?: Readonly<Record<string, FlowNode>> | null;
  keywords?: readonly Readonly<{ nodeId: string }>[] | null;
}>;

/**
 * Advisory (non-blocking) graph findings: `unreachable_node`, `cycle_detected` and
 * `path_without_cta`. Kept out of `validateFlowForPublish` on purpose — see FlowValidationIssue:
 * anything that function returns blocks draft saves, publish AND rollback of already-published
 * versions, so none of these authoring smells may be emitted from it.
 *
 * Entry points are the root plus every keyword target, because the engine starts a traversal at a
 * matched keyword's node (flowbot-engine/src/index.ts:86); treating only the root as an entry would
 * flag every legitimate keyword topic as unreachable. Linear in nodes + edges (each node is
 * expanded once per pass and each edge inspected once) and it never throws on a malformed graph,
 * which is the normal case here: validation runs before publish, so it sees broken input by design.
 */
export function flowGraphAdvisories(graph: FlowGraphInput): readonly FlowValidationIssue[] {
  const nodes: Record<string, FlowNode> = {};
  const rawNodes = graph?.nodes;
  if (rawNodes && typeof rawNodes === "object") {
    for (const [id, node] of Object.entries(rawNodes)) {
      if (node && typeof node === "object" && typeof (node as FlowNode).type === "string") nodes[id] = node;
    }
  }
  const entries: string[] = []; const entrySeen = new Set<string>();
  const addEntry = (id: unknown) => {
    if (typeof id !== "string" || !nodes[id] || entrySeen.has(id)) return;
    entrySeen.add(id); entries.push(id);
  };
  addEntry(graph?.rootNodeId);
  if (Array.isArray(graph?.keywords)) for (const keyword of graph.keywords) addEntry((keyword as { nodeId?: unknown } | null)?.nodeId);

  const issues: FlowValidationIssue[] = [];
  const warning = (code: string, nodeId: string, detail: string): FlowValidationIssue => ({ code, nodeId, detail, severity: "warning" });

  const reachable = new Set(entries); const queue = [...entries];
  for (let head = 0; head < queue.length; head += 1) {
    const node = nodes[queue[head]!];
    if (!node) continue;
    for (const item of flowNodeEdges(node)) {
      if (!nodes[item.targetNodeId] || reachable.has(item.targetNodeId)) continue;
      reachable.add(item.targetNodeId); queue.push(item.targetNodeId);
    }
  }
  for (const [id, node] of Object.entries(nodes)) if (!reachable.has(id)) issues.push(warning("unreachable_node", id, node.type));

  // Iterative colouring DFS (1 = on the current path, 2 = finished). A target that is still on the
  // current path is the entry of a cycle; report that node once and keep walking.
  const visitState = new Map<string, 1 | 2>(); const cycleEntries = new Set<string>();
  for (const entryId of entries) {
    if (visitState.has(entryId)) continue;
    const entryNode = nodes[entryId]; if (!entryNode) continue;
    visitState.set(entryId, 1);
    const stack: { id: string; edges: readonly FlowNodeEdge[]; index: number }[] = [{ id: entryId, edges: flowNodeEdges(entryNode), index: 0 }];
    while (stack.length) {
      const frame = stack[stack.length - 1]!;
      if (frame.index >= frame.edges.length) { visitState.set(frame.id, 2); stack.pop(); continue; }
      const nextId = frame.edges[frame.index]!.targetNodeId; frame.index += 1;
      const nextNode = nodes[nextId]; if (!nextNode) continue;
      const seen = visitState.get(nextId);
      if (seen === 1) { cycleEntries.add(nextId); continue; }
      if (seen === 2) continue;
      visitState.set(nextId, 1); stack.push({ id: nextId, edges: flowNodeEdges(nextNode), index: 0 });
    }
  }
  for (const id of cycleEntries) { const node = nodes[id]; if (node) issues.push(warning("cycle_detected", id, node.type)); }

  // BFS that never traverses *through* a CTA node: any terminal node still reached this way sits on
  // at least one CTA-less path. Nodes whose only edges dangle are not terminal — a broken edge is
  // already reported as `target_node_missing` and is not a missing-CTA problem.
  const ctaSeen = new Set(entries); const ctaQueue = [...entries];
  for (let head = 0; head < ctaQueue.length; head += 1) {
    const id = ctaQueue[head]!; const node = nodes[id];
    if (!node || isCtaNode(node)) continue;
    const edges = flowNodeEdges(node);
    if (!edges.length) { issues.push(warning("path_without_cta", id, node.type)); continue; }
    for (const item of edges) {
      if (!nodes[item.targetNodeId] || ctaSeen.has(item.targetNodeId)) continue;
      ctaSeen.add(item.targetNodeId); ctaQueue.push(item.targetNodeId);
    }
  }
  return issues;
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
  const topicLimit = authority.limits.topics;
  if (typeof topicLimit === "number" && countFlowTopics(snapshot) > topicLimit) issues.push({ code: "plan_topic_limit_exceeded", detail: `${countFlowTopics(snapshot)}/${topicLimit}` });
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
