import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { Storage } from "@google-cloud/storage";
import type { KnowledgeIngestionClaim, KnowledgeIngestionWorkerStore } from "@djay/db";
import { load } from "cheerio";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

type KnowledgeWorkerConfig = Readonly<{
  bucket: string; malwareScannerEndpoint: string; malwareScannerToken: string;
}>;

export type KnowledgeDocumentSection = Readonly<{ label: string; text: string }>;

export function validateKnowledgeFileSignature(buffer: Buffer, mediaType: string) {
  if (mediaType === "application/pdf" && !buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("file_signature_mismatch");
  if (mediaType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    && (buffer[0] !== 0x50 || buffer[1] !== 0x4b)) throw new Error("file_signature_mismatch");
  if (mediaType === "text/plain" && buffer.includes(0)) throw new Error("file_signature_mismatch");
  if (!["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"].includes(mediaType)) {
    throw new Error("file_type_rejected");
  }
}

export function buildAttributedDocument(sections: readonly KnowledgeDocumentSection[]) {
  const usable = sections.map((section) => ({ label: section.label.trim(), text: section.text.trim() })).filter((section) => section.label && section.text);
  if (!usable.length) throw new Error("extracted_content_empty");
  const content = usable.map((section) => `[${section.label}]\n${section.text}`).join("\n\n");
  const attributedChunks: string[] = [];
  for (const section of usable) for (const paragraph of section.text.split(/\n{2,}/).map((value) => value.trim()).filter(Boolean)) {
    for (let offset = 0; offset < paragraph.length; offset += 1200) attributedChunks.push(`[${section.label}]\n${paragraph.slice(offset, offset + 1200)}`);
  }
  if (attributedChunks.length > 5000) throw new Error("extracted_content_too_many_chunks");
  return { content, chunks: attributedChunks, sectionCount: usable.length };
}

function isPublicAddress(address: string) {
  const family = isIP(address);
  if (family === 4) {
    const [a = 0, b = 0] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19)));
  }
  if (family === 6) {
    const value = address.toLowerCase();
    return value !== "::" && value !== "::1" && !value.startsWith("fc") && !value.startsWith("fd")
      && !/^fe[89ab]/.test(value) && !value.startsWith("::ffff:");
  }
  return false;
}

async function crawlPage(rawUrl: string) {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash || url.search) throw new Error("crawl_url_rejected");
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => !isPublicAddress(entry.address))) throw new Error("crawl_address_rejected");
  const selected = addresses[0]!;
  const html = await new Promise<string>((resolve, reject) => {
    const outbound = request(url, { method: "GET", headers: { accept: "text/html,text/plain;q=0.9", "user-agent": "DJayBots-KnowledgeCrawler/1.0" },
      timeout: 10_000, lookup: (_hostname, options, callback) => {
        if (typeof options === "object" && options.all) callback(null, [{ address: selected.address, family: selected.family }]);
        else callback(null, selected.address, selected.family);
      } }, (response) => {
      const status = response.statusCode ?? 500;
      const contentType = String(response.headers["content-type"] ?? "").toLowerCase();
      if (status < 200 || status >= 300 || (!contentType.includes("text/html") && !contentType.includes("text/plain"))) {
        response.resume(); reject(new Error("crawl_http_rejected")); return;
      }
      const parts: Buffer[] = []; let bytes = 0;
      response.on("data", (part: Buffer) => { bytes += part.length; if (bytes > 2 * 1024 * 1024) response.destroy(new Error("crawl_response_too_large")); else parts.push(part); });
      response.on("end", () => resolve(Buffer.concat(parts).toString("utf8")));
      response.on("error", reject);
    });
    outbound.on("timeout", () => outbound.destroy(new Error("crawl_timeout")));
    outbound.on("error", reject); outbound.end();
  });
  const $ = load(html); $("script,style,noscript,svg,template").remove();
  const title = $("title").first().text().trim();
  const text = $("main,article").first().text() || $("body").text();
  return [title, text.replace(/\s+/g, " ").trim()].filter(Boolean).join("\n\n");
}

async function scan(buffer: Buffer, mediaType: string, config: KnowledgeWorkerConfig) {
  const response = await fetch(config.malwareScannerEndpoint, { method: "POST", headers: {
    authorization: `Bearer ${config.malwareScannerToken}`, "content-type": mediaType, "x-content-sha256": createHash("sha256").update(buffer).digest("hex"),
  }, body: new Blob([new Uint8Array(buffer)], { type: mediaType }), signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error("malware_scanner_unavailable");
  const result = await response.json() as { clean?: boolean };
  if (result.clean !== true) throw new Error("malware_detected");
}

async function extractFile(buffer: Buffer, mediaType: string) {
  validateKnowledgeFileSignature(buffer, mediaType);
  if (mediaType === "application/pdf") {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return buildAttributedDocument(result.pages.map((page) => ({ label: `Source page ${page.num}`, text: page.text })));
    } finally { await parser.destroy(); }
  }
  if (mediaType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return buildAttributedDocument([{ label: "Source document", text: (await mammoth.extractRawText({ buffer })).value }]);
  }
  if (mediaType === "text/plain") {
    return buildAttributedDocument([{ label: "Source document", text: new TextDecoder("utf-8", { fatal: true }).decode(buffer) }]);
  }
  throw new Error("file_type_rejected");
}

function chunks(content: string) {
  const result: string[] = [];
  for (const paragraph of content.split(/\n{2,}/).map((value) => value.trim()).filter(Boolean)) {
    for (let offset = 0; offset < paragraph.length; offset += 1200) result.push(paragraph.slice(offset, offset + 1200));
  }
  return result.slice(0, 5000);
}

function safeError(error: unknown) {
  const value = error instanceof Error ? error.message : "knowledge_processing_failed";
  return /^[a-z0-9_]{2,100}$/.test(value) ? value : "knowledge_processing_failed";
}

const terminalKnowledgeErrors = new Set([
  "malware_detected", "file_signature_mismatch", "file_type_rejected", "upload_size_mismatch",
  "extracted_content_invalid", "extracted_content_empty", "extracted_content_too_many_chunks",
]);

async function processClaim(claim: KnowledgeIngestionClaim, store: KnowledgeIngestionWorkerStore, config: KnowledgeWorkerConfig) {
  try {
    let content: string; let split: string[]; let observedSize: number | undefined; let sha256: Buffer | undefined;
    let provenance: Record<string, unknown>;
    if (claim.job_kind === "file_extract") {
      if (!claim.object_key || !claim.media_type) throw new Error("knowledge_object_missing");
      const [buffer] = await new Storage().bucket(config.bucket).file(claim.object_key).download();
      if (buffer.length !== claim.declared_size || buffer.length > 10 * 1024 * 1024) throw new Error("upload_size_mismatch");
      await scan(buffer, claim.media_type, config);
      const extracted = await extractFile(buffer, claim.media_type);
      content = extracted.content; split = extracted.chunks; observedSize = buffer.length; sha256 = createHash("sha256").update(buffer).digest();
      provenance = { kind: claim.job_kind, sourceId: claim.source_id, mediaType: claim.media_type,
        attribution: extracted.sectionCount > 1 ? "page" : "document", sectionCount: extracted.sectionCount,
        processedAt: new Date().toISOString(), extractorVersion: "knowledge-v2" };
    } else {
      if (!claim.source_url) throw new Error("crawl_url_missing");
      content = await crawlPage(claim.source_url);
      split = chunks(content);
      provenance = { kind: claim.job_kind, sourceId: claim.source_id, sourceUrl: claim.source_url,
        processedAt: new Date().toISOString(), extractorVersion: "knowledge-v2" };
    }
    if (!content || content.length > 2_000_000) throw new Error("extracted_content_invalid");
    if (!split.length) throw new Error("extracted_content_empty");
    await store.complete({
      jobId: claim.job_id,
      content,
      chunks: split,
      provenance,
      ...(observedSize === undefined ? {} : { observedSize }),
      ...(sha256 === undefined ? {} : { sha256 }),
    });
  } catch (error) {
    const code = safeError(error);
    await store.fail(claim.job_id, code, !terminalKnowledgeErrors.has(code));
  }
}

export async function runKnowledgeIngestionBatch(store: KnowledgeIngestionWorkerStore, config: KnowledgeWorkerConfig, limit = 5) {
  await store.enqueueDue();
  let processed = 0;
  for (; processed < limit; processed += 1) {
    const claim = await store.claim(); if (!claim) break;
    await processClaim(claim, store, config);
  }
  return processed;
}
