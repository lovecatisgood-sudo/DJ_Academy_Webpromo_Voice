import type { NextRequest } from "next/server";
import { getServices } from "../../../../../lib/container";
import { hasTrustedOrigin, safeJson } from "../../../../../lib/http";
import { publicBuilderImportJobIdSchema } from "../../../../../lib/public-builder-import";
import { PUBLIC_BUILDER_TEST_COOKIE, resolvePublicBuilderTestSession } from "../../../../../lib/public-builder-test-quota";

async function authority(request: NextRequest, jobId: string) {
  const parsedJobId = publicBuilderImportJobIdSchema.safeParse(jobId);
  if (!parsedJobId.success) return null;
  const services = await getServices();
  const cookie = request.cookies.get(PUBLIC_BUILDER_TEST_COOKIE)?.value;
  if (!cookie) return null;
  const session = resolvePublicBuilderTestSession(cookie, services.rateLimitKey);
  if (session.cookieValue !== cookie) return null;
  return { services, session, jobId: parsedJobId.data } as const;
}

export async function GET(request: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  const resolved = await authority(request, (await context.params).jobId);
  if (!resolved) return safeJson({ status: "not_found" }, 404);
  const job = await resolved.services.anonymousBuilderImports.getJob(resolved.session.sessionId, resolved.jobId);
  return job ? safeJson({ status: "ready", job }) : safeJson({ status: "not_found" }, 404);
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  if (!(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  const resolved = await authority(request, (await context.params).jobId);
  if (!resolved) return safeJson({ status: "not_found" }, 404);
  const result = await resolved.services.anonymousBuilderImports.cancelJob(resolved.session.sessionId, resolved.jobId);
  return result.status === "unavailable" ? safeJson({ status: "not_found" }, 404) : safeJson(result);
}
