import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../../../lib/http";
import { resolveTenantRequest } from "../../../../../lib/tenant-context";

const collectionIdSchema = z.uuid();
const updateSchema = z.object({ collectionId: z.uuid(), agentIds: z.array(z.uuid()).max(3) }).strict();

export async function GET(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "knowledge.read")) return safeJson({ status: "not_found" }, 404);
  const collectionId = collectionIdSchema.safeParse(request.nextUrl.searchParams.get("collectionId"));
  if (!collectionId.success) return safeJson({ status: "validation_failed" }, 400);
  const [agents, advanced] = await Promise.all([
    resolved.services.knowledgeIngestion.listCatalogAgentBindings(resolved.context, collectionId.data),
    resolved.services.knowledgeIngestion.hasStructuredCatalogue(resolved.context),
  ]);
  return safeJson({ agents, capabilities: { structuredCatalogue: advanced } });
}

export async function PATCH(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "knowledge.write") || !(await hasTrustedOrigin(request))) {
    return safeJson({ status: "not_found" }, 404);
  }
  try {
    const input = updateSchema.parse(await readJson(request));
    const result = await resolved.services.knowledgeIngestion.setCatalogAgentBindings(resolved.context, input.collectionId, input.agentIds);
    return safeJson(result, result.status === "saved" ? 200 : result.status === "not_found" ? 404 : result.status === "invalid_agents" ? 400 : 403);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400)
      : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
