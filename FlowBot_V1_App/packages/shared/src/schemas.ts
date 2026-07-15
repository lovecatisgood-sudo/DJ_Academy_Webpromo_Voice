import { z } from "zod";
import {
  channels,
  conversationStatuses,
  crmStatuses,
  flowNodeTypes,
  languages,
  messageSenders,
  messageTypes
} from "./enums";

export const uuidSchema = z.string().uuid();
export const isoDateSchema = z.string().datetime();
export const decimalCursorSchema = z.string().regex(/^\d+$/);

export const customerSchema = z.object({
  id: uuidSchema,
  tenantId: uuidSchema,
  name: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  lineId: z.string().optional(),
  whatsapp: z.string().optional(),
  note: z.string().optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  deletedAt: isoDateSchema.optional()
});
export type Customer = z.infer<typeof customerSchema>;

export const conversationSchema = z.object({
  id: uuidSchema,
  tenantId: uuidSchema,
  botId: uuidSchema,
  customerId: uuidSchema.optional(),
  flowVersionId: uuidSchema,
  currentNodeId: uuidSchema.optional(),
  channel: z.enum(channels),
  status: z.enum(conversationStatuses),
  crmStatus: z.enum(crmStatuses),
  starred: z.boolean(),
  archived: z.boolean(),
  lang: z.enum(languages),
  startedAt: isoDateSchema,
  lastActivityAt: isoDateSchema
});
export type Conversation = z.infer<typeof conversationSchema>;

export const messageSchema = z.object({
  id: uuidSchema,
  sequence: decimalCursorSchema,
  tenantId: uuidSchema,
  conversationId: uuidSchema,
  sender: z.enum(messageSenders),
  type: z.enum(messageTypes),
  content: z.unknown(),
  nodeId: uuidSchema.optional(),
  createdAt: isoDateSchema
});
export type Message = z.infer<typeof messageSchema>;

export const leadSchema = z.object({
  id: uuidSchema,
  tenantId: uuidSchema,
  conversationId: uuidSchema.optional(),
  customerId: uuidSchema.optional(),
  sourceNodeId: uuidSchema.optional(),
  name: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  extra: z.record(z.string(), z.unknown()),
  createdAt: isoDateSchema,
  deletedAt: isoDateSchema.optional()
});
export type Lead = z.infer<typeof leadSchema>;

export const engineInputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), payload: z.object({ text: z.string().min(1).max(1000) }) }),
  z.object({ type: z.literal("option"), payload: z.object({ optionId: uuidSchema }) }),
  z.object({ type: z.literal("form"), payload: z.object({ nodeId: uuidSchema, data: z.record(z.string(), z.string()) }) }),
  z.object({ type: z.literal("audio"), payload: z.object({ assetId: uuidSchema, transcript: z.string().optional() }) }),
  z.object({
    type: z.literal("action"),
    payload: z.object({ action: z.enum(["restart", "return_to_bot"]) })
  })
]);
export type EngineInput = z.infer<typeof engineInputSchema>;

export const outboundMessageSchema = z.object({
  clientRef: z.string().optional(),
  type: z.enum(messageTypes),
  content: z.record(z.string(), z.unknown())
});
export type OutboundMessage = z.infer<typeof outboundMessageSchema>;

export const domainEffectSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("create_lead"),
    payload: z.object({ sourceNodeId: uuidSchema, data: z.record(z.string(), z.string()) })
  }),
  z.object({ type: z.literal("request_handoff"), payload: z.object({ reason: z.string() }) }),
  z.object({ type: z.literal("booking_request"), payload: z.record(z.string(), z.unknown()) })
]);
export type DomainEffect = z.infer<typeof domainEffectSchema>;

export const analyticsEventSchema = z.object({
  type: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).default({})
});
export type AnalyticsEvent = z.infer<typeof analyticsEventSchema>;

export const engineResultSchema = z.object({
  messages: z.array(outboundMessageSchema),
  stateUpdates: z
    .object({
      status: z.enum(conversationStatuses).optional(),
      currentNodeId: uuidSchema.nullable().optional(),
      lang: z.enum(languages).optional()
    })
    .default({}),
  events: z.array(analyticsEventSchema),
  effects: z.array(domainEffectSchema)
});
export type EngineResult = z.infer<typeof engineResultSchema>;

export const flowNodeSnapshotSchema = z.object({
  id: uuidSchema,
  type: z.enum(flowNodeTypes),
  title: z.string(),
  contentTh: z.string(),
  contentEn: z.string(),
  nextNodeId: uuidSchema.nullable().optional(),
  options: z
    .array(
      z.object({
        id: uuidSchema,
        labelTh: z.string(),
        labelEn: z.string(),
        targetNodeId: uuidSchema
      })
    )
    .max(6)
    .default([]),
  config: z.record(z.string(), z.unknown()).default({})
});

export const flowKeywordSnapshotSchema = z.object({
  nodeId: uuidSchema,
  keyword: z.string().min(1),
  lang: z.enum(languages),
  priority: z.number().int().default(100),
  substringEnabled: z.boolean().default(true),
  order: z.number().int().nonnegative().default(0)
});

export const flowSnapshotSchema = z.object({
  flowVersionId: uuidSchema,
  rootNodeId: uuidSchema,
  nodes: z.record(uuidSchema, flowNodeSnapshotSchema),
  keywords: z.array(flowKeywordSnapshotSchema).default([])
});
export type FlowSnapshot = z.infer<typeof flowSnapshotSchema>;
