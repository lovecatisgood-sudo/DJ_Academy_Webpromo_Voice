import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../../lib/http";
import { catalogueDraftSchema } from "../../../../lib/structured-catalogue";
import { resolveTenantRequest } from "../../../../lib/tenant-context";

const lifecycleSchema = z.object({ itemId: z.uuid(), action: z.enum(["publish", "archive"]) }).strict();
export async function GET(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "knowledge.read")) return safeJson({ status: "not_found" }, 404);
  const collectionId = z.uuid().safeParse(request.nextUrl.searchParams.get("collectionId"));
  if (!collectionId.success) return safeJson({ status: "validation_failed" }, 400);
  const [items, advanced] = await Promise.all([
    resolved.services.knowledgeIngestion.listCatalogItems(resolved.context, collectionId.data),
    resolved.services.knowledgeIngestion.hasStructuredCatalogue(resolved.context),
  ]);
  return safeJson({ items, capabilities: { structuredCatalogue: advanced } });
}
export async function POST(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "knowledge.write") || !(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  try {
    const result = await resolved.services.knowledgeIngestion.saveCatalogDraft(resolved.context, catalogueDraftSchema.parse(await readJson(request)));
    return safeJson(result, result.status === "saved_draft" ? 200 : result.status === "not_found" ? 404 : 403);
  } catch (error) { return error instanceof ZodError || error instanceof SyntaxError ? safeJson({ status: "validation_failed" }, 400) : safeJson({ status: "temporarily_unavailable" }, 503); }
}
export async function PATCH(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "knowledge.write") || !(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  try {
    const input = lifecycleSchema.parse(await readJson(request));
    const result = input.action === "publish"
      ? await resolved.services.knowledgeIngestion.publishCatalogItem(resolved.context, input.itemId)
      : await resolved.services.knowledgeIngestion.archiveCatalogItem(resolved.context, input.itemId);
    return safeJson(result, result.status === "not_found" ? 404 : result.status === "not_entitled" ? 403 : 200);
  } catch (error) { return error instanceof ZodError || error instanceof SyntaxError ? safeJson({ status: "validation_failed" }, 400) : safeJson({ status: "temporarily_unavailable" }, 503); }
}
