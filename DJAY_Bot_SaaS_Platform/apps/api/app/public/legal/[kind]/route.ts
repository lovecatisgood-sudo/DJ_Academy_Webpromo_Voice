import { z } from "zod";
import { getServices } from "../../../../lib/container";
import { safeJson } from "../../../../lib/http";

const kindSchema = z.enum(["terms", "privacy"]);

export async function GET(_request: Request, route: { params: Promise<{ kind: string }> }) {
  const parsed = kindSchema.safeParse((await route.params).kind);
  if (!parsed.success) return safeJson({ status: "not_found" }, 404);
  try {
    const { legalDocuments } = await getServices();
    if (!legalDocuments) return safeJson({ status: "unavailable" }, 503);
    return safeJson({ status: "available", document: legalDocuments[parsed.data] });
  } catch {
    return safeJson({ status: "unavailable" }, 503);
  }
}
