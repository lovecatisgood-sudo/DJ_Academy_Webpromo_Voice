import { randomUUID } from "node:crypto";
import { AiTextRuntimeError, runAiTextPreview } from "@djay/ai-chat-runtime";
import { ProviderGatewayError } from "@djay/provider-gateway";
import type { NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { getServices } from "../../../../lib/container";
import { publicBuilderAiTestContext } from "../../../../lib/public-builder-draft-context";
import { enforceRateLimit, hasTrustedOrigin, readJson, safeJson } from "../../../../lib/http";
import {
  PUBLIC_BUILDER_TEST_CAP,
  PUBLIC_BUILDER_TEST_COOKIE,
  PUBLIC_BUILDER_TEST_RATE_LIMIT_SCOPE,
  PUBLIC_BUILDER_TEST_WINDOW_MS,
  publicBuilderTestCookie,
  resolvePublicBuilderTestSession,
} from "../../../../lib/public-builder-test-quota";

const requestSchema = z.object({
  language: z.enum(["th", "en"]),
  draftRevision: z.number().int().min(1),
  mode: z.enum(["draft", "published"]).default("draft"),
  message: z.string().trim().min(1).max(2000),
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(5000),
  }).strict()).max(12).default([]),
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
  let sessionHeaders: HeadersInit | undefined;
  try {
    const services = await getServices();
    let input: z.infer<typeof requestSchema>;
    try {
      input = requestSchema.parse(await readJson(request, 10_000));
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return safeJson({ status: "validation_failed" }, 400);
      }
      throw error;
    }
    if (!services.aiTextGateway) return safeJson({ status: "not_available" }, 503);
    const builderSession = resolvePublicBuilderTestSession(
      request.cookies.get(PUBLIC_BUILDER_TEST_COOKIE)?.value,
      services.rateLimitKey,
    );
    sessionHeaders = {
      "Set-Cookie": publicBuilderTestCookie(builderSession.cookieValue, services.env.NODE_ENV === "production"),
    };
    const savedDraft = await services.anonymousBuilder.ensureDraft(builderSession);
    if (!savedDraft || savedDraft.revision !== input.draftRevision) {
      return safeJson({ status: "draft_revision_changed" }, 409, sessionHeaders);
    }
    let context;
    try {
      context = publicBuilderAiTestContext(savedDraft.state, input.mode);
    } catch {
      return safeJson({ status: "draft_context_unavailable" }, 409, sessionHeaders);
    }
    const allowed = await enforceRateLimit(
      PUBLIC_BUILDER_TEST_RATE_LIMIT_SCOPE,
      builderSession.sessionId,
      PUBLIC_BUILDER_TEST_CAP,
      PUBLIC_BUILDER_TEST_WINDOW_MS,
    );
    if (!allowed.allowed) {
      return safeJson(
        { status: "test_quota_exhausted", cap: PUBLIC_BUILDER_TEST_CAP },
        429,
        sessionHeaders,
      );
    }
    const role = roleDefaults[context.role];
    const claims = [context.business.summary, context.business.offers].filter(Boolean);
    const sourceRevisionId = randomUUID();
    const approvedKnowledge = [
      context.business.summary ? `Business summary: ${context.business.summary}` : "",
      context.business.offers ? `Products and services: ${context.business.offers}` : "",
      context.business.hours ? `Opening hours: ${context.business.hours}` : "",
      context.business.contact ? `Approved contact details: ${context.business.contact}` : "",
      ...context.business.faqs.map((faq) => `FAQ question: ${faq.question}\nApproved answer: ${faq.answer}`),
    ].filter(Boolean).map((content) => ({ sourceRevisionId, chunkId: randomUUID(), content }));
    const preview = await runAiTextPreview({
      gateway: services.aiTextGateway,
      inputId: randomUUID(),
      language: input.language,
      message: input.message,
      recentMessages: input.messages.map((message, index) => ({ sequence: index + 1, ...message })),
      knowledgeChunks: approvedKnowledge,
      playbook: {
        schemaVersion: 1,
        playbookVersionId: randomUUID(),
        agentRole: context.role,
        businessName: context.business.name,
        agentName: `${context.business.name} ${role.name}`.slice(0, 100),
        languages: ["th", "en"],
        tone: context.business.agentBehavior.slice(0, 200),
        salesGoal: context.business.agentObjective,
        approvedClaims: claims,
        prohibitedClaims: [context.business.agentBoundaries.slice(0, 500)],
        discoveryQuestions: role.questions,
        ctaPolicy: ["Keep the next step inside this test conversation. No external follow-up or scheduling action is available."],
        requiredContactFields: ["name", "email"],
        greeting: { th: "สวัสดี มีอะไรให้ช่วยได้บ้าง", en: "Hello. How can I help?" },
        offlineMessage: { th: "ทีมงานจะติดต่อกลับในเวลาทำการ", en: "The team will follow up during business hours." },
        timezone: "Asia/Bangkok",
        weeklyWindows: [],
        confidenceThreshold: 0.6,
        publicActions: [],
      },
    });
    return safeJson({ preview }, 200, sessionHeaders);
  } catch (error) {
    if (error instanceof AiTextRuntimeError) {
      const statusCode = error.code === "structured_output_invalid" || error.code === "grounding_invalid" ? 502 : 503;
      const status = error.code === "structured_output_invalid" ? "gateway_invalid_response" : error.code;
      return safeJson({ status }, statusCode, sessionHeaders);
    }
    if (error instanceof ProviderGatewayError) {
      const statusCode = error.code === "gateway_timeout"
        ? 504
        : error.code === "gateway_invalid_response"
          ? 502
          : 503;
      return safeJson({ status: error.code }, statusCode, sessionHeaders);
    }
    console.error("public_builder_ai_test_failed", {
      reason: error instanceof Error ? error.message : "unknown_error",
    });
    return safeJson({ status: "temporarily_unavailable" }, 503, sessionHeaders);
  }
}
