import type { NextRequest } from "next/server";
import { ZodError } from "zod";
import { authCookieNames, clearTenantSessionCookie } from "../../../../lib/auth-cookies";
import { getServices } from "../../../../lib/container";
import { clientAddress, enforceRateLimit, hasTrustedOrigin, readJson, requestId, safeJson } from "../../../../lib/http";

export async function POST(request: NextRequest) {
  const id = requestId();
  if (!(await hasTrustedOrigin(request))) return safeJson({ status: "invalid_or_expired" }, 404);
  const limit = await enforceRateLimit("invitation-accept", clientAddress(request), 30, 60 * 60 * 1000);
  if (!limit.allowed) return safeJson({ status: "invalid_or_expired" }, 404);
  try {
    const services = await getServices();
    const sessionToken = request.cookies.get(authCookieNames.tenantSession)?.value;
    const current = sessionToken ? await services.session.current(sessionToken) : null;
    const raw = await readJson(request);
    const body = { ...(typeof raw === "object" && raw !== null ? raw : {}), requestId: id };
    const result = await services.invitations.accept(body, current?.userId);
    if (result.status === "invalid_or_expired") return safeJson(result, 404);
    if (result.status === "sign_in_required") return safeJson(result, 401);
    if (result.status === "account_details_required") return safeJson(result, 422);
    if (result.status !== "accepted" && result.status !== "already_accepted") {
      return safeJson({ status: "invalid_or_expired" }, 404);
    }

    const response = safeJson({
      status: result.status,
      tenantId: result.tenantId,
      requiresLogin: true,
    });
    if (sessionToken) clearTenantSessionCookie(response, services.env.NODE_ENV === "production");
    return response;
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ code: "validation_failed" }, 400)
      : safeJson({ code: "temporarily_unavailable" }, 503);
  }
}
