import { getServices } from "../../../lib/container";
import { safeJson } from "../../../lib/http";

export async function GET() {
  try {
    const { legalDocuments } = await getServices();
    if (!legalDocuments) return safeJson({ status: "unavailable" }, 503);
    return safeJson({
      status: "available",
      terms: {
        version: legalDocuments.terms.version,
        title: legalDocuments.terms.title,
        effectiveDate: legalDocuments.terms.effectiveDate,
      },
      privacy: {
        version: legalDocuments.privacy.version,
        title: legalDocuments.privacy.title,
        effectiveDate: legalDocuments.privacy.effectiveDate,
      },
    });
  } catch {
    return safeJson({ status: "unavailable" }, 503);
  }
}
