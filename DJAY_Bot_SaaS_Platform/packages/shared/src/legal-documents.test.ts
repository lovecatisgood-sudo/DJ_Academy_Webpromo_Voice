import { describe, expect, it } from "vitest";
import { legalDocumentsBundleSchema, localizeLegalDocument } from "./legal-documents";

const validBundle = {
  schema: "djay.legal-documents.v1",
  approvalStatus: "approved",
  approvalReference: "LEGAL-APPROVAL-2026-001",
  approvedAt: "2026-07-16T08:00:00+07:00",
  terms: {
    version: "terms-2026-07",
    title: "Service Terms",
    effectiveDate: "2026-07-20",
    summary: "Approved terms summary for the registration acceptance test.",
    sections: [{ heading: "Using the service", paragraphs: ["Approved terms paragraph."] }],
  },
  privacy: {
    version: "privacy-2026-07",
    title: "Privacy Notice",
    effectiveDate: "2026-07-20",
    summary: "Approved privacy summary for the registration acceptance test.",
    sections: [{ heading: "Information handling", paragraphs: ["Approved privacy paragraph."] }],
  },
} as const;

describe("public legal document contract", () => {
  it("accepts an approved, versioned, plain-text bundle", () => {
    expect(legalDocumentsBundleSchema.parse(validBundle)).toEqual(validBundle);
  });

  it.each([
    { ...validBundle, approvalStatus: "draft" },
    { ...validBundle, approvalReference: "short" },
    { ...validBundle, terms: { ...validBundle.terms, version: "Terms 2026" } },
    { ...validBundle, privacy: { ...validBundle.privacy, sections: [] } },
    { ...validBundle, privacy: { ...validBundle.privacy, effectiveDate: "2026-99-40" } },
    { ...validBundle, privacy: { ...validBundle.privacy, version: validBundle.terms.version } },
  ])("rejects an unapproved or malformed bundle", (value) => {
    expect(() => legalDocumentsBundleSchema.parse(value)).toThrow();
  });

  it("serves the approved English source only after explicit English selection", () => {
    const document = legalDocumentsBundleSchema.parse(validBundle).terms;

    expect(localizeLegalDocument(document, "en")).toEqual(document);
  });

  it("fails closed when an approved Thai translation is unavailable", () => {
    const document = legalDocumentsBundleSchema.parse(validBundle).terms;

    expect(localizeLegalDocument(document, "th")).toBeNull();
  });

  it("serves only the approved Thai translation while preserving version metadata", () => {
    const thai = {
      title: "ข้อกำหนดการใช้บริการ",
      summary: "สรุปข้อกำหนดการใช้บริการฉบับภาษาไทยที่ได้รับอนุมัติแล้ว",
      sections: [{
        heading: "การใช้บริการ",
        paragraphs: ["เนื้อหาข้อกำหนดฉบับภาษาไทยที่ได้รับอนุมัติแล้ว"],
      }],
    };
    const parsed = legalDocumentsBundleSchema.parse({
      ...validBundle,
      terms: { ...validBundle.terms, translations: { th: thai } },
    });

    expect(localizeLegalDocument(parsed.terms, "th")).toMatchObject({
      version: validBundle.terms.version,
      effectiveDate: validBundle.terms.effectiveDate,
      ...thai,
    });
  });
});
