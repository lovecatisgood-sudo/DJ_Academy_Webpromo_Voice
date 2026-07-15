import type { NextRequest } from "next/server";
import { safeJson } from "../../../lib/http";
import { resolvePlatformRequest } from "../../../lib/platform-context";

export async function GET(request: NextRequest) {
  const resolved = await resolvePlatformRequest(request);
  if (!resolved) return safeJson({ status: "unauthenticated" }, 401);
  return safeJson({
    status: "authenticated",
    user: {
      id: resolved.session.userId,
      displayName: resolved.session.displayName,
      role: resolved.session.role,
      mfaVerifiedAt: resolved.session.mfaVerifiedAt,
    },
  });
}
