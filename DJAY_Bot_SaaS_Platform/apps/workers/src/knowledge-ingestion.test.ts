import { describe, expect, it } from "vitest";
import { buildAttributedDocument, canonicalCrawlUrl, crawlWebsite, robotsPolicy, validateKnowledgeFileSignature } from "./knowledge-ingestion";

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

describe("governed website crawling", () => {
  it("canonicalizes public candidates and applies the most specific robots rule", () => {
    expect(canonicalCrawlUrl("https://EXAMPLE.com/services//plans?campaign=x#top")).toBe("https://example.com/services/plans");
    expect(() => canonicalCrawlUrl("http://example.com/")).toThrow("crawl_url_rejected");
    expect(() => canonicalCrawlUrl("https://example.com:8443/")).toThrow("crawl_url_rejected");
    const robots = "User-agent: *\nDisallow: /services\nAllow: /services/public\nCrawl-delay: 2";
    expect(robotsPolicy(robots, "/services/private")).toEqual({ allowed: false, delayMs: 2000 });
    expect(robotsPolicy(robots, "/services/public")).toEqual({ allowed: true, delayMs: 2000 });
  });

  it("keeps Advanced discovery inside the approved path and attributes each canonical page", async () => {
    const fetched: string[] = [];
    const page = (url: string, text: string, links: string[]) => ({
      url, canonicalUrl: url, title: text, text: `${text} details`, links, etag: null, lastModified: null,
    });
    const result = await crawlWebsite("https://example.com/services", 25, async (url) => {
      fetched.push(url);
      if (url.endsWith("/services")) return page(url, "Services", [
        "https://example.com/services/consulting", "https://example.com/services/private", "https://example.com/about",
      ]);
      return page(url, "Consulting", []);
    }, async () => ({ body: "User-agent: *\nDisallow: /services/private", contentType: "text/plain", etag: null, lastModified: null }), async () => {});
    expect(fetched).toEqual(["https://example.com/services", "https://example.com/services/consulting"]);
    expect(result.pages).toHaveLength(2);
    expect(result.exclusions).toContainEqual({ url: "https://example.com/services/private", reason: "robots_disallowed" });
    expect(result.chunks.every((chunk) => chunk.startsWith("[Source https://example.com/services"))).toBe(true);
  });

  it("limits Starter import to the exact approved page", async () => {
    const fetched: string[] = [];
    const result = await crawlWebsite("https://example.com/services", 1, async (url) => {
      fetched.push(url); return { url, canonicalUrl: url, title: "Services", text: "Approved details",
        links: ["https://example.com/services/next"], etag: "v1", lastModified: null };
    }, async () => ({ body: "", contentType: "text/plain", etag: null, lastModified: null }), async () => {});
    expect(fetched).toEqual(["https://example.com/services"]);
    expect(result.pages).toHaveLength(1);
  });

  it("caps discovery depth and aggregate extracted content", async () => {
    const fetched: string[] = [];
    const result = await crawlWebsite("https://example.com/scope", 25, async (url) => {
      fetched.push(url); const depth = url.split("/").filter(Boolean).length - 2;
      return { url, canonicalUrl: url, title: `Depth ${depth}`, text: "Approved",
        links: [`${url}/next`], etag: null, lastModified: null };
    }, async () => ({ body: "", contentType: "text/plain", etag: null, lastModified: null }), async () => {});
    expect(result.pages).toHaveLength(4);
    expect(fetched.at(-1)).toBe("https://example.com/scope/next/next/next");
    await expect(crawlWebsite("https://example.com/scope", 1, async (url) => ({
      url, canonicalUrl: url, title: "Large", text: "x".repeat(1_800_001), links: [], etag: null, lastModified: null,
    }), async () => ({ body: "", contentType: "text/plain", etag: null, lastModified: null }), async () => {})).rejects.toThrow("extracted_content_invalid");
  });
});
