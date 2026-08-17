import { chromium } from "playwright";

const buildUrl = process.env.BUILDER_QA_URL || "http://localhost:3100/build?product=text&intent=trial";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(buildUrl, { waitUntil: "networkidle" });
  await page.locator("#onboardingDemo:not(.hidden)").waitFor();
  await page.locator("#continueFromRole").click();
  await page.locator("#businessUrl").fill("djai.academy");
  await page.locator("#startWebsiteLearning").click();
  await page.locator('[data-onboarding-page="review"].active').waitFor({ timeout: 30_000 });

  const profile = {
    name: await page.locator("#reviewBusinessName").inputValue(),
    summary: await page.locator("#reviewBusinessSummary").inputValue(),
    offers: await page.locator("#reviewBusinessOffers").inputValue(),
    contact: await page.locator("#reviewBusinessContact").inputValue(),
    sources: await page.locator("#businessSourceList a").count(),
    body: await page.locator('[data-onboarding-page="review"]').innerText(),
  };
  assert(profile.name === "DJAI Academy", `Imported business name was ${JSON.stringify(profile.name)}`);
  assert(profile.summary.includes("DJAI Academy"), "Imported summary did not describe DJAI Academy");
  assert(profile.offers && !/No clear products/i.test(profile.offers), "Imported services were not projected into the review");
  assert(profile.contact === "contact@djai.academy", `Imported contact was ${JSON.stringify(profile.contact)}`);
  assert(profile.sources >= 1, "Imported public sources were not shown for merchant review");
  assert(!/Harbor Studio|harbor\.example/i.test(profile.body), "Superseded sample business data leaked into the imported review");
  assert(!errors.length, `Builder emitted page errors: ${errors.join(" | ")}`);
  await context.close();
} finally {
  await browser?.close();
}

console.info("PASS: live builder import replaced sample data with the real DJAI Academy profile, services, contact, and public source evidence.");
