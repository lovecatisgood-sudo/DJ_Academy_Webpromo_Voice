import { z } from "zod";

const base = { idempotencyKey: z.string().trim().min(8).max(200) } as const;
export const actionRequestSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("lead.create"), contactId: z.uuid(), title: z.string().trim().min(2).max(200), source: z.string().trim().min(2).max(80) }).strict(),
  z.object({ ...base, type: z.literal("lead.update"), leadId: z.uuid(), status: z.enum(["new", "pending_follow_up", "appointment_made", "not_closed_follow", "closed_deal", "disqualified"]) }).strict(),
  z.object({ ...base, type: z.literal("sales_fact.record"), leadId: z.uuid(), factType: z.string().trim().min(2).max(80), value: z.string().trim().min(1).max(1000) }).strict(),
  z.object({ ...base, type: z.literal("appointment.request"), leadId: z.uuid(), timezone: z.string().min(3).max(64), options: z.array(z.object({ startAt: z.iso.datetime(), endAt: z.iso.datetime() }).strict()).min(1).max(5) }).strict(),
  z.object({ ...base, type: z.literal("follow_up.create"), leadId: z.uuid(), dueAt: z.iso.datetime(), note: z.string().trim().min(1).max(1000) }).strict(),
  z.object({ ...base, type: z.literal("handover.request"), conversationId: z.uuid(), reason: z.string().trim().min(2).max(500) }).strict(),
  z.object({ ...base, type: z.literal("merchant_email.send"), notificationProfileId: z.uuid(), templateKey: z.string().trim().min(2).max(100), variables: z.record(z.string(), z.string().max(1000)) }).strict(),
]);

export type ActionRequest = z.infer<typeof actionRequestSchema>;
export const actionTypes = actionRequestSchema.options.map((option) => option.shape.type.value);

export type ActionContext = Readonly<{
  tenantId: string;
  actorId: string;
  conversationId: string | null;
  entitlementSnapshotId: string;
  requestId: string;
}>;

export interface ActionStore {
  execute(context: ActionContext, action: ActionRequest): Promise<Readonly<{
    status: "succeeded" | "failed" | "replayed";
    actionRequestId: string;
    result?: Readonly<Record<string, unknown>>;
  }>>;
}

export function parseActionRequest(value: unknown): ActionRequest {
  return actionRequestSchema.parse(value);
}
