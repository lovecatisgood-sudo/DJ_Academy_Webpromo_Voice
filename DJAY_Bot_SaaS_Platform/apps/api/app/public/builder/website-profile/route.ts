import type { NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { crawlPublicWebsite, extractPublicWebsiteProfile } from "../../../../lib/public-website-profile";
import { clientAddress, enforceRateLimit, hasTrustedOrigin, readJson, safeJson } from "../../../../lib/http";

const requestSchema = z.object({
  url: z.string().trim().min(3).max(2048),
}).strict();

export async function POST(request: NextRequest) {
  if (!(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  const allowed = await enforceRateLimit("public_builder_website_profile", clientAddress(request), 5, 60_000);
  if (!allowed.allowed) return safeJson({ status: "rate_limited" }, 429);
  try {
    const input = requestSchema.parse(await readJson(request, 4096));
    const crawl = await crawlPublicWebsite(input.url);
    return safeJson({ status: "completed", profile: extractPublicWebsiteProfile(crawl.pages, crawl.warnings) });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return safeJson({ status: "validation_failed" }, 400);
    const reason = error instanceof Error && /^website_[a-z_]+$/.test(error.message) ? error.message : "website_import_failed";
    console.error("public_builder_website_import_failed", { reason });
    return safeJson({ status: "not_available", reason }, 422);
  }
}
