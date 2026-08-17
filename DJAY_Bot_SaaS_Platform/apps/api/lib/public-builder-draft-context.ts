import { z } from "zod";

const roleSchema = z.enum(["support", "sales", "booking"]);
const faqSchema = z.object({
  question: z.string().trim().min(1).max(500),
  answer: z.string().trim().min(1).max(2_000),
}).strict();
const businessSchema = z.object({
  name: z.string().trim().min(2).max(200),
  summary: z.string().trim().max(1_000).default(""),
  offers: z.string().trim().max(2_000).default(""),
  hours: z.string().trim().max(1_000).default(""),
  contact: z.string().trim().max(1_000).default(""),
  faqs: z.array(faqSchema).max(50).default([]),
  agentObjective: z.string().trim().min(2).max(500),
  agentBehavior: z.string().trim().min(2).max(1_000),
  agentBoundaries: z.string().trim().min(2).max(1_000),
}).passthrough();
const textDraftSchema = z.object({ business: businessSchema }).passthrough();
const contextSchema = z.object({
  configuration: z.object({
    textDraft: textDraftSchema,
    textPublishedDraft: textDraftSchema.optional(),
    textUi: z.object({
      role: roleSchema,
      publishedRole: roleSchema.optional(),
    }).passthrough(),
  }).passthrough(),
}).passthrough();

export type PublicBuilderAiTestContext = Readonly<{
  role: z.infer<typeof roleSchema>;
  business: z.infer<typeof businessSchema>;
}>;

export function publicBuilderAiTestContext(state: unknown, mode: "draft" | "published"): PublicBuilderAiTestContext {
  const parsed = contextSchema.parse(state);
  const published = mode === "published";
  const business = published
    ? parsed.configuration.textPublishedDraft?.business
    : parsed.configuration.textDraft.business;
  if (!business) throw new Error("builder_test_context_unavailable");
  const role = published
    ? parsed.configuration.textUi.publishedRole ?? parsed.configuration.textUi.role
    : parsed.configuration.textUi.role;
  return Object.freeze({ role, business });
}

export function publicBuilderDraftStrings(state: unknown) {
  const values = new Set<string>();
  const visit = (value: unknown, depth: number) => {
    if (depth > 12) return;
    if (typeof value === "string") {
      const normalized = value.trim();
      if (normalized) values.add(normalized);
      return;
    }
    if (Array.isArray(value)) value.forEach((item) => visit(item, depth + 1));
    else if (value && typeof value === "object") Object.values(value).forEach((item) => visit(item, depth + 1));
  };
  visit(state, 0);
  return values;
}
