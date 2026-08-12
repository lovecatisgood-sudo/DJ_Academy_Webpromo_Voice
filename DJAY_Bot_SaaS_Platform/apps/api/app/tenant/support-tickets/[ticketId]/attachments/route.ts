import { Storage } from "@google-cloud/storage";
import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { clientAddress, enforceRateLimit, hasTrustedOrigin, readJson, safeJson } from "../../../../../lib/http";
import { resolveTenantRequest } from "../../../../../lib/tenant-context";

const uploadSchema = z.object({
  filename: z.string().trim().min(1).max(255).regex(/^[^/\\\x00-\x1f]+$/),
  mediaType: z.enum(["application/pdf", "image/png", "image/jpeg", "text/plain"]),
  size: z.number().int().min(1).max(10 * 1024 * 1024),
  idempotencyKey: z.uuid(),
}).strict();

export async function POST(request: NextRequest, route: { params: Promise<{ ticketId: string }> }) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "support.write") || !(await hasTrustedOrigin(request))) {
    return safeJson({ status: "not_found" }, 404);
  }
  const rate = await enforceRateLimit("tenant-support-attachment", `${resolved.context.tenantId}:${resolved.context.userId}:${clientAddress(request)}`, 30, 60 * 60_000);
  if (!rate.allowed) return safeJson({ status: "rate_limited", retryAfterSeconds: rate.retryAfterSeconds }, 429);
  try {
    const ticketId = z.uuid().parse((await route.params).ticketId);
    const input = uploadSchema.parse(await readJson(request));
    const result = await resolved.services.tenantSupportTickets.initiateAttachment(resolved.context, { ticketId, ...input });
    if (result.status !== "created") return safeJson(result, 404);
    const bucketName = resolved.services.env.KNOWLEDGE_OBJECT_BUCKET;
    if (!bucketName) return safeJson({ status: "temporarily_unavailable" }, 503);
    const expiresAt = Date.now() + 15 * 60_000;
    const [uploadUrl] = await new Storage().bucket(bucketName).file(result.objectKey).getSignedUrl({
      version: "v4", action: "write", expires: expiresAt, contentType: result.mediaType,
      extensionHeaders: { "x-goog-if-generation-match": "0" },
    });
    return safeJson({ status: "created", attachmentId: result.attachmentId, uploadUrl, requiredHeaders: { "x-goog-if-generation-match": "0" },
      expiresAt: new Date(expiresAt).toISOString() }, 201);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400) : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
