import type { NextRequest } from "next/server";
import { getServices } from "../../../../lib/container";
import { hasTrustedOrigin, safeJson } from "../../../../lib/http";

export async function POST(request: NextRequest) {
  if (!(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  const token = request.cookies.get("djay_tenant_session")?.value;
  if (token) await (await getServices()).session.logout(token);
  const response = safeJson({ status: "signed_out" });
  response.cookies.delete("djay_tenant_session");
  response.cookies.delete("djay_tenant_mfa_challenge");
  return response;
}
