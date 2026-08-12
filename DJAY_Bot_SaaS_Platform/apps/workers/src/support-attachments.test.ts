import { describe, expect, it, vi } from "vitest";
import type { SupportAttachmentScanClaim } from "@djay/db";
import { processSupportAttachmentClaim, validateSupportAttachment } from "./support-attachments";

const claim = (media_type: SupportAttachmentScanClaim["media_type"], declared_size: number): SupportAttachmentScanClaim => ({
  job_id: "10000000-0000-4000-8000-000000000001", tenant_id: "10000000-0000-4000-8000-000000000002",
  attachment_id: "10000000-0000-4000-8000-000000000003", object_key: "support/a/b/c", media_type,
  declared_size, attempt_count: 1,
});

describe("support attachment quarantine processor", () => {
  it("accepts exact signatures for supported files and rejects disguised files", () => {
    expect(() => validateSupportAttachment(Buffer.from("%PDF-1.7"), "application/pdf")).not.toThrow();
    expect(() => validateSupportAttachment(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]), "image/png")).not.toThrow();
    expect(() => validateSupportAttachment(Buffer.from([0xff,0xd8,0xff,0xdb]), "image/jpeg")).not.toThrow();
    expect(() => validateSupportAttachment(Buffer.from("hello", "utf8"), "text/plain")).not.toThrow();
    expect(() => validateSupportAttachment(Buffer.from("not a pdf"), "application/pdf")).toThrow("file_signature_mismatch");
    expect(() => validateSupportAttachment(Buffer.from([0xff, 0xfe]), "text/plain")).toThrow("file_signature_mismatch");
  });

  it("marks only an exact-size, clean attachment complete", async () => {
    const buffer = Buffer.from("safe text");
    const store = { complete: vi.fn().mockResolvedValue(true), fail: vi.fn().mockResolvedValue(true) };
    await processSupportAttachmentClaim(claim("text/plain", buffer.length), store as never, {
      download: vi.fn().mockResolvedValue(buffer), scan: vi.fn().mockResolvedValue(undefined), remove: vi.fn(),
    });
    expect(store.complete).toHaveBeenCalledOnce(); expect(store.fail).not.toHaveBeenCalled();
  });

  it("dead-letters malware and retries scanner outages without completing", async () => {
    const buffer = Buffer.from("safe text");
    for (const [code, retryable] of [["malware_detected", false], ["malware_scanner_unavailable", true]] as const) {
      const store = { complete: vi.fn(), fail: vi.fn().mockResolvedValue(true) };
      await processSupportAttachmentClaim(claim("text/plain", buffer.length), store as never, {
        download: vi.fn().mockResolvedValue(buffer), scan: vi.fn().mockRejectedValue(new Error(code)), remove: vi.fn().mockResolvedValue(undefined),
      });
      expect(store.complete).not.toHaveBeenCalled(); expect(store.fail).toHaveBeenCalledWith(claim("text/plain", buffer.length).job_id, code, retryable);
    }
  });
});
