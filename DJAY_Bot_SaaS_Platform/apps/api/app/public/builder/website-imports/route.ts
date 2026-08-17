import type { NextRequest } from "next/server";
import { ZodError } from "zod";
import { getServices } from "../../../../lib/container";
import { enforceRateLimit, hasTrustedOrigin, readJson, safeJson } from "../../../../lib/http";
import { normalizedPublicWebsiteUrl, publicBuilderImportCreateSchema } from "../../../../lib/public-builder-import";
import {
  PUBLIC_BUILDER_TEST_COOKIE,
  publicBuilderTestCookie,
  resolvePublicBuilderTestSession,
} from "../../../../lib/public-builder-test-quota";

export async function POST(request: NextRequest) {
  if (!(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  let headers: HeadersInit | undefined;
  try {
    const services = await getServices();
    const session = resolvePublicBuilderTestSession(
      request.cookies.get(PUBLIC_BUILDER_TEST_COOKIE)?.value,
      services.rateLimitKey,
    );
    headers = { "Set-Cookie": publicBuilderTestCookie(session.cookieValue, services.env.NODE_ENV === "production") };
    const draft = await services.anonymousBuilder.ensureDraft(session);
    if (!draft) return safeJson({ status: "unavailable" }, 404, headers);
    const input = publicBuilderImportCreateSchema.parse(await readJson(request, 4096));
    const allowed = await enforceRateLimit("public_builder_website_import_create", session.sessionId, 5, 60_000);
    if (!allowed.allowed) return safeJson({ status: "rate_limited" }, 429, headers);
    const result = await services.anonymousBuilderImports.createJob({
      sessionId: session.sessionId,
      idempotencyKey: input.idempotencyKey,
      draftRevision: input.draftRevision,
      requestedUrl: input.url,
      normalizedUrl: normalizedPublicWebsiteUrl(input.url),
    });
    if (result.status === "conflict") return safeJson(result, 409, headers);
    if (result.status === "unavailable") return safeJson(result, 409, headers);
    return safeJson(result, result.status === "created" ? 201 : 200, headers);
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return safeJson({ status: "validation_failed" }, 400, headers);
    const reason = error instanceof Error && /^website_[a-z_]+$/.test(error.message) ? error.message : "website_import_failed";
    return safeJson({ status: "not_available", reason }, 422, headers);
  }
}
