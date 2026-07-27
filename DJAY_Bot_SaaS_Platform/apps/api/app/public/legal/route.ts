import { localizeLegalDocument } from "@djay/shared/legal-documents";
import { getServices } from "../../../lib/container";
import { safeJson } from "../../../lib/http";

export async function GET(request: Request) {
  try {
    const { legalDocuments } = await getServices();
    if (!legalDocuments) return safeJson({ status: "unavailable" }, 503);
    const locale = new URL(request.url).searchParams.get("lang") === "en" ? "en" : "th";
    const terms = localizeLegalDocument(legalDocuments.terms, locale);
    const privacy = localizeLegalDocument(legalDocuments.privacy, locale);
    if (!terms || !privacy) return safeJson({ status: "unavailable" }, 503);
    return safeJson({
      status: "available",
      terms: {
        version: terms.version,
        title: terms.title,
        effectiveDate: terms.effectiveDate,
      },
      privacy: {
        version: privacy.version,
        title: privacy.title,
        effectiveDate: privacy.effectiveDate,
      },
    });
  } catch {
    return safeJson({ status: "unavailable" }, 503);
  }
}
