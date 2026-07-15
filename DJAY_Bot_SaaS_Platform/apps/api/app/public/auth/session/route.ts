import type { NextRequest } from "next/server";
import { getServices } from "../../../../lib/container";
import { safeJson } from "../../../../lib/http";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("djay_tenant_session")?.value;
  if (!token) return safeJson({ status: "unauthenticated" }, 401);
  const session = await (await getServices()).session.current(token);
  if (!session) return safeJson({ status: "unauthenticated" }, 401);
  return safeJson({
    status: "authenticated",
    selectedTenantId: session.selectedTenantId,
    workspaces: session.workspaces,
    mfaVerifiedAt: session.mfaVerifiedAt,
  });
}
