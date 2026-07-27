import { z } from "zod";

export const legalDocumentVersionSchema = z.string()
  .trim()
  .min(3)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9._-]*$/);

const legalSectionSchema = z.object({
  heading: z.string().trim().min(2).max(160),
  paragraphs: z.array(z.string().trim().min(1).max(4_000)).min(1).max(20),
}).strict();

const localizedLegalContentSchema = z.object({
  title: z.string().trim().min(3).max(160),
  summary: z.string().trim().min(10).max(1_000),
  sections: z.array(legalSectionSchema).min(1).max(40),
}).strict();

export const legalDocumentSchema = z.object({
  version: legalDocumentVersionSchema,
  title: z.string().trim().min(3).max(160),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const parsed = new Date(value + "T00:00:00Z");
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
  }, "legal_effective_date_invalid"),
  summary: z.string().trim().min(10).max(1_000),
  sections: z.array(legalSectionSchema).min(1).max(40),
  translations: z.object({
    th: localizedLegalContentSchema,
  }).strict().optional(),
}).strict();

export const legalDocumentsBundleSchema = z.object({
  schema: z.literal("djay.legal-documents.v1"),
  approvalStatus: z.literal("approved"),
  approvalReference: z.string().trim().min(8).max(240),
  approvedAt: z.iso.datetime({ offset: true }),
  terms: legalDocumentSchema,
  privacy: legalDocumentSchema,
}).strict().refine(
  (value) => value.terms.version !== value.privacy.version,
  { message: "legal_document_versions_must_be_distinct" },
);

export type LegalDocument = z.infer<typeof legalDocumentSchema>;
export type LegalDocumentsBundle = z.infer<typeof legalDocumentsBundleSchema>;

/** Legal translations must come from the approved deployment bundle. The UI
 * deliberately fails closed instead of presenting an improvised translation. */
export function localizeLegalDocument(document: LegalDocument, locale: "th" | "en"): LegalDocument | null {
  if (locale === "en") return document;
  const localized = document.translations?.th;
  return localized ? { ...document, ...localized } : null;
}
