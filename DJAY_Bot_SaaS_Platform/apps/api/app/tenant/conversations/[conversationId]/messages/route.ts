import { tenantRoleAllows } from "@djay/authorization";
import { messageInputSchema } from "@djay/domain";
import { uuidSchema } from "@djay/shared";
import type { NextRequest } from "next/server";
import { ZodError } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../../../lib/http";
import { resolveTenantRequest } from "../../../../../lib/tenant-context";

export async function GET(request: NextRequest, route: { params: Promise<{ conversationId: string }> }) {
  const resolved = await resolveTenantRequest(request);
  const parsed = uuidSchema.safeParse((await route.params).conversationId);
  if (!resolved || !parsed.success || !tenantRoleAllows(resolved.context.role, "conversations.read")) return safeJson({ status: "not_found" }, 404);
  return safeJson({ messages: await resolved.services.sharedDomain.listMessages(resolved.context, parsed.data) });
}

export async function POST(request: NextRequest, route: { params: Promise<{ conversationId: string }> }) {
  const resolved = await resolveTenantRequest(request);
  const parsed = uuidSchema.safeParse((await route.params).conversationId);
  if (!resolved || !parsed.success || !tenantRoleAllows(resolved.context.role, "conversations.reply") || !(await hasTrustedOrigin(request))) {
    return safeJson({ status: "not_found" }, 404);
  }
  try {
    const result = await resolved.services.sharedDomain.appendMessage(resolved.context, parsed.data, messageInputSchema.parse(await readJson(request)));
    return safeJson(result, result.status === "created" ? 201 : result.status === "replayed" ? 200 : result.status === "handover_required" ? 409 : 404);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400) : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
