import { loginInputSchema } from "@djay/auth";
import { ZodError } from "zod";
import { clearTenantChallengeCookie, setTenantChallengeCookie, setTenantSessionCookie } from "../../../../lib/auth-cookies";
import { getServices } from "../../../../lib/container";
import { clientAddress, enforceRateLimit, hasTrustedOrigin, readJson, requestId, safeJson } from "../../../../lib/http";

export async function POST(request: Request) {
  const id = requestId();
  if (!(await hasTrustedOrigin(request))) return safeJson({ status: "invalid_credentials" }, 401);
  let locale: "th" | "en" = "th";
  try {
    const raw = await readJson(request);
    locale = typeof raw === "object" && raw !== null && "locale" in raw && raw.locale === "en" ? "en" : "th";
    const body = loginInputSchema.parse({
      ...(typeof raw === "object" && raw !== null ? raw : {}),
      requestId: id,
    });
    const [accountLimit, clientLimit] = await Promise.all([
      enforceRateLimit("login-account", body.email.trim().toLowerCase(), 8, 15 * 60 * 1000),
      enforceRateLimit("login-client", clientAddress(request), 50, 15 * 60 * 1000),
    ]);
    if (!accountLimit.allowed || !clientLimit.allowed) {
      return safeJson({ status: "invalid_credentials" }, 401);
    }

    const { login, env } = await getServices();
    const result = await login(body);
    if (result.status === "mfa_required") {
      const response = safeJson({ status: result.status });
      setTenantChallengeCookie(response, result.challengeToken, result.challengeExpiresAt, env.NODE_ENV === "production");
      return response;
    }
    if (result.status !== "authenticated") return safeJson(result, 401);
    const response = safeJson({
      status: result.status,
      selectedTenantId: result.selectedTenantId,
      workspaces: result.workspaces,
    });
    setTenantSessionCookie(response, result.sessionToken, result.idleExpiresAt, env.NODE_ENV === "production");
    clearTenantChallengeCookie(response, env.NODE_ENV === "production");
    return response;
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return safeJson({ status: "invalid_credentials" }, 401);
    }
    console.error("login_failed", { requestId: id, error: error instanceof Error ? error.name : "unknown" });
    return safeJson({ code: "temporarily_unavailable", message: locale === "en" ? "Sign in is unavailable." : "ระบบเข้าสู่ระบบไม่พร้อมใช้งานชั่วคราว", requestId: id }, 503);
  }
}
