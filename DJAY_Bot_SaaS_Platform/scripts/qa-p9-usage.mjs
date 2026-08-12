import { chromium } from "playwright";

const tenantUrl = process.env.P9_TENANT_QA_URL || "http://127.0.0.1:3111";
const browser = await chromium.launch({ headless: true });
const failures = [];
const restricted = /\b(openai|anthropic|claude|gemini|gpt-[0-9]|provider[_ -]?(?:key|name|id)|model[_ -]?id|native usage|raw cost)\b/i;
const tenantId = "20000000-0000-4000-8000-000000000009";
const now = new Date("2026-07-16T08:00:00Z");

const usage = {
  asOf: now.toISOString(),
  billingMode: "pre_release",
  invoicesAvailable: false,
  subscriptions: [
    {
      subscriptionId: "91000000-0000-4000-8000-000000000001",
      productKey: "ai_chat", planKey: "ai_chat_premium", publicName: "AI Chatbot Premium",
      tierName: "Premium", status: "active", accessMode: "active", customerUnit: "ai_response",
      periodStart: "2026-07-01T00:00:00Z", periodEnd: "2026-08-01T00:00:00Z",
      includedQuantity: 1000, safetyCapQuantity: 1200, reservedQuantity: 8,
      settledQuantity: 432, committedQuantity: 440, remainingIncludedQuantity: 560,
      remainingSafetyCapQuantity: 760, recurringAmountMinor: null, billingInterval: null,
      overageRateMinor: null, pricingConfigured: false,
    },
    {
      subscriptionId: "91000000-0000-4000-8000-000000000002",
      productKey: "voice", planKey: "voice_advanced_gen2", publicName: "Voice Agent Advanced",
      tierName: "Advanced", status: "pending", accessMode: "none", customerUnit: "voice_minute",
      periodStart: "2026-07-01T00:00:00Z", periodEnd: "2026-08-01T00:00:00Z",
      includedQuantity: null, safetyCapQuantity: null, reservedQuantity: 0,
      settledQuantity: 17.5, committedQuantity: 17.5, remainingIncludedQuantity: null,
      remainingSafetyCapQuantity: null, recurringAmountMinor: null, billingInterval: null,
      overageRateMinor: null, pricingConfigured: false,
    },
  ],
};

function json(route, value, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
}

async function mockTenant(page, role) {
  await page.route("**/tenant/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/tenant/session") return json(route, {
      user: { id: "user", displayName: role === "tenant_master_admin" ? "Workspace Owner" : "Usage Analyst" },
      workspaces: [{ tenantId, slug: "usage-studio", businessName: "Siam Growth Studio", role }],
      selectedTenantId: tenantId, mfaVerifiedAt: new Date().toISOString(),
    });
    if (path === "/tenant/usage") return json(route, { usage });
    return json(route, { status: "not_found" }, 404);
  });
}

async function inspect(name, role, viewport) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(() => localStorage.setItem("djay-ui-locale", "en"));
  const page = await context.newPage();
  page.on("pageerror", (error) => failures.push(`${name}: page error ${error.message}`));
  page.on("console", (entry) => { if (entry.type() === "error") failures.push(`${name}: console ${entry.text()}`); });
  await mockTenant(page, role);
  const response = await page.goto(`${tenantUrl}/workspace/usage`, { waitUntil: "networkidle" });
  if (!response?.ok()) failures.push(`${name}: navigation ${response?.status()}`);
  await page.getByRole("heading", { name: "Plans and usage" }).waitFor();
  await page.getByText("432 AI responses", { exact: true }).waitFor();
  const snapshot = await page.evaluate(() => ({
    body: document.body.innerText,
    width: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  if (snapshot.width > snapshot.viewport + 1) failures.push(`${name}: horizontal overflow ${snapshot.width}/${snapshot.viewport}`);
  if (restricted.test(snapshot.body)) failures.push(`${name}: restricted internal identity visible`);
  if (!snapshot.body.includes("No public charges are being collected")) failures.push(`${name}: pre-release billing disclosure missing`);
  if (!snapshot.body.includes("560 AI responses remaining")) failures.push(`${name}: allowance reconciliation missing`);
  if (role === "tenant_master_admin" && !snapshot.body.includes("As workspace owner")) failures.push(`${name}: owner guidance missing`);
  if (role === "tenant_analyst" && !snapshot.body.includes("Only the workspace owner")) failures.push(`${name}: analyst authority guidance missing`);
  if (await page.getByRole("progressbar").count() !== 1) failures.push(`${name}: included-usage progress semantics missing`);
  await page.screenshot({ path: `/tmp/djay-p9-usage-${name}.png`, fullPage: true });
  await context.close();
}

await inspect("owner-desktop", "tenant_master_admin", { width: 1365, height: 900 });
await inspect("analyst-mobile", "tenant_analyst", { width: 390, height: 844 });
await browser.close();

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.info("P9 Usage Center passed owner desktop and analyst mobile role, overflow, progress, billing-disclosure, console, and confidentiality checks.");
