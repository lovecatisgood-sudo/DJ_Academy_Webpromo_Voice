import { describe, expect, it } from "vitest";
import { extractPublicWebsiteProfile, isPublicWebsiteAddress, normalizePublicWebsiteUrl } from "./public-website-profile";

describe("public website profile import", () => {
  it("normalizes a bare public domain and rejects unsafe schemes", () => {
    expect(normalizePublicWebsiteUrl("djai.academy").toString()).toBe("https://djai.academy/");
    expect(() => normalizePublicWebsiteUrl("http://djai.academy")).toThrow("website_url_rejected");
    expect(() => normalizePublicWebsiteUrl("https://user:pass@djai.academy")).toThrow("website_url_rejected");
  });

  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.4", "::1", "fc00::1"])("rejects private address %s", (address) => {
    expect(isPublicWebsiteAddress(address)).toBe(false);
  });

  it("extracts the business identity and replaces sample data", () => {
    const profile = extractPublicWebsiteProfile([{
      url: "https://www.djai.academy/",
      html: `<html><head><title>DJAI Academy | Build with AI</title><meta name="description" content="Learn AI and build software."></head><body>
        <script type="application/ld+json">{"@type":"EducationalOrganization","name":"DJAI Academy","description":"Practical AI education and software development.","knowsAbout":["Artificial intelligence","Software development"]}</script>
        <h1>DJAI Academy</h1><h2>Courses and software services</h2><a href="mailto:contact@djai.academy">Email</a></body></html>`,
    }]);
    expect(profile).toMatchObject({
      name: "DJAI Academy",
      type: "Educational Organization",
      summary: "Practical AI education and software development.",
      offers: "Artificial intelligence, Software development",
      contact: "contact@djai.academy",
      pageCount: 1,
    });
    expect(JSON.stringify(profile)).not.toContain("Harbor Studio");
  });
});
