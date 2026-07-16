import type { NextRequest } from "next/server";
import { authCookieNames, clearPlatformChallengeCookie, clearPlatformSessionCookie } from "../../../../lib/auth-cookies";
import { getServices } from "../../../../lib/container";
import { hasTrustedOrigin, safeJson } from "../../../../lib/http";

export async function POST(request: NextRequest) {
  if (!(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  const token = request.cookies.get(authCookieNames.platformSession)?.value;
  const services = await getServices();
  if (token) await services.platformAuth.logout(token);
  const response = safeJson({ status: "signed_out" });
  clearPlatformSessionCookie(response, services.env.NODE_ENV === "production");
  clearPlatformChallengeCookie(response, services.env.NODE_ENV === "production");
  return response;
}
