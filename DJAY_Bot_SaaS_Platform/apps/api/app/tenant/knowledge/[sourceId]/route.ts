import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../../lib/http";
import { resolveTenantRequest } from "../../../../lib/tenant-context";

const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("include") }).strict(),
  z.object({ action: z.literal("exclude") }).strict(),
  z.object({ action: z.literal("correct"), name: z.string().trim().min(2).max(160), content: z.string().min(1).max(500_000) }).strict(),
  z.object({ action: z.literal("reprocess") }).strict(),
  z.object({ action: z.literal("reindex") }).strict(),
]);

export async function GET(request: NextRequest, { params }: { params: Promise<{ sourceId: string }> }) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "knowledge.read")) return safeJson({ status: "not_found" }, 404);
  const sourceId = z.uuid().safeParse((await params).sourceId);
  if (!sourceId.success) return safeJson({ status: "not_found" }, 404);
  const source = await resolved.services.knowledgeIngestion.getSource(resolved.context, sourceId.data);
  return source ? safeJson({ source }) : safeJson({ status: "not_found" }, 404);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ sourceId: string }> }) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "knowledge.write") || !(await hasTrustedOrigin(request))) {
    return safeJson({ status: "not_found" }, 404);
  }
  try {
    const sourceId = z.uuid().parse((await params).sourceId); const command = commandSchema.parse(await readJson(request));
    const result = command.action === "include"
      ? await resolved.services.knowledgeIngestion.setSourceInclusion(resolved.context, sourceId, true)
      : command.action === "exclude"
        ? await resolved.services.knowledgeIngestion.setSourceInclusion(resolved.context, sourceId, false)
        : command.action === "correct"
          ? await resolved.services.knowledgeIngestion.reviseSource(resolved.context, sourceId, command)
          : command.action === "reprocess"
            ? await resolved.services.knowledgeIngestion.reprocessSource(resolved.context, sourceId)
            : await resolved.services.knowledgeIngestion.reindexSource(resolved.context, sourceId);
    const status = result.status === "not_found" ? 404
      : result.status === "not_entitled" ? 403
      : result.status === "not_reprocessable" ? 409
        : result.status === "queued" || result.status === "already_queued" ? 202 : 200;
    return safeJson(result, status);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400) : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ sourceId: string }> }) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "knowledge.write") || !(await hasTrustedOrigin(request))) {
    return safeJson({ status: "not_found" }, 404);
  }
  const sourceId = z.uuid().safeParse((await params).sourceId);
  if (!sourceId.success) return safeJson({ status: "not_found" }, 404);
  const result = await resolved.services.knowledgeIngestion.deleteSource(resolved.context, sourceId.data);
  return safeJson(result, result.status === "not_found" ? 404 : 200);
}
