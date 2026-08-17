import { Storage } from "@google-cloud/storage";
import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../../lib/http";
import { resolveTenantRequest } from "../../../../lib/tenant-context";

const schema = z.object({ collectionId: z.uuid(), name: z.string().trim().min(2).max(160),
  filename: z.string().trim().min(1).max(255).regex(/^[^/\\\x00-\x1f]+$/),
  mediaType: z.enum(["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"]),
  size: z.number().int().min(1).max(10 * 1024 * 1024) }).strict();
export async function POST(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "knowledge.write") || !(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  try {
    const input = schema.parse(await readJson(request));
    const bucketName = resolved.services.env.KNOWLEDGE_OBJECT_BUCKET;
    if (!bucketName) return safeJson({ status: "temporarily_unavailable" }, 503);
    const result = await resolved.services.knowledgeIngestion.initiateUpload(resolved.context, input);
    if (result.status !== "created") return safeJson(result, result.status === "not_found" ? 404 : 403);
    const expiresAt = Date.now() + 15 * 60_000;
    const [uploadUrl] = await new Storage().bucket(bucketName).file(result.objectKey).getSignedUrl({
      version: "v4", action: "write", expires: expiresAt, contentType: result.mediaType,
    });
    return safeJson({ ...result, objectKey: undefined, uploadUrl, expiresAt: new Date(expiresAt).toISOString() }, 201);
  } catch (error) { return error instanceof ZodError || error instanceof SyntaxError ? safeJson({ status: "validation_failed" }, 400) : safeJson({ status: "temporarily_unavailable" }, 503); }
}
