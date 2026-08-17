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

type CrawledPage = Readonly<{ url: string; canonicalUrl: string; title: string; text: string; links: readonly string[]; etag: string | null; lastModified: string | null }>;

export function canonicalCrawlUrl(rawUrl: string, base?: string) {
  const url = new URL(rawUrl, base);
  if (url.protocol !== "https:" || url.username || url.password || url.port) throw new Error("crawl_url_rejected");
  url.hash = ""; url.search = ""; url.pathname = url.pathname.replace(/\/{2,}/g, "/");
  return url.href;
}

function robotsPattern(pattern: string) {
  const end = pattern.endsWith("$"); const body = end ? pattern.slice(0, -1) : pattern;
  return new RegExp(`^${body.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}${end ? "$" : ""}`);
}

export function robotsPolicy(text: string, path: string) {
  const groups: { agents: string[]; rules: { allow: boolean; pattern: string }[]; delay: number | null }[] = [];
  let group: (typeof groups)[number] | undefined; let sawRule = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim(); const separator = line.indexOf(":");
    if (separator < 0) continue;
    const field = line.slice(0, separator).trim().toLowerCase(); const value = line.slice(separator + 1).trim();
    if (field === "user-agent") {
      if (!group || sawRule) { group = { agents: [], rules: [], delay: null }; groups.push(group); sawRule = false; }
      group.agents.push(value.toLowerCase()); continue;
    }
    if (!group) continue;
    if (field === "allow" || field === "disallow") { sawRule = true; if (value) group.rules.push({ allow: field === "allow", pattern: value }); }
    if (field === "crawl-delay") { const seconds = Number(value); if (Number.isFinite(seconds) && seconds >= 0) group.delay = seconds; }
  }
  const named = groups.filter((item) => item.agents.some((agent) => agent === "djaybots-knowledgecrawler"));
  const selected = named.length ? named : groups.filter((item) => item.agents.includes("*"));
  const matches = selected.flatMap((item) => item.rules).filter((rule) => robotsPattern(rule.pattern).test(path));
  matches.sort((a, b) => b.pattern.length - a.pattern.length || Number(b.allow) - Number(a.allow));
  return { allowed: matches[0]?.allow ?? true, delayMs: Math.min(5_000, Math.max(500, ...selected.map((item) => (item.delay ?? 0) * 1000))) };
}

async function fetchPublicUrl(rawUrl: string, accept: string, missingAllowed = false) {
  const url = new URL(canonicalCrawlUrl(rawUrl));
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => !isPublicAddress(entry.address))) throw new Error("crawl_address_rejected");
  const selected = addresses[0]!;
  return new Promise<{ body: string; contentType: string; etag: string | null; lastModified: string | null }>((resolve, reject) => {
    const outbound = request(url, { method: "GET", headers: { accept, "user-agent": "DJayBots-KnowledgeCrawler/1.0" },
      timeout: 10_000, lookup: (_hostname, options, callback) => {
        if (typeof options === "object" && options.all) callback(null, [{ address: selected.address, family: selected.family }]);
        else callback(null, selected.address, selected.family);
      } }, (response) => {
      const status = response.statusCode ?? 500; const contentType = String(response.headers["content-type"] ?? "").toLowerCase();
      if (missingAllowed && status === 404) { response.resume(); resolve({ body: "", contentType: "text/plain", etag: null, lastModified: null }); return; }
      if (status === 401 || status === 403) { response.resume(); reject(new Error("crawl_access_denied")); return; }
      if (status === 429) { response.resume(); reject(new Error("crawl_rate_limited")); return; }
      if (status === 408) { response.resume(); reject(new Error("crawl_upstream_unavailable")); return; }
      if (status >= 400 && status < 500) { response.resume(); reject(new Error("crawl_http_rejected")); return; }
      if (status < 200 || status >= 300) { response.resume(); reject(new Error("crawl_upstream_unavailable")); return; }
      const parts: Buffer[] = []; let bytes = 0;
      response.on("data", (part: Buffer) => { bytes += part.length; if (bytes > 2 * 1024 * 1024) response.destroy(new Error("crawl_response_too_large")); else parts.push(part); });
      response.on("end", () => resolve({ body: Buffer.concat(parts).toString("utf8"), contentType,
        etag: typeof response.headers.etag === "string" ? response.headers.etag : null,
        lastModified: typeof response.headers["last-modified"] === "string" ? response.headers["last-modified"] : null }));
      response.on("error", reject);
    });
    outbound.on("timeout", () => outbound.destroy(new Error("crawl_timeout")));
    outbound.on("error", reject); outbound.end();
  });
}

async function crawlPage(rawUrl: string): Promise<CrawledPage> {
  const fetched = await fetchPublicUrl(rawUrl, "text/html,text/plain;q=0.9");
  if (!fetched.contentType.includes("text/html") && !fetched.contentType.includes("text/plain")) throw new Error("crawl_content_type_rejected");
  const $ = load(fetched.body); $("script,style,noscript,svg,template").remove();
  const title = $("title").first().text().trim(); const text = $("main,article").first().text() || $("body").text();
  const canonicalHref = $("link[rel~='canonical']").first().attr("href"); let canonicalUrl = canonicalCrawlUrl(rawUrl);
  try { if (canonicalHref) canonicalUrl = canonicalCrawlUrl(canonicalHref, rawUrl); } catch { /* Ignore unsafe canonical hints. */ }
  const links = $("a[href]").map((_index, element) => $(element).attr("href")).get().flatMap((href) => {
    try { return [canonicalCrawlUrl(href, rawUrl)]; } catch { return []; }
  });
  return { url: canonicalCrawlUrl(rawUrl), canonicalUrl, title, text: text.replace(/\s+/g, " ").trim(), links,
    etag: fetched.etag, lastModified: fetched.lastModified };
}

function inCrawlScope(candidate: string, root: URL) {
  const url = new URL(candidate); const prefix = root.pathname.endsWith("/") ? root.pathname : `${root.pathname}/`;
  return url.origin === root.origin && (url.pathname === root.pathname || url.pathname.startsWith(prefix));
}

export async function crawlWebsite(rawUrl: string, pageLimit: number, pageFetcher = crawlPage, robotsFetcher = fetchPublicUrl,
  pace: (hostname: string, minimumIntervalMs: number) => Promise<void> = async (_hostname, delay) => { await new Promise((resolve) => setTimeout(resolve, delay)); }) {
  const root = new URL(canonicalCrawlUrl(rawUrl));
  await pace(root.hostname, 500);
  const robots = await robotsFetcher(new URL("/robots.txt", root).href, "text/plain,*/*;q=0.1", true);
  const policyFor = (url: string) => robotsPolicy(robots.body, new URL(url).pathname);
  if (!policyFor(root.href).allowed) throw new Error("crawl_robots_disallowed");
  const pending = [{ url: root.href, depth: 0 }]; const visited = new Set<string>(); const pages: CrawledPage[] = [];
  const exclusions: { url: string; reason: string }[] = []; const startedAt = Date.now(); let extractedBytes = 0;
  while (pending.length && pages.length < pageLimit) {
    if (Date.now() - startedAt >= 60_000) { exclusions.push({ url: root.href, reason: "crawl_time_limit" }); break; }
    const candidate = pending.shift()!; const target = candidate.url;
    if (visited.has(target)) continue; visited.add(target); const policy = policyFor(target);
    if (!policy.allowed) { exclusions.push({ url: target, reason: "robots_disallowed" }); continue; }
    await pace(root.hostname, policy.delayMs);
    try {
      const page = await pageFetcher(target);
      if (!inCrawlScope(page.canonicalUrl, root)) { exclusions.push({ url: target, reason: "canonical_out_of_scope" }); continue; }
      if (!page.text) { exclusions.push({ url: target, reason: "empty_content" }); continue; }
      const pageBytes = Buffer.byteLength(`${page.title}\n\n${page.text}`, "utf8");
      if (extractedBytes + pageBytes > 1_800_000) {
        if (!pages.length) throw new Error("extracted_content_invalid");
        exclusions.push({ url: target, reason: "crawl_total_content_limit" }); break;
      }
      if (!pages.some((item) => item.canonicalUrl === page.canonicalUrl)) { pages.push(page); extractedBytes += pageBytes; }
      if (pageLimit > 1 && candidate.depth < 3) for (const link of page.links) {
        if (inCrawlScope(link, root) && !visited.has(link) && !pending.some((item) => item.url === link)) pending.push({ url: link, depth: candidate.depth + 1 });
      }
    } catch (error) {
      if (!pages.length && target === root.href) throw error;
      exclusions.push({ url: target, reason: safeError(error) });
    }
  }
  if (!pages.length) throw new Error("crawl_scope_empty");
  const document = buildAttributedDocument(pages.map((page) => ({ label: `Source ${page.canonicalUrl}`, text: [page.title, page.text].filter(Boolean).join("\n\n") })));
  return { ...document, pages, exclusions };
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

function safeError(error: unknown) {
  const value = error instanceof Error ? error.message : "knowledge_processing_failed";
  return /^[a-z0-9_]{2,100}$/.test(value) ? value : "knowledge_processing_failed";
}

const terminalKnowledgeErrors = new Set([
  "malware_detected", "file_signature_mismatch", "file_type_rejected", "upload_size_mismatch",
  "extracted_content_invalid", "extracted_content_empty", "extracted_content_too_many_chunks",
  "crawl_url_rejected", "crawl_address_rejected", "crawl_access_denied", "crawl_http_rejected",
  "crawl_content_type_rejected", "crawl_response_too_large", "crawl_robots_disallowed", "crawl_scope_empty",
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
      const crawled = await crawlWebsite(claim.source_url, claim.crawl_page_limit, crawlPage, fetchPublicUrl, async (hostname, intervalMs) => {
        const waitMs = await store.reserveCrawlHost(hostname, intervalMs);
        if (waitMs < 0) throw new Error("crawl_host_rate_limited");
        if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
      });
      content = crawled.content; split = crawled.chunks;
      provenance = { kind: claim.job_kind, sourceId: claim.source_id, sourceUrl: claim.source_url,
        crawlMode: claim.crawl_page_limit === 1 ? "single_page" : "same_scope", pageLimit: claim.crawl_page_limit, maxDepth: 3,
        pages: crawled.pages.map((page) => ({ url: page.url, canonicalUrl: page.canonicalUrl, etag: page.etag, lastModified: page.lastModified })),
        exclusions: crawled.exclusions, processedAt: new Date().toISOString(), extractorVersion: "knowledge-v3" };
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
