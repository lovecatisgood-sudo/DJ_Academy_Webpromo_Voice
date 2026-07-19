import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../../lib/http";
import { resolveTenantRequest } from "../../../../lib/tenant-context";

const httpsUrl = z.string().trim().max(2000).url().transform((value, context) => {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash || url.search) {
    context.addIssue({ code: "custom", message: "A clean HTTPS page URL is required." }); return z.NEVER;
  }
  return url.href;
});
const schema = z.object({ collectionId: z.uuid(), name: z.string().trim().min(2).max(160), url: httpsUrl,
  refreshIntervalHours: z.number().int().min(24).max(8760).nullable().default(168) }).strict();
export async function POST(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "knowledge.write") || !(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  try {
    const result = await resolved.services.knowledgeIngestion.requestCrawl(resolved.context, schema.parse(await readJson(request)));
    return safeJson(result, result.status === "queued" ? 202 : result.status === "not_found" ? 404 : 403);
  } catch (error) { return error instanceof ZodError || error instanceof SyntaxError ? safeJson({ status: "validation_failed" }, 400) : safeJson({ status: "temporarily_unavailable" }, 503); }
}
