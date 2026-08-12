import { chromium } from "playwright";

const publicUrl = process.env.P9_PUBLIC_QA_URL || "http://127.0.0.1:3110";
const browser = await chromium.launch({ headless: true });
const failures = [];
const restricted = /\b(openai|anthropic|claude|gemini|gpt-[0-9]|provider[_ -]?(?:key|name|id)|model[_ -]?(?:key|name|id)|tenant[_ -]?id|source[_ -]?reference|evidence[_ -]?sha|raw cost|margin|tenant_api|voice_gateway)\b/i;
const labels = [
  "Website and signup", "Workspace and API", "Flow automation", "AI conversations",
  "Messaging channels", "Voice conversations", "Background processing",
];

function json(route, value, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
}

async function inspect(name, viewport, overall, serviceStatus) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(() => localStorage.setItem("djay-ui-locale", "en"));
  const page = await context.newPage();
  page.on("pageerror", (error) => failures.push(`${name}: page error ${error.message}`));
  page.on("console", (entry) => { if (entry.type() === "error") failures.push(`${name}: console ${entry.text()}`); });
  await page.route("**/public/status", (route) => json(route, {
    status: {
      asOf: "2026-07-16T09:30:00Z", overall,
      services: labels.map((label, index) => ({
        label, status: index === 3 ? serviceStatus : "operational",
        lastUpdatedAt: "2026-07-16T09:28:00Z",
      })),
    },
  }));
  const response = await page.goto(`${publicUrl}/status`, { waitUntil: "networkidle" });
  if (!response?.ok()) failures.push(`${name}: navigation ${response?.status()}`);
  await page.getByRole("heading", { name: overall === "operational" ? "All systems operational" : "Some systems are degraded" }).waitFor();
  const snapshot = await page.evaluate(() => ({
    body: document.body.innerText,
    width: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
    cards: document.querySelectorAll(".service-status-card:not(.loading)").length,
  }));
  if (snapshot.width > snapshot.viewport + 1) failures.push(`${name}: horizontal overflow ${snapshot.width}/${snapshot.viewport}`);
  if (snapshot.cards !== 7) failures.push(`${name}: expected seven customer-facing service cards, received ${snapshot.cards}`);
  if (restricted.test(snapshot.body)) failures.push(`${name}: internal identity or evidence metadata visible`);
  if (!snapshot.body.includes("Clear, provider-neutral updates") || !snapshot.body.includes("Create workspace")) failures.push(`${name}: disclosure or workspace path missing`);
  await page.screenshot({ path: `/tmp/djay-p9-status-${name}.png`, fullPage: true });
  await context.close();
}

await inspect("operational-desktop", { width: 1365, height: 900 }, "operational", "operational");
await inspect("degraded-mobile", { width: 390, height: 844 }, "degraded", "degraded");
await browser.close();

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.info("P9 public status UI passed operational desktop and degraded mobile state, overflow, console, seven-service, workspace-path, and confidentiality checks.");
