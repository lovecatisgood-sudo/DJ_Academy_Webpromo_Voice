import { Storage } from "@google-cloud/storage";
import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { safeJson } from "../../../../../../../lib/http";
import { resolveTenantRequest } from "../../../../../../../lib/tenant-context";

export async function GET(request: NextRequest, route: { params: Promise<{ ticketId: string; attachmentId: string }> }) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "support.read")) return safeJson({ status: "not_found" }, 404);
  try {
    const { ticketId, attachmentId } = await route.params;
    const clean = await resolved.services.tenantSupportTickets.cleanAttachment(
      resolved.context, z.uuid().parse(ticketId), z.uuid().parse(attachmentId),
    );
    const bucketName = resolved.services.env.KNOWLEDGE_OBJECT_BUCKET;
    if (!clean || !bucketName) return safeJson({ status: "not_found" }, 404);
    const expiresAt = Date.now() + 5 * 60_000;
    const [downloadUrl] = await new Storage().bucket(bucketName).file(clean.objectKey).getSignedUrl({
      version: "v4", action: "read", expires: expiresAt,
      responseDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(clean.filename)}`,
      responseType: clean.mediaType,
    });
    return safeJson({ status: "ready", downloadUrl, filename: clean.filename, expiresAt: new Date(expiresAt).toISOString() });
  } catch { return safeJson({ status: "not_found" }, 404); }
}
