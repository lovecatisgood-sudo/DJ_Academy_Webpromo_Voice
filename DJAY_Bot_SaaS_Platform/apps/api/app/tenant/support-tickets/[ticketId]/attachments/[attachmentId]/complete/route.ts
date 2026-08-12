import { Storage } from "@google-cloud/storage";
import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, safeJson } from "../../../../../../../lib/http";
import { resolveTenantRequest } from "../../../../../../../lib/tenant-context";

export async function POST(request: NextRequest, route: { params: Promise<{ ticketId: string; attachmentId: string }> }) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "support.write") || !(await hasTrustedOrigin(request))) {
    return safeJson({ status: "not_found" }, 404);
  }
  try {
    const { ticketId, attachmentId } = await route.params;
    const parsedTicketId = z.uuid().parse(ticketId);
    const parsedAttachmentId = z.uuid().parse(attachmentId);
    const pending = await resolved.services.tenantSupportTickets.pendingAttachment(resolved.context, parsedTicketId, parsedAttachmentId);
    const bucketName = resolved.services.env.KNOWLEDGE_OBJECT_BUCKET;
    if (!pending) return safeJson({ status: "not_found" }, 404);
    if (!bucketName) return safeJson({ status: "temporarily_unavailable" }, 503);
    const [metadata] = await new Storage().bucket(bucketName).file(pending.objectKey).getMetadata();
    const observedSize = Number(metadata.size);
    if (!Number.isSafeInteger(observedSize) || observedSize !== pending.declaredSize || metadata.contentType !== pending.mediaType) {
      return safeJson({ status: "upload_mismatch" }, 409);
    }
    const result = await resolved.services.tenantSupportTickets.completeAttachmentUpload(resolved.context, parsedAttachmentId, observedSize);
    return safeJson(result, result.status === "queued" ? 202 : 409);
  } catch (error) {
    return error instanceof ZodError ? safeJson({ status: "validation_failed" }, 400)
      : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
