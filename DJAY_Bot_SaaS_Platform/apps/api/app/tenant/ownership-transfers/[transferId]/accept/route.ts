import type { NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../../../lib/http";
import { resolveTenantRequest } from "../../../../../lib/tenant-context";

const paramsSchema = z.object({ transferId: z.uuid() }).strict();
const bodySchema = z.object({ token: z.string().min(32).max(256) }).strict();

export async function POST(
  request: NextRequest,
  route: { params: Promise<{ transferId: string }> },
) {
  if (!(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  const resolved = await resolveTenantRequest(request);
  if (!resolved) return safeJson({ status: "not_found" }, 404);
  try {
    const params = paramsSchema.parse(await route.params);
    const body = bodySchema.parse(await readJson(request));
    const result = await resolved.services.ownership.accept(
      resolved.context,
      { transferId: params.transferId, token: body.token },
      resolved.session.reauthenticatedAt,
      resolved.session.mfaVerifiedAt,
    );
    if (result.status !== "accepted") {
      return safeJson({ status: result.status }, result.status === "reauthentication_required" ? 403 : 404);
    }
    const response = safeJson(result);
    response.cookies.delete("djay_tenant_session");
    return response;
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "not_found" }, 404)
      : safeJson({ code: "temporarily_unavailable" }, 503);
  }
}
