import { createHash } from "node:crypto";
import { Storage } from "@google-cloud/storage";
import type { SupportAttachmentScanClaim, SupportAttachmentWorkerStore } from "@djay/db";

export type SupportAttachmentWorkerConfig = Readonly<{
  bucket: string; malwareScannerEndpoint: string; malwareScannerToken: string;
}>;

export function validateSupportAttachment(buffer: Buffer, mediaType: SupportAttachmentScanClaim["media_type"]) {
  if (mediaType === "application/pdf" && !buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("file_signature_mismatch");
  if (mediaType === "image/png" && !buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) throw new Error("file_signature_mismatch");
  if (mediaType === "image/jpeg" && !(buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)) throw new Error("file_signature_mismatch");
  if (mediaType === "text/plain") {
    if (buffer.includes(0)) throw new Error("file_signature_mismatch");
    try { new TextDecoder("utf-8", { fatal: true }).decode(buffer); } catch { throw new Error("file_signature_mismatch"); }
  }
}

async function scan(buffer: Buffer, mediaType: string, config: SupportAttachmentWorkerConfig) {
  const response = await fetch(config.malwareScannerEndpoint, { method: "POST", headers: {
    authorization: `Bearer ${config.malwareScannerToken}`, "content-type": mediaType,
    "x-content-sha256": createHash("sha256").update(buffer).digest("hex"),
  }, body: new Blob([new Uint8Array(buffer)], { type: mediaType }), signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error("malware_scanner_unavailable");
  const result = await response.json() as { clean?: boolean };
  if (result.clean !== true) throw new Error("malware_detected");
}

function safeError(error: unknown) {
  const value = error instanceof Error ? error.message : "support_attachment_processing_failed";
  return /^[a-z0-9_]{2,100}$/.test(value) ? value : "support_attachment_processing_failed";
}

type ProcessorDependencies = Readonly<{
  download: (objectKey: string) => Promise<Buffer>;
  scan: (buffer: Buffer, mediaType: string) => Promise<void>;
  remove: (objectKey: string) => Promise<void>;
}>;

export async function processSupportAttachmentClaim(
  claim: SupportAttachmentScanClaim,
  store: Pick<SupportAttachmentWorkerStore, "complete" | "fail">,
  dependencies: ProcessorDependencies,
) {
  try {
    const buffer = await dependencies.download(claim.object_key);
    if (buffer.length !== claim.declared_size || buffer.length > 10 * 1024 * 1024) throw new Error("upload_size_mismatch");
    validateSupportAttachment(buffer, claim.media_type);
    await dependencies.scan(buffer, claim.media_type);
    if (!(await store.complete(claim.job_id, buffer.length, createHash("sha256").update(buffer).digest()))) {
      throw new Error("support_attachment_state_conflict");
    }
  } catch (error) {
    const code = safeError(error);
    if (["malware_detected", "file_signature_mismatch", "upload_size_mismatch"].includes(code)) {
      await dependencies.remove(claim.object_key).catch(() => undefined);
    }
    await store.fail(claim.job_id, code, !["malware_detected", "file_signature_mismatch", "upload_size_mismatch"].includes(code));
  }
}

export async function runSupportAttachmentBatch(
  store: SupportAttachmentWorkerStore, config: SupportAttachmentWorkerConfig, limit = 5,
) {
  const storage = new Storage().bucket(config.bucket);
  let processed = 0;
  for (; processed < limit; processed += 1) {
    const claim = await store.claim();
    if (!claim) break;
    await processSupportAttachmentClaim(claim, store, {
      download: async (objectKey) => (await storage.file(objectKey).download())[0],
      scan: (buffer, mediaType) => scan(buffer, mediaType, config),
      remove: async (objectKey) => { await storage.file(objectKey).delete({ ignoreNotFound: true }); },
    });
  }
  return processed;
}
