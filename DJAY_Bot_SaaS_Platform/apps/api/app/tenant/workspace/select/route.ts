import type { NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { getServices } from "../../../../lib/container";
import { hasTrustedOrigin, readJson, requestId, safeJson } from "../../../../lib/http";

const inputSchema = z.object({ tenantId: z.uuid() }).strict();

export async function POST(request: NextRequest) {
  const token = request.cookies.get("djay_tenant_session")?.value;
  if (!token) return safeJson({ status: "not_found" }, 404);
  if (!(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  try {
    const input = inputSchema.parse(await readJson(request));
    const { session, env } = await getServices();
    const result = await session.selectWorkspace(token, { ...input, requestId: requestId() });
    if (result.status !== "selected") return safeJson({ status: "not_found" }, 404);
    const response = safeJson({ status: "selected", tenantId: result.tenantId });
    response.cookies.set("djay_tenant_session", result.sessionToken, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: Math.max(1, Math.floor((result.idleExpiresAt.getTime() - Date.now()) / 1000)),
    });
    return response;
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "not_found" }, 404)
      : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}

