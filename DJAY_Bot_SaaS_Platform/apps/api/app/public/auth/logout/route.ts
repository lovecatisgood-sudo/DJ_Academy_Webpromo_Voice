import type { NextRequest } from "next/server";
import { authCookieNames, clearTenantChallengeCookie, clearTenantSessionCookie } from "../../../../lib/auth-cookies";
import { getServices } from "../../../../lib/container";
import { hasTrustedOrigin, safeJson } from "../../../../lib/http";

export async function POST(request: NextRequest) {
  if (!(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  const token = request.cookies.get(authCookieNames.tenantSession)?.value;
  const services = await getServices();
  if (token) await services.session.logout(token);
  const response = safeJson({ status: "signed_out" });
  clearTenantSessionCookie(response, services.env.NODE_ENV === "production");
  clearTenantChallengeCookie(response, services.env.NODE_ENV === "production");
  return response;
}
