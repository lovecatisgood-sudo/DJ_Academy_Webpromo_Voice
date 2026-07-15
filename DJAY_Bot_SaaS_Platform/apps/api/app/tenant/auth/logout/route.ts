import type { NextRequest } from "next/server";
import { getServices } from "../../../../lib/container";
import { hasTrustedOrigin, safeJson } from "../../../../lib/http";

export async function POST(request: NextRequest) {
  if (!(await hasTrustedOrigin(request))) return safeJson({ ok: false }, 403);
  const token = request.cookies.get("djay_tenant_session")?.value;
  if (token) {
    const { session } = await getServices();
    await session.logout(token);
  }
  const response = safeJson({ ok: true });
  response.cookies.set("djay_tenant_session", "", { httpOnly: true, maxAge: 0, path: "/", sameSite: "lax" });
  return response;
}

