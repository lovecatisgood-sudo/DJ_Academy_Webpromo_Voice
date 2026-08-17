import type { NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { getServices } from "../../../../../lib/container";
import { publicBuilderAiTestContext } from "../../../../../lib/public-builder-draft-context";
import { enforceRateLimit, hasTrustedOrigin, readJson, safeJson } from "../../../../../lib/http";
import {
  PUBLIC_BUILDER_TEST_CAP,
  PUBLIC_BUILDER_TEST_COOKIE,
  PUBLIC_BUILDER_TEST_RATE_LIMIT_SCOPE,
  PUBLIC_BUILDER_TEST_WINDOW_MS,
  publicBuilderTestCookie,
  resolvePublicBuilderTestSession,
} from "../../../../../lib/public-builder-test-quota";
import { createXaiBuilderVoiceSession } from "../../../../../lib/public-builder-voice";

const requestSchema = z.object({
  language: z.enum(["th", "en"]),
  draftRevision: z.number().int().min(1),
  mode: z.enum(["draft", "published"]).default("draft"),
}).strict();

export async function POST(request: NextRequest) {
  if (!(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  let sessionHeaders: HeadersInit | undefined;
  try {
    const input = requestSchema.parse(await readJson(request, 12_000));
    const services = await getServices();
    if (!services.env.AI_TEXT_GATEWAY_ENDPOINT || !services.env.AI_TEXT_GATEWAY_SERVICE_TOKEN) {
      return safeJson({ status: "not_available" }, 503);
    }
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
      return safeJson({ status: "test_quota_exhausted", cap: PUBLIC_BUILDER_TEST_CAP }, 429, sessionHeaders);
    }
    const session = await createXaiBuilderVoiceSession({
      gatewayEndpoint: services.env.AI_TEXT_GATEWAY_ENDPOINT,
      serviceToken: services.env.AI_TEXT_GATEWAY_SERVICE_TOKEN,
      profile: { language: input.language, role: context.role, business: context.business },
    });
    return safeJson({ status: "issued", session }, 201, sessionHeaders);
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return safeJson({ status: "validation_failed" }, 400, sessionHeaders);
    }
    return safeJson({ status: "temporarily_unavailable" }, 503, sessionHeaders);
  }
}
