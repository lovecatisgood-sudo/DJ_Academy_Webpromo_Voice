import { chromium } from "playwright";

const publicUrl = process.env.PUBLIC_QA_URL || "http://127.0.0.1:3110";
const tenantUrl = process.env.TENANT_QA_URL || "http://127.0.0.1:3111";
const platformUrl = process.env.PLATFORM_QA_URL || "http://127.0.0.1:3112";
const browser = await chromium.launch({ headless: true });
const failures = [];
const brandColors = new Set();
const desktop = { width: 1365, height: 900 };
const mobile = { width: 390, height: 844 };
const tenantId = "20000000-0000-4000-8000-000000000001";

function json(route, value, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
}

async function visit({ name, url, viewport = desktop, mock, ready = "h1", check }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on("pageerror", (error) => failures.push(`${name}: page error: ${error.message}`));
  page.on("console", (entry) => {
    if (entry.type() === "error" && !entry.text().startsWith("Failed to load resource:")) failures.push(`${name}: console error: ${entry.text()}`);
  });
  page.on("response", (entry) => {
    const resourceType = entry.request().resourceType();
    if (entry.status() >= 400 && ["document", "script", "stylesheet", "image", "font"].includes(resourceType)) failures.push(`${name}: ${resourceType} returned ${entry.status()} at ${entry.url()}`);
  });
  if (mock) await mock(page);
  const response = await page.goto(url, { waitUntil: "networkidle" });
  if (!response?.ok()) failures.push(`${name}: navigation returned ${response?.status()}`);
  await page.locator(ready).first().waitFor();
  const geometry = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
  if (geometry.document > geometry.viewport + 1) failures.push(`${name}: horizontal overflow ${geometry.document}px > ${geometry.viewport}px`);
  const mark = page.locator(".brand-mark, .mark").first();
  if (await mark.count()) brandColors.add(await mark.evaluate((element) => getComputedStyle(element).backgroundColor));
  await check?.(page);
  await context.close();
}

async function mockPublic(page) {
  await page.route("**/public/catalog", (route) => json(route, { plans: [
    { planKey: "flowbot_basic", productKey: "flowbot", publicName: "FlowBot Basic", tierName: "Basic", summary: "Guided automation", sellable: true, publicHighlights: ["Visual conversation flows"] },
    { planKey: "ai_chat_premium", productKey: "ai_chat", publicName: "AI Chatbot Premium", tierName: "Premium", summary: "AI sales assistance", sellable: true, publicHighlights: ["Knowledge-grounded responses"] },
  ] }));
}

async function mockTenantRole(page, role) {
  await page.route("**/tenant/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/tenant/session") return json(route, { user: { id: "user", displayName: "QA user" }, workspaces: [{ tenantId, slug: "qa-workspace", businessName: "Bangkok Service Studio", role }], selectedTenantId: tenantId, mfaVerifiedAt: new Date().toISOString() });
    if (path === "/tenant/onboarding") return json(route, { onboarding: { tenant_id: tenantId, business_name: "Bangkok Service Studio", slug: "qa-workspace", locale: "en", timezone: "Asia/Bangkok", stage: "ready" } });
    return json(route, { status: "not_found" }, 404);
  });
}

async function mockPlatformRole(page, role) {
  await page.route("**/platform/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/platform/me") return json(route, { user: { id: "platform-user", displayName: "QA operator", role, mfaVerifiedAt: new Date().toISOString() } });
    if (path === "/platform/health-summary") return json(route, { health: { platformUsers: 4, activeSessions: 2, socialChannels: [] } });
    if (path === "/platform/commerce-overview") return json(route, { commerce: { tenants: 3, subscriptions: 5, pending: 1, active: 4 } });
    if (path === "/platform/subscriptions") return json(route, { subscriptions: [] });
    if (path === "/platform/tenants") return json(route, { tenants: [] });
    if (path === "/platform/support-grants") return json(route, { grants: [] });
    if (path === "/platform/voice/runtime-control") return json(route, { control: { mode: "paused", reasonCode: "qa_review", version: 1, changedAt: new Date().toISOString(), activeSessions: 0, reconnectingSessions: 0, expiredGrants: 0, staleConnections: 0 } });
    if (path === "/platform/voice/routing") return json(route, { routing: { admissionEnabled: false, admissionChanges: [], profiles: [], candidates: [], changes: [], incidents: [] } });
    if (path === "/platform/voice/incidents") return json(route, { incidents: [] });
    if (path === "/platform/dead-letter-recovery") return json(route, { recovery: { recoverable: [], requests: [], policy: { replayableQueueKinds: [], excludedQueueKinds: [] } } });
    if (path === "/platform/release-readiness" || path === "/platform/usage-reconciliation") return json(route, { status: "evidence_unavailable" }, 503);
    return json(route, { status: "not_found" }, 404);
  });
}

for (const [name, viewport] of [["desktop", desktop], ["mobile", mobile]]) {
  await visit({ name: `public-registration-${name}`, url: publicUrl, viewport, mock: mockPublic, ready: "#register-title", check: async (page) => {
    if (await page.locator(".plan-option").count() !== 2) failures.push(`public-registration-${name}: catalog plans missing`);
    await page.keyboard.press("Tab");
    const focusOutline = await page.locator(":focus").evaluate((element) => getComputedStyle(element).outlineStyle).catch(() => "none");
    if (focusOutline === "none") failures.push(`public-registration-${name}: keyboard focus is not visible`);
  } });
  await visit({ name: `tenant-login-${name}`, url: tenantUrl, viewport, ready: "#tenant-login-title", check: async (page) => {
    const href = await page.getByRole("link", { name: "Create workspace" }).getAttribute("href");
    if (href !== "https://djaybot.com") failures.push(`tenant-login-${name}: unsafe public registration URL ${href}`);
  } });
}

const tenantExpectations = {
  tenant_master_admin: ["Team", "Security", "Data controls"],
  tenant_admin: ["Team", "Security"],
  tenant_operator: ["Team"],
  tenant_analyst: [],
};
for (const [role, privilegedLabels] of Object.entries(tenantExpectations)) {
  await visit({ name: `tenant-${role}`, url: `${tenantUrl}/workspace`, mock: (page) => mockTenantRole(page, role), ready: ".workspace-nav", check: async (page) => {
    const labels = await page.locator(".workspace-nav a").allTextContents();
    for (const label of ["Team", "Security", "Data controls"]) {
      if (labels.includes(label) !== privilegedLabels.includes(label)) failures.push(`tenant-${role}: incorrect ${label} navigation`);
    }
  } });
}

const platformExpectations = {
  platform_owner: ["Overview", "Release", "Usage", "Voice", "Recovery", "Commerce", "Support"],
  platform_ai_operations: ["Overview", "Release", "Voice", "Recovery", "Support"],
  platform_support: ["Overview", "Release", "Recovery", "Support"],
  platform_finance: ["Overview", "Release", "Usage", "Commerce", "Support"],
};
for (const [role, expected] of Object.entries(platformExpectations)) {
  await visit({ name: `platform-${role}`, url: platformUrl, mock: (page) => mockPlatformRole(page, role), ready: "nav[aria-label='Platform operations']", check: async (page) => {
    const labels = await page.locator("nav[aria-label='Platform operations'] a").allTextContents();
    if (JSON.stringify(labels) !== JSON.stringify(expected)) failures.push(`platform-${role}: incorrect navigation ${labels.join(", ")}`);
    const brokenTargets = await page.locator("nav[aria-label='Platform operations'] a").evaluateAll((links) => links.filter((link) => !document.querySelector(link.getAttribute("href"))).map((link) => link.textContent));
    if (brokenTargets.length) failures.push(`platform-${role}: missing section targets ${brokenTargets.join(", ")}`);
  } });
}

await visit({ name: "platform-login", url: platformUrl, mock: (page) => page.route("**/platform/me", (route) => json(route, { status: "unauthenticated" }, 401)), ready: "#platform-login-title" });
await browser.close();

if (brandColors.size !== 1 || !brandColors.has("rgb(242, 193, 78)")) failures.push(`brand mark palette inconsistent: ${[...brandColors].join(", ")}`);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.info("Shared brand, responsive overflow, keyboard focus, safe cross-app links, authentication shells, and tenant/platform role navigation passed.");
