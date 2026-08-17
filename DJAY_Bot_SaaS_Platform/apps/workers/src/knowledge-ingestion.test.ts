import { describe, expect, it } from "vitest";
import { buildAttributedDocument, validateKnowledgeFileSignature } from "./knowledge-ingestion";

describe("knowledge document ingestion", () => {
  it("accepts only the admitted file signatures", () => {
    expect(() => validateKnowledgeFileSignature(Buffer.from("%PDF-1.7"), "application/pdf")).not.toThrow();
    expect(() => validateKnowledgeFileSignature(Buffer.from([0x50, 0x4b, 0x03, 0x04]), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).not.toThrow();
    expect(() => validateKnowledgeFileSignature(Buffer.from("approved text"), "text/plain")).not.toThrow();
    expect(() => validateKnowledgeFileSignature(Buffer.from("not pdf"), "application/pdf")).toThrow("file_signature_mismatch");
    expect(() => validateKnowledgeFileSignature(Buffer.from([0]), "text/plain")).toThrow("file_signature_mismatch");
    expect(() => validateKnowledgeFileSignature(Buffer.from("GIF89a"), "image/gif")).toThrow("file_type_rejected");
  });

  it("embeds page attribution into normalized content and every chunk", () => {
    const result = buildAttributedDocument([
      { label: "Source page 1", text: "First approved page." },
      { label: "Source page 2", text: "Second approved page." },
    ]);
    expect(result).toMatchObject({ sectionCount: 2 });
    expect(result.content).toContain("[Source page 1]\nFirst approved page.");
    expect(result.chunks).toEqual(["[Source page 1]\nFirst approved page.", "[Source page 2]\nSecond approved page."]);
  });

  it("rejects empty extraction and excessive chunk counts", () => {
    expect(() => buildAttributedDocument([{ label: "Source page 1", text: "  " }])).toThrow("extracted_content_empty");
    const paragraphs = Array.from({ length: 5001 }, (_, index) => `paragraph ${index}`).join("\n\n");
    expect(() => buildAttributedDocument([{ label: "Source document", text: paragraphs }])).toThrow("extracted_content_too_many_chunks");
  });
});
