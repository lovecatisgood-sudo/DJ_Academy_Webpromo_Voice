import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { load } from "cheerio";

export type CrawledWebsitePage = Readonly<{ url: string; html: string }>;

export type PublicWebsiteProfile = Readonly<{
  websiteUrl: string;
  name: string;
  type: string;
  summary: string;
  offers: string;
  hours: string;
  contact: string;
  faqs: ReadonlyArray<{ question: string; answer: string }>;
  sources: ReadonlyArray<{ name: string; url: string }>;
  pageCount: number;
  warnings: readonly string[];
}>;

const relevantPath = /\b(about|service|services|product|products|course|courses|pricing|price|faq|contact|development|portfolio|academy|บริการ|คอร์ส|เกี่ยวกับ|ติดต่อ)\b/i;

export function normalizePublicWebsiteUrl(raw: string) {
  const candidate = /^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`;
  const url = new URL(candidate);
  if (url.protocol !== "https:" || url.username || url.password || url.port) throw new Error("website_url_rejected");
  url.hash = "";
  url.search = "";
  return url;
}

export function isPublicWebsiteAddress(address: string) {
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

async function fetchHtml(target: URL, redirects = 0): Promise<CrawledWebsitePage> {
  if (redirects > 4) throw new Error("website_redirect_limit");
  const addresses = await lookup(target.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => !isPublicWebsiteAddress(entry.address))) {
    throw new Error("website_address_rejected");
  }
  const selected = addresses[0]!;
  return new Promise((resolve, reject) => {
    const outbound = request(target, {
      method: "GET",
      headers: {
        accept: "text/html,application/xhtml+xml;q=0.9,text/plain;q=0.8",
        "user-agent": "DJBOT-BusinessImporter/1.0 (+https://www.djai.academy)",
      },
      timeout: 12_000,
      lookup: (_hostname, options, callback) => {
        if (typeof options === "object" && options.all) {
          callback(null, [{ address: selected.address, family: selected.family }]);
        } else {
          callback(null, selected.address, selected.family);
        }
      },
    }, (response) => {
      const status = response.statusCode ?? 500;
      const location = response.headers.location;
      if (status >= 300 && status < 400 && location) {
        response.resume();
        let redirected: URL;
        try { redirected = normalizePublicWebsiteUrl(new URL(location, target).toString()); }
        catch { reject(new Error("website_redirect_rejected")); return; }
        void fetchHtml(redirected, redirects + 1).then(resolve, reject);
        return;
      }
      const contentType = String(response.headers["content-type"] ?? "").toLowerCase();
      if (status < 200 || status >= 300 || (!contentType.includes("text/html") && !contentType.includes("text/plain"))) {
        response.resume(); reject(new Error("website_http_rejected")); return;
      }
      const chunks: Buffer[] = [];
      let bytes = 0;
      response.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 2 * 1024 * 1024) response.destroy(new Error("website_response_too_large"));
        else chunks.push(chunk);
      });
      response.on("end", () => resolve({ url: target.toString(), html: Buffer.concat(chunks).toString("utf8") }));
      response.on("error", reject);
    });
    outbound.on("timeout", () => outbound.destroy(new Error("website_timeout")));
    outbound.on("error", reject);
    outbound.end();
  });
}

function comparableHost(hostname: string) {
  return hostname.toLowerCase().replace(/^www\./, "");
}

export async function crawlPublicWebsite(rawUrl: string, pageLimit = 7) {
  const startingUrl = normalizePublicWebsiteUrl(rawUrl);
  const first = await fetchHtml(startingUrl);
  const canonical = new URL(first.url);
  const $ = load(first.html);
  const candidates = new Map<string, URL>();
  $("a[href]").each((_index, element) => {
    const href = $(element).attr("href");
    if (!href) return;
    try {
      const url = normalizePublicWebsiteUrl(new URL(href, canonical).toString());
      if (comparableHost(url.hostname) !== comparableHost(canonical.hostname) || !relevantPath.test(url.pathname)) return;
      url.hash = ""; url.search = "";
      candidates.set(url.toString(), url);
    } catch { /* Ignore non-public and non-HTTP links. */ }
  });
  candidates.delete(first.url);
  const pages: CrawledWebsitePage[] = [first];
  const warnings: string[] = [];
  for (const target of [...candidates.values()].slice(0, Math.max(0, pageLimit - 1))) {
    try { pages.push(await fetchHtml(target)); }
    catch { warnings.push(`Could not read ${target.pathname}`); }
  }
  return { pages, warnings };
}

type JsonRecord = Record<string, unknown>;

function jsonRecords(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return value.flatMap(jsonRecords);
  if (!value || typeof value !== "object") return [];
  const record = value as JsonRecord;
  return [record, ...jsonRecords(record["@graph"]), ...jsonRecords(record.mainEntity)];
}

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value.trim()].filter(Boolean);
  if (Array.isArray(value)) return value.flatMap(strings);
  return [];
}

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function first(...values: Array<string | undefined>) {
  return values.map((value) => clean(value ?? "")).find(Boolean) ?? "";
}

function typeLabel(value: unknown) {
  const type = strings(value)[0] ?? "Business";
  return type.replace(/([a-z])([A-Z])/g, "$1 $2");
}

export function extractPublicWebsiteProfile(
  pages: readonly CrawledWebsitePage[],
  warnings: readonly string[] = [],
): PublicWebsiteProfile {
  if (!pages.length) throw new Error("website_content_empty");
  const documents = pages.map((page) => {
    const $ = load(page.html);
    const records: JsonRecord[] = [];
    $('script[type="application/ld+json"]').each((_index, element) => {
      try { records.push(...jsonRecords(JSON.parse($(element).text()))); } catch { /* Ignore malformed optional metadata. */ }
    });
    const title = clean($("title").first().text());
    const h1 = clean($("h1").first().text());
    const description = first($('meta[name="description"]').attr("content"), $('meta[property="og:description"]').attr("content"));
    const headings = $("h1,h2,h3").map((_index, element) => clean($(element).text())).get().filter((item) => item.length >= 3 && item.length <= 120);
    const email = (page.html.match(/mailto:([^"'<>?\\\s]+)/i)?.[1] ?? page.html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? "").trim();
    return { page, $, records, title, h1, description, headings, email };
  });
  const allRecords = documents.flatMap((document) => document.records);
  const organization = allRecords.find((record) => strings(record["@type"]).some((item) => /Organization|Business|Corporation|School|Educational/i.test(item)));
  const root = documents[0]!;
  const siteName = first(
    typeof organization?.name === "string" ? organization.name : undefined,
    root.$('meta[property="og:site_name"]').attr("content"),
    root.$('meta[property="og:title"]').attr("content"),
    root.h1,
    root.title.split(/[|–—-]/)[0],
    new URL(root.page.url).hostname.replace(/^www\./, ""),
  );
  const summary = first(
    typeof organization?.description === "string" ? organization.description : undefined,
    root.description,
    documents.map((document) => document.description).find(Boolean),
  );
  const knowsAbout = strings(organization?.knowsAbout);
  const serviceHeadings = [...documents]
    .filter((document) => relevantPath.test(new URL(document.page.url).pathname))
    .sort((left, right) => {
      const rank = (url: string) => /\/(service|services|product|products|pricing|price)\b/i.test(url) ? 0
        : /\/development\b/i.test(url) ? 1 : /\/(course|courses)\b/i.test(url) ? 2 : 3;
      return rank(left.page.url) - rank(right.page.url);
    })
    .flatMap((document) => document.headings)
    .filter((heading) => heading.toLowerCase() !== siteName.toLowerCase() && !/^(home|contact|about|menu|learn more)$/i.test(heading));
  const offers = [...new Set([...knowsAbout, ...serviceHeadings])].slice(0, 12).join(", ");
  const faqRecords = allRecords.filter((record) => strings(record["@type"]).includes("Question"));
  const faqs = faqRecords.flatMap((record) => {
    const question = typeof record.name === "string" ? clean(record.name) : "";
    const answerRecord = record.acceptedAnswer;
    const answer = answerRecord && typeof answerRecord === "object" && typeof (answerRecord as JsonRecord).text === "string"
      ? clean((answerRecord as JsonRecord).text as string) : "";
    return question && answer ? [{ question, answer }] : [];
  }).slice(0, 12);
  const hours = first(...strings(organization?.openingHours), "Not found — review required");
  const contact = first(typeof organization?.email === "string" ? organization.email : undefined, documents.map((document) => document.email).find(Boolean), "Not found — review required");
  const sources = documents.map((document) => ({
    name: first(document.h1, document.title, new URL(document.page.url).pathname),
    url: document.page.url,
  }));
  return {
    websiteUrl: root.page.url,
    name: siteName,
    type: typeLabel(organization?.["@type"]),
    summary: summary || `Public business information imported from ${new URL(root.page.url).hostname}. Review and complete this summary.`,
    offers: offers || "No clear products or services found — review required",
    hours,
    contact,
    faqs,
    sources,
    pageCount: pages.length,
    warnings,
  };
}
