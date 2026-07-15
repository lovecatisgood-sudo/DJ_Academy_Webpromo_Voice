import { loginInputSchema } from "@djay/auth";
import { ZodError } from "zod";
import { getServices } from "../../../../lib/container";
import { clientAddress, enforceRateLimit, hasTrustedOrigin, readJson, requestId, safeJson } from "../../../../lib/http";

export async function POST(request: Request) {
  const id = requestId();
  if (!(await hasTrustedOrigin(request))) return safeJson({ status: "invalid_credentials" }, 401);
  try {
    const raw = await readJson(request);
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
      response.cookies.set("djay_tenant_mfa_challenge", result.challengeToken, {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: Math.max(1, Math.floor((result.challengeExpiresAt.getTime() - Date.now()) / 1000)),
      });
      return response;
    }
    if (result.status !== "authenticated") return safeJson(result, 401);
    const response = safeJson({
      status: result.status,
      selectedTenantId: result.selectedTenantId,
      workspaces: result.workspaces,
    });
    response.cookies.set("djay_tenant_session", result.sessionToken, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: Math.max(1, Math.floor((result.idleExpiresAt.getTime() - Date.now()) / 1000)),
    });
    response.cookies.delete("djay_tenant_mfa_challenge");
    return response;
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return safeJson({ status: "invalid_credentials" }, 401);
    }
    console.error("login_failed", { requestId: id, error: error instanceof Error ? error.name : "unknown" });
    return safeJson({ code: "temporarily_unavailable", message: "Sign in is unavailable.", requestId: id }, 503);
  }
}
