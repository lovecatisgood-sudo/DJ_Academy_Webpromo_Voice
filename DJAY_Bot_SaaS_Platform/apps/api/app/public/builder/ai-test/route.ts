import { randomUUID } from "node:crypto";
import { runAiTextPreview } from "@djay/ai-chat-runtime";
import type { NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { getServices } from "../../../../lib/container";
import { clientAddress, enforceRateLimit, hasTrustedOrigin, readJson, safeJson } from "../../../../lib/http";

const requestSchema = z.object({
  language: z.enum(["th", "en"]),
  role: z.enum(["support", "sales", "booking"]),
  message: z.string().trim().min(1).max(2000),
  business: z.object({
    name: z.string().trim().min(2).max(200),
    summary: z.string().trim().max(1000).default(""),
    offers: z.string().trim().max(2000).default(""),
    agentObjective: z.string().trim().min(2).max(500),
    agentBehavior: z.string().trim().min(2).max(1000),
    agentBoundaries: z.string().trim().min(2).max(1000),
  }).strict(),
}).strict();

const roleDefaults = {
  support: {
    name: "Support Assistant",
    questions: ["What happened, and what outcome would help you?"],
  },
  sales: {
    name: "Sales Assistant",
    questions: ["What are you trying to improve, and what matters most in the decision?"],
  },
  booking: {
    name: "Booking Assistant",
    questions: ["Which service and preferred day or time would suit you?"],
  },
} as const;

export async function POST(request: NextRequest) {
  if (!(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  const allowed = await enforceRateLimit("public_builder_ai_test", clientAddress(request), 10, 60_000);
  if (!allowed.allowed) return safeJson({ status: "rate_limited" }, 429);
  try {
    const input = requestSchema.parse(await readJson(request, 10_000));
    const services = await getServices();
    if (!services.aiTextGateway) return safeJson({ status: "not_available" }, 503);
    const role = roleDefaults[input.role];
    const claims = [input.business.summary, input.business.offers].filter(Boolean);
    const preview = await runAiTextPreview({
      gateway: services.aiTextGateway,
      inputId: randomUUID(),
      language: input.language,
      message: input.message,
      knowledgeChunks: [],
      playbook: {
        schemaVersion: 1,
        playbookVersionId: randomUUID(),
        businessName: input.business.name,
        agentName: `${input.business.name} ${role.name}`.slice(0, 100),
        languages: ["th", "en"],
        tone: input.business.agentBehavior.slice(0, 200),
        salesGoal: input.business.agentObjective,
        approvedClaims: claims,
        prohibitedClaims: [input.business.agentBoundaries.slice(0, 500)],
        discoveryQuestions: role.questions,
        ctaPolicy: ["Offer a human follow-up only when it is useful and do not claim an action completed."],
        requiredContactFields: ["name", "email"],
        greeting: { th: "สวัสดี มีอะไรให้ช่วยได้บ้าง", en: "Hello. How can I help?" },
        offlineMessage: { th: "ทีมงานจะติดต่อกลับในเวลาทำการ", en: "The team will follow up during business hours." },
        timezone: "Asia/Bangkok",
        weeklyWindows: [],
        confidenceThreshold: 0.6,
        publicActions: [],
      },
    });
    return safeJson({ preview });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return safeJson({ status: "validation_failed" }, 400);
    }
    console.error("public_builder_ai_test_failed", {
      reason: error instanceof Error ? error.message : "unknown_error",
    });
    return safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
