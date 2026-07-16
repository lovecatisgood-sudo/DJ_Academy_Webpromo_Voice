import { readFileSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";
import {
  legalDocumentsBundleSchema,
  type LegalDocumentsBundle,
} from "@djay/shared/legal-documents";

const maximumLegalBundleBytes = 1_048_576;

export function loadLegalDocuments(filePath: string | undefined): LegalDocumentsBundle | null {
  if (!filePath) return null;
  if (!isAbsolute(filePath)) throw new Error("LEGAL_DOCUMENTS_FILE must be an absolute path.");
  try {
    const stat = statSync(filePath);
    if (!stat.isFile() || stat.size < 2 || stat.size > maximumLegalBundleBytes) {
      throw new Error("invalid_size");
    }
    return legalDocumentsBundleSchema.parse(JSON.parse(readFileSync(filePath, "utf8")));
  } catch {
    throw new Error("LEGAL_DOCUMENTS_FILE is invalid or unreadable.");
  }
}
