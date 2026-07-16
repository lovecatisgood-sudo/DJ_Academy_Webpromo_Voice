import type { NextRequest } from "next/server";
import { authCookieNames, clearTenantSessionCookie } from "../../../../lib/auth-cookies";
import { getServices } from "../../../../lib/container";
import { hasTrustedOrigin, safeJson } from "../../../../lib/http";

export async function POST(request: NextRequest) {
  if (!(await hasTrustedOrigin(request))) return safeJson({ ok: false }, 403);
  const token = request.cookies.get(authCookieNames.tenantSession)?.value;
  const { session, env } = await getServices();
  if (token) await session.logout(token);
  const response = safeJson({ ok: true });
  clearTenantSessionCookie(response, env.NODE_ENV === "production");
  return response;
}
