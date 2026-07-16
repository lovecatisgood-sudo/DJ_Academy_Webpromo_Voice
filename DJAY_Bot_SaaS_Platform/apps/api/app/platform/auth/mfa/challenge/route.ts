import type { NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { authCookieNames, clearPlatformChallengeCookie, setPlatformSessionCookie } from "../../../../../lib/auth-cookies";
import { getServices } from "../../../../../lib/container";
import { clientAddress, enforceRateLimit, hasTrustedOrigin, readJson, requestId, safeJson } from "../../../../../lib/http";

const bodySchema = z.object({ code: z.string().regex(/^\d{6}$/) }).strict();

export async function POST(request: NextRequest) {
  if (!(await hasTrustedOrigin(request))) return safeJson({ status: "invalid_challenge" }, 401);
  const limit = await enforceRateLimit("platform-mfa", clientAddress(request), 15, 15 * 60 * 1000);
  if (!limit.allowed) return safeJson({ status: "invalid_challenge" }, 401);
  try {
    const challengeToken = request.cookies.get(authCookieNames.platformChallenge)?.value;
    if (!challengeToken) return safeJson({ status: "invalid_challenge" }, 401);
    const body = bodySchema.parse(await readJson(request));
    const services = await getServices();
    const result = await services.platformAuth.completeMfa({
      challengeToken,
      code: body.code,
      requestId: requestId(),
    });
    if (result.status !== "authenticated") return safeJson(result, 401);
    const response = safeJson({ status: result.status });
    clearPlatformChallengeCookie(response, services.env.NODE_ENV === "production");
    setPlatformSessionCookie(response, result.sessionToken, result.idleExpiresAt, services.env.NODE_ENV === "production");
    return response;
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "invalid_challenge" }, 401)
      : safeJson({ code: "temporarily_unavailable" }, 503);
  }
}
