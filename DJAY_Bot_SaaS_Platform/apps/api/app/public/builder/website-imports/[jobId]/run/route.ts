import type { NextRequest } from "next/server";
import { getServices } from "../../../../../../lib/container";
import { hasTrustedOrigin, safeJson } from "../../../../../../lib/http";
import { executePublicBuilderImport, publicBuilderImportJobIdSchema } from "../../../../../../lib/public-builder-import";
import { PUBLIC_BUILDER_TEST_COOKIE, resolvePublicBuilderTestSession } from "../../../../../../lib/public-builder-test-quota";

export async function POST(request: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  if (!(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  const parsedJobId = publicBuilderImportJobIdSchema.safeParse((await context.params).jobId);
  if (!parsedJobId.success) return safeJson({ status: "not_found" }, 404);
  const services = await getServices();
  const cookie = request.cookies.get(PUBLIC_BUILDER_TEST_COOKIE)?.value;
  if (!cookie) return safeJson({ status: "not_found" }, 404);
  const session = resolvePublicBuilderTestSession(cookie, services.rateLimitKey);
  if (session.cookieValue !== cookie) return safeJson({ status: "not_found" }, 404);
  const result = await executePublicBuilderImport({
    store: services.anonymousBuilderImports,
    sessionId: session.sessionId,
    jobId: parsedJobId.data,
  });
  if (result.status === "unavailable") return safeJson({ status: "not_found" }, 404);
  if (["failed", "stale", "retry_exhausted"].includes(result.status)) return safeJson(result, 422);
  if (result.status === "in_progress") return safeJson(result, 202);
  return safeJson(result);
}
