import { localizeLegalDocument } from "@djay/shared/legal-documents";
import { z } from "zod";
import { getServices } from "../../../../lib/container";
import { safeJson } from "../../../../lib/http";

const kindSchema = z.enum(["terms", "privacy"]);

export async function GET(request: Request, route: { params: Promise<{ kind: string }> }) {
  const parsed = kindSchema.safeParse((await route.params).kind);
  if (!parsed.success) return safeJson({ status: "not_found" }, 404);
  try {
    const { legalDocuments } = await getServices();
    if (!legalDocuments) return safeJson({ status: "unavailable" }, 503);
    const locale = new URL(request.url).searchParams.get("lang") === "en" ? "en" : "th";
    const document = localizeLegalDocument(legalDocuments[parsed.data], locale);
    return document ? safeJson({ status: "available", document }) : safeJson({ status: "unavailable" }, 503);
  } catch {
    return safeJson({ status: "unavailable" }, 503);
  }
}
