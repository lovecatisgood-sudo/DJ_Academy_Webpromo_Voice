import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../lib/http";
import { resolveTenantRequest } from "../../../lib/tenant-context";

const sourceSchema = z.object({
  name: z.string().trim().min(2).max(160),
  sourceKind: z.enum(["text", "file", "url", "structured"]),
  content: z.string().min(1).max(500_000),
}).strict();

export async function GET(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "knowledge.read")) return safeJson({ status: "not_found" }, 404);
  return safeJson({ sources: await resolved.services.sharedDomain.listKnowledge(resolved.context) });
}

export async function POST(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "knowledge.write") || !(await hasTrustedOrigin(request))) {
    return safeJson({ status: "not_found" }, 404);
  }
  try {
    return safeJson(await resolved.services.sharedDomain.createKnowledgeSource(resolved.context, sourceSchema.parse(await readJson(request))), 201);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400) : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
