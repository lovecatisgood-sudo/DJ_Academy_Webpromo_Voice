import type { LegalDocumentsBundle } from "@djay/shared/legal-documents";

export function registrationAuthorityGate(legalDocuments: LegalDocumentsBundle | null) {
  return legalDocuments
    ? Object.freeze({
      passing: true as const,
      status: "available" as const,
      termsVersion: legalDocuments.terms.version,
      privacyVersion: legalDocuments.privacy.version,
    })
    : Object.freeze({
      passing: false as const,
      status: "unavailable" as const,
      termsVersion: null,
      privacyVersion: null,
    });
}
