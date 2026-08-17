import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../../../lib/http";
import { catalogueDraftFieldsSchema } from "../../../../../lib/structured-catalogue";
import { resolveTenantRequest } from "../../../../../lib/tenant-context";

const importSchema = z.object({
  collectionId: z.uuid(),
  items: z.array(catalogueDraftFieldsSchema.omit({ collectionId: true }).refine(
    (value) => (value.priceMinor === null) === (value.currency === null),
    { path: ["priceMinor"], message: "Price and currency are required together." },
  )).min(1).max(200),
}).strict().superRefine((value, context) => {
  const keys = new Set<string>();
  for (const [index, item] of value.items.entries()) {
    if (keys.has(item.externalKey)) context.addIssue({ code: "custom", path: ["items", index, "externalKey"], message: "duplicate_external_key" });
    keys.add(item.externalKey);
  }
});

export async function POST(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "knowledge.write") || !(await hasTrustedOrigin(request))) {
    return safeJson({ status: "not_found" }, 404);
  }
  try {
    const input = importSchema.parse(await readJson(request));
    const result = await resolved.services.knowledgeIngestion.importCatalogDrafts(resolved.context, input.collectionId, input.items);
    return safeJson(result, result.status === "imported_drafts" ? 200 : result.status === "not_found" ? 404 : result.status === "validation_failed" ? 400 : 403);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400)
      : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
