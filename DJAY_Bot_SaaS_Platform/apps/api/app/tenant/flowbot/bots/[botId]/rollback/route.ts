import { tenantRoleAllows } from "@djay/authorization";
import { uuidSchema } from "@djay/shared";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../../../../lib/http";
import { resolveTenantRequest } from "../../../../../../lib/tenant-context";

const bodySchema = z.object({ sourceVersionId: z.uuid() }).strict();
export async function POST(request: NextRequest, route: { params: Promise<{ botId: string }> }) {
  const resolved = await resolveTenantRequest(request); const botId = uuidSchema.safeParse((await route.params).botId);
  if (!resolved || !botId.success || !tenantRoleAllows(resolved.context.role, "flowbot.publish") || !(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  try {
    const body = bodySchema.parse(await readJson(request)); const result = await resolved.services.flowbot.rollback(resolved.context, botId.data, body.sourceVersionId);
    return safeJson(result, result.status === "published" ? 200 : result.status === "validation_failed" ? 422 : 404);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError ? safeJson({ status: "validation_failed" }, 400) : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
