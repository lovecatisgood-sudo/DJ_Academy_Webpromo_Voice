import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../lib/http";
import { resolveTenantRequest } from "../../../lib/tenant-context";

const sourceSchema = z.object({
  name: z.string().trim().min(2).max(160),
  sourceKind: z.enum(["text", "file", "url", "structured"]),
  content: z.string().min(1).max(500_000),
  collectionId: z.uuid().optional(),
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
    const parsed = sourceSchema.parse(await readJson(request));
    const result = await resolved.services.sharedDomain.createKnowledgeSource(resolved.context, {
      name: parsed.name,
      sourceKind: parsed.sourceKind,
      content: parsed.content,
      ...(parsed.collectionId ? { collectionId: parsed.collectionId } : {}),
    });
    return safeJson(result, result.status === "created" ? 201 : 403);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400) : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
