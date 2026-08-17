import { describe, expect, it, vi } from "vitest";
import {
  executePublicBuilderImport,
  normalizedPublicWebsiteUrl,
  publicBuilderImportCreateSchema,
  publicBuilderImportJobIdSchema,
  publicWebsiteImportFailureReason,
} from "./public-builder-import";

describe("public Builder website-import contract", () => {
  it("accepts only revision-bound idempotent create requests", () => {
    const request = publicBuilderImportCreateSchema.parse({
      url: "djai.academy",
      draftRevision: 3,
      idempotencyKey: "3f7eb12e-f65d-4f23-9c53-12df1e714293",
    });
    expect(request.draftRevision).toBe(3);
    expect(normalizedPublicWebsiteUrl(request.url)).toBe("https://djai.academy/");
    expect(publicBuilderImportCreateSchema.safeParse({ ...request, surprise: true }).success).toBe(false);
    expect(publicBuilderImportJobIdSchema.safeParse("not-a-job-id").success).toBe(false);
  });

  it("exposes only allowlisted crawler failures", () => {
    expect(publicWebsiteImportFailureReason(new Error("website_timeout"))).toBe("website_timeout");
    expect(publicWebsiteImportFailureReason(new Error("password=secret"))).toBe("website_import_failed");
    expect(publicWebsiteImportFailureReason("website_timeout")).toBe("website_import_failed");
  });

  it("does not crawl a completed, stale, or unavailable claim", async () => {
    for (const status of ["completed", "stale", "unavailable"] as const) {
      const claimJob = vi.fn().mockResolvedValue({ status, job: null });
      const result = await executePublicBuilderImport({
        store: { claimJob } as never,
        sessionId: "session-id",
        jobId: "job-id",
      });
      expect(result.status).toBe(status);
      expect(claimJob).toHaveBeenCalledOnce();
    }
  });
});
