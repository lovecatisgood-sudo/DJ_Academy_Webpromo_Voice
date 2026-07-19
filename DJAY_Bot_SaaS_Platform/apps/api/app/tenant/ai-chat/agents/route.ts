import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../../lib/http";
import { resolveTenantRequest } from "../../../../lib/tenant-context";

const agentSchema = z.object({
  name: z.string().trim().min(2).max(100),
  businessName: z.string().trim().min(2).max(200),
  defaultLanguage: z.enum(["th", "en"]),
}).strict();

export async function GET(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "ai_chat.read")) return safeJson({ status: "not_found" }, 404);
  const [agents, capabilities] = await Promise.all([
    resolved.services.aiChat.listAgents(resolved.context),
    resolved.services.aiChat.authoringCapabilities(resolved.context),
  ]);
  return safeJson({ agents, capabilities });
}

export async function POST(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "ai_chat.author") || !(await hasTrustedOrigin(request))) {
    return safeJson({ status: "not_found" }, 404);
  }
  try {
    const result = await resolved.services.aiChat.createAgent(resolved.context, agentSchema.parse(await readJson(request)));
    return safeJson(result, result.status === "created" ? 201 : result.status === "limit_reached" ? 409 : 403);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400)
      : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
