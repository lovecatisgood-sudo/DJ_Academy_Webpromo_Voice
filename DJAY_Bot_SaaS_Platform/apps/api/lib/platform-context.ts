import { createPlatformContext, type PlatformContext } from "@djay/tenancy";
import type { PlatformSession } from "@djay/platform-auth";
import type { NextRequest } from "next/server";
import { getServices, type Services } from "./container";
import { requestId } from "./http";

export async function resolvePlatformRequest(request: NextRequest): Promise<Readonly<{
  services: Services;
  session: PlatformSession;
  context: PlatformContext;
}> | null> {
  const token = request.cookies.get("djay_platform_session")?.value;
  if (!token) return null;
  const services = await getServices();
  const session = await services.platformAuth.current(token);
  if (!session) return null;
  return {
    services,
    session,
    context: createPlatformContext({
      platformUserId: session.userId,
      sessionId: session.sessionId,
      role: session.role,
      requestId: requestId(),
      reauthenticatedAt: session.reauthenticatedAt,
    }),
  };
}
