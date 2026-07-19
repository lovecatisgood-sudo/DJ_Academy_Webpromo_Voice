import { Storage } from "@google-cloud/storage";
import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { hasTrustedOrigin, safeJson } from "../../../../../../lib/http";
import { resolveTenantRequest } from "../../../../../../lib/tenant-context";

export async function POST(request: NextRequest, { params }: { params: Promise<{ objectId: string }> }) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "knowledge.write") || !(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  try {
    const objectId = z.uuid().parse((await params).objectId);
    const pending = await resolved.services.knowledgeIngestion.pendingUpload(resolved.context, objectId);
    const bucketName = resolved.services.env.KNOWLEDGE_OBJECT_BUCKET;
    if (!pending) return safeJson({ status: "not_found" }, 404);
    if (!bucketName) return safeJson({ status: "temporarily_unavailable" }, 503);
    const [metadata] = await new Storage().bucket(bucketName).file(pending.objectKey).getMetadata();
    const observedSize = Number(metadata.size);
    if (!Number.isSafeInteger(observedSize) || observedSize !== pending.declaredSize || metadata.contentType !== pending.mediaType) {
      return safeJson({ status: "upload_mismatch" }, 409);
    }
    const result = await resolved.services.knowledgeIngestion.completeUpload(resolved.context, objectId, observedSize);
    return safeJson(result, result.status === "queued" ? 202 : 409);
  } catch { return safeJson({ status: "temporarily_unavailable" }, 503); }
}
