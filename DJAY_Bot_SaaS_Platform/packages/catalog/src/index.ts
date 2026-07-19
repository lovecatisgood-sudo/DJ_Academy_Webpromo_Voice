import {
  productForPlan,
  productKeySchema,
  publicPlanKeySchema,
  publicPlanKeys,
  type ProductKey,
  type PublicPlanKey,
} from "@djay/shared";
import { z } from "zod";

export const marketReleaseCatalogVersion = "djay-bots-th-2026-01" as const;
export const firstYearPromotionKey = "first-year-launch-2026-01" as const;

export const entitlementValueSchema = z.union([z.boolean(), z.string(), z.number(), z.null()]);
export type EntitlementValue = z.infer<typeof entitlementValueSchema>;

const moneyMinorSchema = z.number().int().nonnegative();

export const planVersionDefinitionSchema = z.object({
  catalogVersion: z.literal(marketReleaseCatalogVersion),
  planKey: publicPlanKeySchema,
  productKey: productKeySchema,
  publicName: z.string().min(2).max(80),
  tierName: z.enum(["Starter", "Advanced"]),
  tierRank: z.number().int().min(1).max(2),
  summary: z.string().min(10).max(240),
  currency: z.literal("THB"),
  firstTermAmountMinor: moneyMinorSchema,
  renewalAmountMinor: moneyMinorSchema,
  firstTermDiscountMinor: moneyMinorSchema,
  billingInterval: z.literal("year"),
  billingIntervalCount: z.literal(1),
  promotionKey: z.literal(firstYearPromotionKey),
  sellable: z.boolean(),
  stripeMappingState: z.enum(["missing", "test_ready", "live_ready"]),
  entitlements: z.record(z.string(), entitlementValueSchema),
  allowances: z.record(z.string(), z.number().nonnegative().nullable()),
  overageRatesMinor: z.record(z.string(), z.number().nonnegative().nullable()),
  limits: z.record(z.string(), z.number().int().nonnegative().nullable()),
  publicHighlights: z.array(z.string().min(2).max(100)).min(3).max(8),
}).strict().superRefine((plan, context) => {
  if (plan.renewalAmountMinor - plan.firstTermDiscountMinor !== plan.firstTermAmountMinor) {
    context.addIssue({ code: "custom", path: ["firstTermDiscountMinor"], message: "discount_must_reconcile" });
  }
  if (plan.sellable && plan.stripeMappingState !== "live_ready") {
    context.addIssue({ code: "custom", path: ["sellable"], message: "sellable_requires_live_stripe_mapping" });
  }
});

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

const commercial = (
  firstTermAmountMinor: number,
  renewalAmountMinor: number,
) => ({
  catalogVersion: marketReleaseCatalogVersion,
  currency: "THB" as const,
  firstTermAmountMinor,
  renewalAmountMinor,
  firstTermDiscountMinor: renewalAmountMinor - firstTermAmountMinor,
  billingInterval: "year" as const,
  billingIntervalCount: 1 as const,
  promotionKey: firstYearPromotionKey,
  sellable: false,
  stripeMappingState: "missing" as const,
});

const lockedPlanDefinitions = {
  flowbot_basic: {
    ...commercial(249_900, 499_900),
    planKey: "flowbot_basic", productKey: "flowbot", publicName: "Flow Bot Starter", tierName: "Starter", tierRank: 1,
    summary: "Structured website automation for common questions, lead capture, and guided customer actions.",
    entitlements: {
      "channel.web": true, "channel.social": false, "ai.enabled": false,
      "flow.nodes.core": true, "flow.nodes.advanced": false, "flow.forms": true,
      "flow.versioning": true, "flow.lead_capture": true, "flow.email_notification": true,
      "flow.team_routing": "limited", "flow.webhook": false, "branding.remove": false,
      "analytics.level": "basic", "support.level": "standard",
    },
    allowances: { flow_execution: 50_000 }, overageRatesMinor: { flow_execution: null },
    limits: { active_bots: 1, workspaces: 1, topics: 150, seats: 1, social_channels: 0 },
    publicHighlights: ["Website chat widget", "50,000 monthly conversations", "150 conversation topics", "Lead capture and handover"],
  },
  flowbot_premium: {
    ...commercial(445_000, 890_000),
    planKey: "flowbot_premium", productKey: "flowbot", publicName: "Flow Bot Advanced", tierName: "Advanced", tierRank: 2,
    summary: "Multi-channel structured automation with advanced logic, routing, integrations, and analytics.",
    entitlements: {
      "channel.web": true, "channel.social": true, "ai.enabled": false,
      "flow.nodes.core": true, "flow.nodes.advanced": true, "flow.forms": true,
      "flow.versioning": true, "flow.lead_capture": true, "flow.email_notification": true,
      "flow.variables": true, "flow.delays": true, "flow.subflows": true,
      "flow.business_hours": true, "flow.team_routing": true, "flow.webhook": "approved",
      "integration.google_sheets": true, "integration.external_api": "basic",
      "branding.remove": true, "analytics.level": "advanced", "support.level": "priority",
    },
    allowances: { flow_execution: 100_000 }, overageRatesMinor: { flow_execution: null },
    limits: { active_bots: 3, workspaces: 1, topics: 500, seats: 3, social_channels: 1 },
    publicHighlights: ["Up to 3 Flow Bots", "100,000 monthly conversations", "Website plus one social channel", "Advanced logic and integrations"],
  },
  ai_chat_basic: {
    ...commercial(595_000, 1_190_000),
    planKey: "ai_chat_basic", productKey: "ai_chat", publicName: "AI Text Bot Starter", tierName: "Starter", tierRank: 1,
    summary: "A Thai and English website AI sales assistant grounded in approved business knowledge.",
    entitlements: {
      ...commonAi, "ai.text": true, "channel.web": true, "channel.line": false,
      "channel.whatsapp": false, "channel.messenger": false, "languages.th": true,
      "languages.en": true, "routing.level": "core", "analytics.level": "basic",
      "branding.remove": false, "support.level": "standard",
    },
    allowances: { ai_response: 2_000 }, overageRatesMinor: { ai_response: 35 },
    limits: { active_bots: 1, workspaces: 1, knowledge_collections: 1, seats: 1, social_channels: 0 },
    publicHighlights: ["2,000 AI replies monthly", "Thai and English", "Website and document knowledge", "Lead capture and handover"],
  },
  ai_chat_premium: {
    ...commercial(1_245_000, 2_490_000),
    planKey: "ai_chat_premium", productKey: "ai_chat", publicName: "AI Text Bot Advanced", tierName: "Advanced", tierRank: 2,
    summary: "Multi-channel AI sales conversations with advanced qualification, routing, integrations, and analytics.",
    entitlements: {
      ...commonAi, "ai.text": true, "channel.web": true, "channel.line": true,
      "channel.whatsapp": true, "channel.messenger": true, "languages.th": true,
      "languages.en": true, "languages.additional": true, "routing.level": "advanced",
      "analytics.level": "advanced", "branding.remove": true, "integration.google_sheets": true,
      "integration.webhook": true, "integration.crm": "basic", "support.level": "priority",
    },
    allowances: { ai_response: 10_000 }, overageRatesMinor: { ai_response: 25 },
    limits: { active_bots: 3, workspaces: 1, knowledge_collections: null, seats: 5, social_channels: 1 },
    publicHighlights: ["Up to 3 AI Text Bots", "10,000 AI replies monthly", "Website plus one social channel", "Advanced sales intelligence"],
  },
  voice_basic_gen1: {
    ...commercial(1_495_000, 2_990_000),
    planKey: "voice_basic_gen1", productKey: "voice", publicName: "AI Voice Bot Starter", tierName: "Starter", tierRank: 1,
    summary: "A Thai and English web voice agent for enquiries, lead qualification, and callback requests.",
    entitlements: {
      ...commonAi, "voice.enabled": true, "voice.capability_profile": "voice_gen1",
      "voice.public_label": "AI Voice Agent", "channel.web": true, "telephone.inbound": "optional",
      "languages.th": true, "languages.en": true, "analytics.level": "basic",
      "support.level": "standard",
    },
    allowances: { voice_minute: 150 }, overageRatesMinor: { voice_minute: 600 },
    limits: { active_bots: 1, workspaces: 1, knowledge_collections: 1, concurrent_calls: 1, seats: 1 },
    publicHighlights: ["150 connected minutes monthly", "Thai and English", "Web voice widget", "Transcripts and summaries"],
  },
  voice_advanced_gen2: {
    ...commercial(2_995_000, 5_990_000),
    planKey: "voice_advanced_gen2", productKey: "voice", publicName: "AI Voice Bot Advanced", tierName: "Advanced", tierRank: 2,
    summary: "Multi-agent web and telephone voice automation with routing, transfers, integrations, and analytics.",
    entitlements: {
      ...commonAi, "voice.enabled": true, "voice.capability_profile": "voice_gen2",
      "voice.public_label": "AI Voice Agent", "voice.advanced_quality": true,
      "voice.gen1_fallback": false, "channel.web": true, "telephone.inbound": true,
      "languages.th": true, "languages.en": true, "languages.additional": true,
      "integration.google_sheets": true, "integration.webhook": true, "integration.crm": "basic",
      "analytics.level": "advanced", "branding.remove": true, "support.level": "priority",
    },
    allowances: { voice_minute: 500 }, overageRatesMinor: { voice_minute: 500 },
    limits: { active_bots: 3, workspaces: 1, knowledge_collections: null, concurrent_calls: 2, seats: 5 },
    publicHighlights: ["Up to 3 AI Voice Agents", "500 connected minutes monthly", "Inbound telephone integration", "Routing, transfer, and advanced analytics"],
  },
} as const satisfies Record<PublicPlanKey, PlanVersionDefinition>;

export const planDefinitions: Readonly<Record<PublicPlanKey, PlanVersionDefinition>> = Object.freeze(
  Object.fromEntries(publicPlanKeys.map((key) => [key, planVersionDefinitionSchema.parse(lockedPlanDefinitions[key])])) as Record<PublicPlanKey, PlanVersionDefinition>,
);

export const addOnDefinitions = Object.freeze({
  additional_social_channel: { publicName: "Additional Social Channel", amountMinor: 29_900, interval: "month", unit: "channel" },
  additional_administrator: { publicName: "Additional Administrator", amountMinor: 9_900, interval: "month", unit: "administrator" },
  additional_workspace: { publicName: "Additional Business Workspace", amountMinor: 29_900, interval: "month", unit: "workspace", priceQualifier: "from" },
  starter_branding_removal: { publicName: "Remove DJay Bots Branding", amountMinor: 19_900, interval: "month", unit: "workspace" },
} as const);

export const usagePackDefinitions = Object.freeze({
  ai_starter_1000: { planKey: "ai_chat_basic", customerUnit: "ai_response", quantity: 1_000, amountMinor: 29_900 },
  ai_advanced_5000: { planKey: "ai_chat_premium", customerUnit: "ai_response", quantity: 5_000, amountMinor: 99_900 },
} as const);

export const professionalServiceDefinitions = Object.freeze({
  flow_starter_setup: { publicName: "Starter Flow Setup", amountMinor: 390_000, priceQualifier: "from" },
  flow_advanced_design: { publicName: "Advanced Flow Design", amountMinor: 790_000, priceQualifier: "from" },
  flow_complex_automation: { publicName: "Complex Flow Automation", amountMinor: 1_990_000, priceQualifier: "from" },
  ai_knowledge_setup: { publicName: "Knowledge-Base Setup", amountMinor: 490_000, priceQualifier: "from" },
  ai_sales_configuration: { publicName: "AI Sales Configuration", amountMinor: 490_000, priceQualifier: "from" },
  ai_advanced_sales_system: { publicName: "Advanced AI Sales System", amountMinor: 990_000, priceQualifier: "from" },
  voice_agent_setup: { publicName: "Voice Agent Setup", amountMinor: 990_000, priceQualifier: "from" },
  telephone_integration: { publicName: "Telephone Integration", amountMinor: 490_000, priceQualifier: "from" },
  voice_custom_automation: { publicName: "Custom Voice Automation", amountMinor: 1_990_000, priceQualifier: "from" },
} as const);

export type PublicCatalogPlan = Readonly<Pick<PlanVersionDefinition,
  "catalogVersion" | "planKey" | "productKey" | "publicName" | "tierName" | "tierRank" | "summary" |
  "currency" | "firstTermAmountMinor" | "renewalAmountMinor" | "firstTermDiscountMinor" |
  "billingInterval" | "billingIntervalCount" | "promotionKey" | "sellable" | "stripeMappingState" |
  "publicHighlights"
>>;

export function publicCatalog(): readonly PublicCatalogPlan[] {
  return publicPlanKeys.map((key) => {
    const plan = planDefinitions[key];
    return Object.freeze({
      catalogVersion: plan.catalogVersion, planKey: plan.planKey, productKey: plan.productKey,
      publicName: plan.publicName, tierName: plan.tierName, tierRank: plan.tierRank,
      summary: plan.summary, currency: plan.currency, firstTermAmountMinor: plan.firstTermAmountMinor,
      renewalAmountMinor: plan.renewalAmountMinor, firstTermDiscountMinor: plan.firstTermDiscountMinor,
      billingInterval: plan.billingInterval, billingIntervalCount: plan.billingIntervalCount,
      promotionKey: plan.promotionKey, sellable: plan.sellable,
      stripeMappingState: plan.stripeMappingState, publicHighlights: [...plan.publicHighlights],
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
