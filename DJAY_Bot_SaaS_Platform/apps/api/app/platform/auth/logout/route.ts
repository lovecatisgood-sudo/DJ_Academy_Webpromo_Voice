import type { NextRequest } from "next/server";
import { getServices } from "../../../../lib/container";
import { hasTrustedOrigin, safeJson } from "../../../../lib/http";

export async function POST(request: NextRequest) {
  if (!(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  const token = request.cookies.get("djay_platform_session")?.value;
  if (token) await (await getServices()).platformAuth.logout(token);
  const response = safeJson({ status: "signed_out" });
  response.cookies.delete("djay_platform_session");
  response.cookies.delete("djay_platform_challenge");
  return response;
}
