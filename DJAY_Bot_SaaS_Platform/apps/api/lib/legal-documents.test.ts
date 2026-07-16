import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadLegalDocuments } from "./legal-documents";

const temporaryDirectories: string[] = [];

function fixture(value: unknown) {
  const directory = mkdtempSync(resolve(tmpdir(), "djay-legal-test-"));
  temporaryDirectories.push(directory);
  const path = resolve(directory, "legal.json");
  writeFileSync(path, JSON.stringify(value));
  return path;
}

const bundle = {
  schema: "djay.legal-documents.v1",
  approvalStatus: "approved",
  approvalReference: "LEGAL-APPROVAL-2026-001",
  approvedAt: "2026-07-16T08:00:00+07:00",
  terms: {
    version: "terms-2026-07",
    title: "Service Terms",
    effectiveDate: "2026-07-20",
    summary: "Approved terms summary for registration acceptance.",
    sections: [{ heading: "Using the service", paragraphs: ["Approved terms paragraph."] }],
  },
  privacy: {
    version: "privacy-2026-07",
    title: "Privacy Notice",
    effectiveDate: "2026-07-20",
    summary: "Approved privacy summary for registration acceptance.",
    sections: [{ heading: "Information handling", paragraphs: ["Approved privacy paragraph."] }],
  },
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("legal document loader", () => {
  it("keeps registration unavailable when no approved file is configured", () => {
    expect(loadLegalDocuments(undefined)).toBeNull();
  });

  it("loads a bounded approved absolute file", () => {
    expect(loadLegalDocuments(fixture(bundle))).toMatchObject({
      approvalStatus: "approved",
      terms: { version: "terms-2026-07" },
      privacy: { version: "privacy-2026-07" },
    });
  });

  it.each([
    ["relative path", () => loadLegalDocuments("legal.json")],
    ["unreadable path", () => loadLegalDocuments(resolve(tmpdir(), "djay-legal-file-does-not-exist.json"))],
    ["draft content", () => loadLegalDocuments(fixture({ ...bundle, approvalStatus: "draft" }))],
    ["malformed content", () => loadLegalDocuments(fixture({ ...bundle, terms: { ...bundle.terms, sections: [] } }))],
  ])("rejects %s", (_name, action) => {
    expect(action).toThrow();
  });

  it("rejects an oversized file before parsing", () => {
    const path = fixture({ status: "placeholder" });
    writeFileSync(path, "x".repeat(1_048_577));
    expect(() => loadLegalDocuments(path)).toThrow("LEGAL_DOCUMENTS_FILE is invalid or unreadable.");
  });
});
