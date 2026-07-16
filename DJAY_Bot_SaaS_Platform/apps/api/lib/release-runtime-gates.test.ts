import { describe, expect, it } from "vitest";
import type { LegalDocumentsBundle } from "@djay/shared/legal-documents";
import { registrationAuthorityGate } from "./release-runtime-gates";

const legalDocuments = {
  schema: "djay.legal-documents.v1",
  approvalStatus: "approved",
  approvalReference: "LEGAL-APPROVAL-2026-001",
  approvedAt: "2026-07-16T08:00:00+07:00",
  terms: {
    version: "terms-2026-07", title: "Service Terms", effectiveDate: "2026-07-20",
    summary: "Approved service terms summary for runtime gate testing.",
    sections: [{ heading: "Using the service", paragraphs: ["Approved terms."] }],
  },
  privacy: {
    version: "privacy-2026-07", title: "Privacy Notice", effectiveDate: "2026-07-20",
    summary: "Approved privacy summary for runtime gate testing.",
    sections: [{ heading: "Information handling", paragraphs: ["Approved notice."] }],
  },
} satisfies LegalDocumentsBundle;

describe("release runtime admission gates", () => {
  it("blocks release without live registration authority", () => {
    expect(registrationAuthorityGate(null)).toEqual({
      passing: false,
      status: "unavailable",
      termsVersion: null,
      privacyVersion: null,
    });
  });

  it("reports only the current public legal versions when authority is live", () => {
    expect(registrationAuthorityGate(legalDocuments)).toEqual({
      passing: true,
      status: "available",
      termsVersion: "terms-2026-07",
      privacyVersion: "privacy-2026-07",
    });
  });
});
