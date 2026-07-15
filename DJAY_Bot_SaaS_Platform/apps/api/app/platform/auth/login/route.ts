import { ZodError } from "zod";
import { getServices } from "../../../../lib/container";
import { clientAddress, enforceRateLimit, hasTrustedOrigin, readJson, requestId, safeJson } from "../../../../lib/http";

export async function POST(request: Request) {
  const id = requestId();
  if (!(await hasTrustedOrigin(request))) return safeJson({ status: "invalid_credentials" }, 401);
  const limit = await enforceRateLimit("platform-login", clientAddress(request), 12, 15 * 60 * 1000);
  if (!limit.allowed) return safeJson({ status: "invalid_credentials" }, 401);
  try {
    const raw = await readJson(request);
    const result = await (await getServices()).platformAuth.startLogin({
      ...(typeof raw === "object" && raw !== null ? raw : {}),
      requestId: id,
    });
    if (result.status !== "mfa_required") return safeJson(result, 401);
    const response = safeJson({ status: result.status });
    response.cookies.set("djay_platform_challenge", result.challengeToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: Math.max(1, Math.floor((result.expiresAt.getTime() - Date.now()) / 1000)),
    });
    return response;
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "invalid_credentials" }, 401)
      : safeJson({ code: "temporarily_unavailable" }, 503);
  }
}
