import type { NextRequest } from "next/server";
import { getServices } from "../../../lib/container";
import { safeJson } from "../../../lib/http";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("djay_tenant_session")?.value;
  if (!token) return safeJson({ status: "unauthenticated" }, 401);
  const { session } = await getServices();
  const current = await session.current(token);
  if (!current) return safeJson({ status: "unauthenticated" }, 401);
  return safeJson({
    status: "authenticated",
    selectedTenantId: current.selectedTenantId,
    mfaVerifiedAt: current.mfaVerifiedAt,
    workspaces: current.workspaces,
  });
}
