import { Storage } from "@google-cloud/storage";
import { platformRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { safeJson } from "../../../../../../lib/http";
import { resolvePlatformRequest } from "../../../../../../lib/platform-context";

export async function GET(request: NextRequest, route: { params: Promise<{ attachmentId: string }> }) {
  const resolved = await resolvePlatformRequest(request);
  if (!resolved || !platformRoleAllows(resolved.context.role, "platform.support_tickets.read")) return safeJson({ status: "not_found" }, 404);
  try {
    const clean = await resolved.services.platformSupportTickets.cleanAttachment(resolved.context, z.uuid().parse((await route.params).attachmentId));
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
