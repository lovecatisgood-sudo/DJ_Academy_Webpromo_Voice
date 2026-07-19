import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../../lib/http";
import { resolveTenantRequest } from "../../../../lib/tenant-context";

const schema = z.object({ name: z.string().trim().min(2).max(160), description: z.string().trim().max(1000).default("") }).strict();
export async function GET(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "knowledge.read")) return safeJson({ status: "not_found" }, 404);
  return safeJson({ collections: await resolved.services.knowledgeIngestion.listCollections(resolved.context) });
}
export async function POST(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "knowledge.write") || !(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  try {
    const result = await resolved.services.knowledgeIngestion.createCollection(resolved.context, schema.parse(await readJson(request)));
    return safeJson(result, result.status === "created" ? 201 : result.status === "limit_reached" ? 409 : 403);
  } catch (error) { return error instanceof ZodError || error instanceof SyntaxError ? safeJson({ status: "validation_failed" }, 400) : safeJson({ status: "temporarily_unavailable" }, 503); }
}
