import { z } from "zod";
import { crawlPublicWebsite, extractPublicWebsiteProfile, normalizePublicWebsiteUrl } from "./public-website-profile";

type PublicBuilderImportJob = Readonly<{
  id: string;
  normalizedUrl: string;
  generation: number;
  profile?: unknown | null;
}>;

type PublicBuilderImportResult = Readonly<{
  status: "started" | "in_progress" | "completed" | "failed" | "cancelled" | "stale" | "retry_exhausted" | "unavailable";
  job?: PublicBuilderImportJob;
  reason?: string;
}>;

type PublicBuilderImportAuthority = Readonly<{
  claimJob(sessionId: string, jobId: string): Promise<PublicBuilderImportResult>;
  completeJob(input: Readonly<{
    sessionId: string;
    jobId: string;
    generation: number;
    profile: object;
    warnings: readonly string[];
    provenance: ReadonlyArray<Readonly<{ name: string; url: string }>>;
    pageCount: number;
  }>): Promise<PublicBuilderImportResult>;
  failJob(input: Readonly<{
    sessionId: string;
    jobId: string;
    generation: number;
    reason: string;
  }>): Promise<PublicBuilderImportResult>;
}>;

export const publicBuilderImportCreateSchema = z.object({
  url: z.string().trim().min(3).max(2048),
  draftRevision: z.number().int().min(1),
  idempotencyKey: z.string().uuid(),
}).strict();

export const publicBuilderImportJobIdSchema = z.string().uuid();

export function publicWebsiteImportFailureReason(error: unknown) {
  return error instanceof Error && /^website_[a-z_]+$/.test(error.message)
    ? error.message : "website_import_failed";
}

export async function executePublicBuilderImport(input: Readonly<{
  store: PublicBuilderImportAuthority;
  sessionId: string;
  jobId: string;
}>) {
  const claim = await input.store.claimJob(input.sessionId, input.jobId);
  if (claim.status === "completed") return claim;
  if (claim.status !== "started" || !claim.job) return claim;
  try {
    const crawl = await crawlPublicWebsite(claim.job.normalizedUrl);
    const profile = extractPublicWebsiteProfile(crawl.pages, crawl.warnings);
    return input.store.completeJob({
      sessionId: input.sessionId,
      jobId: claim.job.id,
      generation: claim.job.generation,
      profile,
      warnings: crawl.warnings,
      provenance: profile.sources,
      pageCount: profile.pageCount,
    });
  } catch (error) {
    const reason = publicWebsiteImportFailureReason(error);
    const failed = await input.store.failJob({
      sessionId: input.sessionId,
      jobId: claim.job.id,
      generation: claim.job.generation,
      reason,
    });
    return { ...failed, reason } as PublicBuilderImportResult;
  }
}

export function normalizedPublicWebsiteUrl(raw: string) {
  return normalizePublicWebsiteUrl(raw).toString();
}
