import type { NextRequest } from "next/server";
import { ZodError } from "zod";
import { getServices } from "../../../../lib/container";
import { hasTrustedOrigin, readJson, safeJson } from "../../../../lib/http";
import { publicBuilderDraftUpdateSchema } from "../../../../lib/public-builder-draft";
import {
  PUBLIC_BUILDER_TEST_COOKIE,
  publicBuilderTestCookie,
  resolvePublicBuilderTestSession,
} from "../../../../lib/public-builder-test-quota";

async function resolveDraft(request: NextRequest) {
  const services = await getServices();
  const session = resolvePublicBuilderTestSession(
    request.cookies.get(PUBLIC_BUILDER_TEST_COOKIE)?.value,
    services.rateLimitKey,
  );
  const headers = {
    "Set-Cookie": publicBuilderTestCookie(session.cookieValue, services.env.NODE_ENV === "production"),
  };
  const draft = await services.anonymousBuilder.ensureDraft(session);
  return { services, session, headers, draft } as const;
}

export async function GET(request: NextRequest) {
  try {
    const { draft, headers } = await resolveDraft(request);
    return draft
      ? safeJson({ status: "ready", draft }, 200, headers)
      : safeJson({ status: "unavailable" }, 404, headers);
  } catch (error) {
    console.error("public_builder_draft_read_failed", {
      reason: error instanceof Error ? error.message : "unknown_error",
    });
    return safeJson({ status: "temporarily_unavailable" }, 503);
  }
}

export async function PATCH(request: NextRequest) {
  if (!(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  let headers: HeadersInit | undefined;
  try {
    const resolved = await resolveDraft(request);
    headers = resolved.headers;
    if (!resolved.draft) return safeJson({ status: "unavailable" }, 404, headers);
    const input = publicBuilderDraftUpdateSchema.parse(await readJson(request, 128 * 1024));
    const result = await resolved.services.anonymousBuilder.updateDraft({
      sessionId: resolved.session.sessionId,
      revision: input.revision,
      schemaVersion: input.state.schemaVersion,
      productFamily: input.productFamily,
      planKey: input.planKey,
      state: input.state,
    });
    if (result.status === "updated") return safeJson(result, 200, headers);
    if (result.status === "conflict") return safeJson(result, 409, headers);
    return safeJson({ status: "unavailable" }, 404, headers);
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return safeJson({ status: "validation_failed" }, 400, headers);
    }
    console.error("public_builder_draft_write_failed", {
      reason: error instanceof Error ? error.message : "unknown_error",
    });
    return safeJson({ status: "temporarily_unavailable" }, 503, headers);
  }
}
