import { z } from "zod";

export const publicBuilderProductFamilySchema = z.enum(["flow", "text", "voice"]);
export const publicBuilderPlanKeySchema = z.enum([
  "flowbot_basic",
  "flowbot_premium",
  "ai_chat_basic",
  "ai_chat_premium",
  "voice_basic_gen1",
  "voice_advanced_gen2",
]);

// The Builder UI owns family-specific detail, while this transport contract owns the stable,
// bounded envelope. A schema-version migration can later validate older snapshots deliberately.
export const publicBuilderDraftStateSchema = z.object({
  schemaVersion: z.literal(1),
  locale: z.enum(["th", "en"]),
  family: publicBuilderProductFamilySchema.nullable().optional(),
  access: z.record(z.string().max(100), z.unknown()).optional(),
  templateOrRole: z.record(z.string().max(100), z.unknown()).optional(),
  businessProfile: z.record(z.string().max(100), z.unknown()).optional(),
  knowledge: z.record(z.string().max(100), z.unknown()).optional(),
  translations: z.record(z.string().max(100), z.unknown()).optional(),
  configuration: z.record(z.string().max(100), z.unknown()).optional(),
  advisoryTests: z.record(z.string().max(100), z.unknown()).optional(),
}).strict();

export const publicBuilderDraftUpdateSchema = z.object({
  revision: z.number().int().min(1),
  productFamily: publicBuilderProductFamilySchema.nullable(),
  planKey: publicBuilderPlanKeySchema.nullable(),
  state: publicBuilderDraftStateSchema,
}).strict().superRefine((value, context) => {
  if (value.state.family !== undefined && value.state.family !== value.productFamily) {
    context.addIssue({ code: "custom", path: ["state", "family"], message: "family_mismatch" });
  }
  if (value.planKey) {
    const family = value.planKey.startsWith("flowbot_")
      ? "flow"
      : value.planKey.startsWith("ai_chat_") ? "text" : "voice";
    if (family !== value.productFamily) {
      context.addIssue({ code: "custom", path: ["planKey"], message: "plan_family_mismatch" });
    }
  }
});
