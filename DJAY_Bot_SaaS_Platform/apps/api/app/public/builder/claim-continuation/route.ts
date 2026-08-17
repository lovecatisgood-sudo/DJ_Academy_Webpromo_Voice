import { createOpaqueToken, hashOpaqueToken } from "@djay/auth";
import type { NextRequest } from "next/server";
import { getServices } from "../../../../lib/container";
import { clientAddress, enforceRateLimit, hasTrustedOrigin, safeJson } from "../../../../lib/http";
import { PUBLIC_BUILDER_TEST_COOKIE, parsePublicBuilderTestSession } from "../../../../lib/public-builder-test-quota";

const continuationTtlMs = 15 * 60 * 1_000;

export async function POST(request: NextRequest) {
  if (!(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  try {
    const limit = await enforceRateLimit("builder-claim-continuation", clientAddress(request), 10, 15 * 60 * 1_000);
    if (!limit.allowed) return safeJson({ status: "temporarily_unavailable" }, 429, { "Retry-After": String(limit.retryAfterSeconds) });
    const services = await getServices();
    const builderSession = parsePublicBuilderTestSession(
      request.cookies.get(PUBLIC_BUILDER_TEST_COOKIE)?.value,
      services.rateLimitKey,
    );
    if (!builderSession) return safeJson({ status: "unavailable" }, 404);
    const token = createOpaqueToken();
    const now = new Date();
    const result = await services.anonymousBuilder.issueClaimContinuation({
      sessionId: builderSession.sessionId,
      tokenHash: hashOpaqueToken(token),
      now,
      expiresAt: new Date(now.getTime() + continuationTtlMs),
    });
    return result.status === "issued"
      ? safeJson({
          status: "issued", token,
          expiresAt: new Date(now.getTime() + continuationTtlMs).toISOString(),
          tenantLoginUrl: services.env.TENANT_APP_URL,
        }, 201)
      : safeJson({ status: "unavailable" }, 404);
  } catch (error) {
    console.error("builder_claim_continuation_failed", { reason: error instanceof Error ? error.name : "unknown" });
    return safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
