import {
  productForPlan,
  productKeySchema,
  publicPlanKeySchema,
  publicPlanKeys,
  type ProductKey,
  type PublicPlanKey,
} from "@djay/shared";
import { z } from "zod";

export const entitlementValueSchema = z.union([z.boolean(), z.string(), z.number(), z.null()]);
export type EntitlementValue = z.infer<typeof entitlementValueSchema>;

export const planVersionDefinitionSchema = z.object({
  planKey: publicPlanKeySchema,
  productKey: productKeySchema,
  publicName: z.string().min(2).max(80),
  tierName: z.string().min(2).max(40),
  tierRank: z.number().int().min(1).max(2),
  summary: z.string().min(10).max(240),
  currency: z.literal("THB"),
  recurringAmountMinor: z.number().int().nonnegative().nullable(),
  billingInterval: z.enum(["month", "year"]).nullable(),
  sellable: z.boolean(),
  entitlements: z.record(z.string(), entitlementValueSchema),
  allowances: z.record(z.string(), z.number().nonnegative().nullable()),
  overageRatesMinor: z.record(z.string(), z.number().nonnegative().nullable()),
  limits: z.record(z.string(), z.number().int().nonnegative().nullable()),
  publicHighlights: z.array(z.string().min(2).max(100)).min(3).max(8),
}).strict();

export type PlanVersionDefinition = z.infer<typeof planVersionDefinitionSchema>;

const commonAi = {
  "ai.enabled": true,
  "sales_core.enabled": true,
  "knowledge.enabled": true,
  "lead_capture.enabled": true,
  "appointment_request.enabled": true,
  "sales_email_action.enabled": true,
  "human_handover.enabled": true,
} as const;

const lockedPlanDefinitions = {
  flowbot_basic: {
    planKey: "flowbot_basic", productKey: "flowbot", publicName: "FlowBot Basic", tierName: "Basic", tierRank: 1,
    summary: "Predictable website automation with structured flows, forms, and lead capture.",
    currency: "THB", recurringAmountMinor: null, billingInterval: null, sellable: false,
    entitlements: {
      "channel.web": true, "ai.enabled": false, "flow.nodes.core": true,
      "flow.nodes.advanced": false, "flow.forms": true, "flow.versioning": true,
      "flow.lead_capture": true, "flow.email_notification": true,
      "flow.team_routing": "limited", "flow.webhook": false,
      "branding.remove": false, "analytics.level": "core",
    },
    allowances: { flow_execution: null }, overageRatesMinor: { flow_execution: null },
    limits: { active_bots: null, seats: null, storage_mb: null },
    publicHighlights: ["Website flow widget", "Forms and lead capture", "Versioned flow publishing"],
  },
  flowbot_premium: {
    planKey: "flowbot_premium", productKey: "flowbot", publicName: "FlowBot Premium", tierName: "Premium", tierRank: 2,
    summary: "Advanced website automation with variables, subflows, routing, and approved integrations.",
    currency: "THB", recurringAmountMinor: null, billingInterval: null, sellable: false,
    entitlements: {
      "channel.web": true, "ai.enabled": false, "flow.nodes.core": true,
      "flow.nodes.advanced": true, "flow.forms": true, "flow.versioning": true,
      "flow.lead_capture": true, "flow.email_notification": true,
      "flow.variables": true, "flow.delays": true, "flow.subflows": true,
      "flow.business_hours": true, "flow.team_routing": true,
      "flow.webhook": "approved", "branding.remove": true,
      "analytics.level": "advanced",
    },
    allowances: { flow_execution: null }, overageRatesMinor: { flow_execution: null },
    limits: { active_bots: null, seats: null, storage_mb: null },
    publicHighlights: ["Advanced flow logic", "Team routing", "Approved webhook integrations", "Advanced analytics"],
  },
  ai_chat_basic: {
    planKey: "ai_chat_basic", productKey: "ai_chat", publicName: "AI Chatbot Basic", tierName: "Basic", tierRank: 1,
    summary: "A website AI sales assistant grounded in your approved business knowledge.",
    currency: "THB", recurringAmountMinor: null, billingInterval: null, sellable: false,
    entitlements: {
      ...commonAi, "ai.text": true, "channel.web": true, "channel.line": false,
      "channel.whatsapp": false, "channel.messenger": false,
      "routing.level": "core", "analytics.level": "core", "branding.remove": false,
    },
    allowances: { ai_response: null }, overageRatesMinor: { ai_response: null },
    limits: { deployments: null, seats: null, knowledge_documents: null, storage_mb: null },
    publicHighlights: ["Website AI sales assistant", "Business knowledge", "Lead and appointment capture", "Human handover"],
  },
  ai_chat_premium: {
    planKey: "ai_chat_premium", productKey: "ai_chat", publicName: "AI Chatbot Premium", tierName: "Premium", tierRank: 2,
    summary: "Omnichannel AI sales conversations with advanced routing, controls, and analytics.",
    currency: "THB", recurringAmountMinor: null, billingInterval: null, sellable: false,
    entitlements: {
      ...commonAi, "ai.text": true, "channel.web": true, "channel.line": true,
      "channel.whatsapp": true, "channel.messenger": true,
      "routing.level": "advanced", "analytics.level": "omnichannel", "branding.remove": true,
    },
    allowances: { ai_response: null }, overageRatesMinor: { ai_response: null },
    limits: { deployments: null, seats: null, knowledge_documents: null, storage_mb: null },
    publicHighlights: ["Web and social channels", "Cross-channel continuity", "Advanced team routing", "Omnichannel analytics"],
  },
  voice_basic_gen1: {
    planKey: "voice_basic_gen1", productKey: "voice", publicName: "Voice Agent Basic", tierName: "Basic", tierRank: 1,
    summary: "A cost-effective realtime voice sales agent for standard customer conversations.",
    currency: "THB", recurringAmountMinor: null, billingInterval: null, sellable: false,
    entitlements: {
      ...commonAi, "voice.enabled": true, "voice.capability_profile": "voice_gen1",
      "voice.public_label": "First-Generation Voice Engine", "analytics.level": "core",
    },
    allowances: { voice_minute: null }, overageRatesMinor: { voice_minute: null },
    limits: { concurrent_calls: null, phone_numbers: null, storage_mb: null, retention_days: null },
    publicHighlights: ["Realtime voice conversations", "First-Generation Voice Engine", "Sales knowledge and lead capture", "Core quality analytics"],
  },
  voice_advanced_gen2: {
    planKey: "voice_advanced_gen2", productKey: "voice", publicName: "Voice Agent Advanced", tierName: "Advanced", tierRank: 2,
    summary: "Our smartest realtime voice experience for demanding sales conversations.",
    currency: "THB", recurringAmountMinor: null, billingInterval: null, sellable: false,
    entitlements: {
      ...commonAi, "voice.enabled": true, "voice.capability_profile": "voice_gen2",
      "voice.public_label": "Second-Generation Voice Engine", "analytics.level": "advanced",
      "voice.advanced_quality": true, "voice.gen1_fallback": false,
    },
    allowances: { voice_minute: null }, overageRatesMinor: { voice_minute: null },
    limits: { concurrent_calls: null, phone_numbers: null, storage_mb: null, retention_days: null },
    publicHighlights: ["Realtime voice conversations", "Second-Generation Voice Engine", "Advanced conversation quality", "Advanced quality analytics"],
  },
} as const satisfies Record<PublicPlanKey, PlanVersionDefinition>;

export const planDefinitions: Readonly<Record<PublicPlanKey, PlanVersionDefinition>> = Object.freeze(
  Object.fromEntries(publicPlanKeys.map((key) => [key, planVersionDefinitionSchema.parse(lockedPlanDefinitions[key])])) as Record<PublicPlanKey, PlanVersionDefinition>,
);

export type PublicCatalogPlan = Readonly<Pick<PlanVersionDefinition,
  "planKey" | "productKey" | "publicName" | "tierName" | "tierRank" | "summary" |
  "currency" | "recurringAmountMinor" | "billingInterval" | "sellable" | "publicHighlights"
>>;

export function publicCatalog(): readonly PublicCatalogPlan[] {
  return publicPlanKeys.map((key) => {
    const plan = planDefinitions[key];
    return Object.freeze({
      planKey: plan.planKey,
      productKey: plan.productKey,
      publicName: plan.publicName,
      tierName: plan.tierName,
      tierRank: plan.tierRank,
      summary: plan.summary,
      currency: plan.currency,
      recurringAmountMinor: plan.recurringAmountMinor,
      billingInterval: plan.billingInterval,
      sellable: plan.sellable,
      publicHighlights: [...plan.publicHighlights],
    });
  });
}

export function planForSelection(planKey: unknown): PlanVersionDefinition {
  const key = publicPlanKeySchema.parse(planKey);
  const plan = planDefinitions[key];
  if (plan.productKey !== productForPlan[key]) throw new Error("catalog_product_mismatch");
  return plan;
}

export function plansForProduct(productKey: ProductKey): readonly PlanVersionDefinition[] {
  return publicPlanKeys.map((key) => planDefinitions[key]).filter((plan) => plan.productKey === productKey);
}
