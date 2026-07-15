import type { NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { getServices } from "../../../../../lib/container";
import { clientAddress, enforceRateLimit, hasTrustedOrigin, readJson, requestId, safeJson } from "../../../../../lib/http";

const bodySchema = z.object({ code: z.string().regex(/^\d{6}$/) }).strict();

export async function POST(request: NextRequest) {
  if (!(await hasTrustedOrigin(request))) return safeJson({ status: "invalid_challenge" }, 401);
  const limit = await enforceRateLimit("tenant-mfa-login", clientAddress(request), 15, 15 * 60 * 1000);
  if (!limit.allowed) return safeJson({ status: "invalid_challenge" }, 401);
  try {
    const challengeToken = request.cookies.get("djay_tenant_mfa_challenge")?.value;
    if (!challengeToken) return safeJson({ status: "invalid_challenge" }, 401);
    const body = bodySchema.parse(await readJson(request));
    const services = await getServices();
    const result = await services.tenantMfa.completeLogin({
      challengeToken,
      code: body.code,
      requestId: requestId(),
    });
    if (result.status !== "authenticated") return safeJson(result, 401);
    const response = safeJson({
      status: result.status,
      selectedTenantId: result.selectedTenantId,
      workspaces: result.workspaces,
    });
    response.cookies.delete("djay_tenant_mfa_challenge");
    response.cookies.set("djay_tenant_session", result.sessionToken, {
      httpOnly: true,
      secure: services.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: Math.max(1, Math.floor((result.idleExpiresAt.getTime() - Date.now()) / 1000)),
    });
    return response;
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "invalid_challenge" }, 401)
      : safeJson({ code: "temporarily_unavailable" }, 503);
  }
}
