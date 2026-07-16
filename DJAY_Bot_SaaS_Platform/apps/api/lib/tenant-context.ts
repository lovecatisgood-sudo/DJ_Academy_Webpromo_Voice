import { createTenantContext, type TenantContext } from "@djay/tenancy";
import type { ResolvedSession } from "@djay/auth";
import type { NextRequest } from "next/server";
import { authCookieNames } from "./auth-cookies";
import { getServices, type Services } from "./container";
import { requestId } from "./http";

type ResolvedTenantRequest = Readonly<{
  services: Services;
  context: TenantContext;
  session: ResolvedSession;
}>;

export async function resolveTenantRequest(request: NextRequest): Promise<ResolvedTenantRequest | null> {
  const token = request.cookies.get(authCookieNames.tenantSession)?.value;
  if (!token) return null;
  const services = await getServices();
  const session = await services.session.current(token);
  if (!session?.selectedTenantId) return null;
  const workspace = session.workspaces.find((candidate) => candidate.tenantId === session.selectedTenantId);
  if (!workspace) return null;
  return {
    services,
    session,
    context: createTenantContext({
      tenantId: workspace.tenantId,
      userId: session.userId,
      membershipId: workspace.membershipId,
      sessionId: session.sessionId,
      role: workspace.role,
      requestId: requestId(),
    }),
  };
}
