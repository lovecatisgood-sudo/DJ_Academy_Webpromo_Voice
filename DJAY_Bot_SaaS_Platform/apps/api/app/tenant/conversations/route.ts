import { tenantRoleAllows } from "@djay/authorization";
import { conversationInputSchema } from "@djay/domain";
import type { NextRequest } from "next/server";
import { ZodError } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../lib/http";
import { resolveTenantRequest } from "../../../lib/tenant-context";

export async function GET(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "conversations.read")) return safeJson({ status: "not_found" }, 404);
  return safeJson({ conversations: await resolved.services.sharedDomain.listInbox(resolved.context) });
}

export async function POST(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "conversations.reply") || !(await hasTrustedOrigin(request))) {
    return safeJson({ status: "not_found" }, 404);
  }
  try {
    const result = await resolved.services.sharedDomain.createConversation(resolved.context, conversationInputSchema.parse(await readJson(request)));
    return safeJson(result, result.status === "created" ? 201 : 403);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400) : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
