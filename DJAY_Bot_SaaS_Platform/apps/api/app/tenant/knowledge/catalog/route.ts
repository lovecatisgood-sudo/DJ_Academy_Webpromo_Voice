import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../../lib/http";
import { resolveTenantRequest } from "../../../../lib/tenant-context";

const schema = z.object({ collectionId: z.uuid(), itemKind: z.enum(["product", "service"]),
  externalKey: z.string().trim().regex(/^[a-zA-Z0-9_.-]{1,100}$/), name: z.string().trim().min(2).max(200),
  description: z.string().trim().min(1).max(10000), priceMinor: z.number().int().min(0).nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/).nullable(), attributes: z.record(z.string(), z.unknown()).default({}),
}).strict().refine((value) => (value.priceMinor === null) === (value.currency === null), { path: ["priceMinor"], message: "Price and currency are required together." });
export async function GET(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "knowledge.read")) return safeJson({ status: "not_found" }, 404);
  const collectionId = z.uuid().safeParse(request.nextUrl.searchParams.get("collectionId"));
  if (!collectionId.success) return safeJson({ status: "validation_failed" }, 400);
  return safeJson({ items: await resolved.services.knowledgeIngestion.listCatalogItems(resolved.context, collectionId.data) });
}
export async function POST(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "knowledge.write") || !(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  try {
    const result = await resolved.services.knowledgeIngestion.upsertCatalogItem(resolved.context, schema.parse(await readJson(request)));
    return safeJson(result, result.status === "saved" ? 200 : result.status === "not_found" ? 404 : 403);
  } catch (error) { return error instanceof ZodError || error instanceof SyntaxError ? safeJson({ status: "validation_failed" }, 400) : safeJson({ status: "temporarily_unavailable" }, 503); }
}
