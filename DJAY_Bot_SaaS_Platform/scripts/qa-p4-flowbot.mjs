import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const tenantUrl = process.env.TENANT_QA_URL || "http://127.0.0.1:3111";
const browser = await chromium.launch({ headless: true });
const scope = process.env.P4_QA_SCOPE || "all";
const failures = [];
const restricted = /\b(openai|anthropic|claude|gemini|gpt-[0-9]|provider[_ -]?key|model[_ -]?id)\b/i;
const botId = "40000000-0000-4000-8000-000000000001";
const versionId = "41000000-0000-4000-8000-000000000001";
const deploymentId = "42000000-0000-4000-8000-000000000001";
const workspace = { tenantId: "20000000-0000-4000-8000-000000000001", slug: "flowbot-browser", businessName: "FlowBot Browser Studio", role: "tenant_master_admin" };

function definition() {
  const root = "43000000-0000-4000-8000-000000000001"; const end = "43000000-0000-4000-8000-000000000002";
  return { schemaVersion: 1, flowVersionId: versionId, rootNodeId: root, keywords: [], nodes: {
    [root]: { id: root, type: "message", title: "Welcome", content: { th: "สวัสดีครับ", en: "Welcome" }, nextNodeId: end },
    [end]: { id: end, type: "end", title: "Complete", message: { th: "ขอบคุณครับ", en: "Thank you" } },
  } };
}

function json(route, value, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
}

async function mockFlowbot(page, planKey) {
  await page.route("**/tenant/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path === "/tenant/session") return json(route, { user: { id: "user", displayName: "FlowBot Owner" }, workspaces: [workspace], selectedTenantId: workspace.tenantId, mfaVerifiedAt: new Date().toISOString() });
    if (path === "/tenant/support-access") return json(route, { grants: [] });
    if (path === "/tenant/team") return json(route, { team: { members: [{ membership_id: "44000000-0000-4000-8000-000000000001", display_name: "Sales Owner", membership_status: "active" }], invitations: [], transfers: [] } });
    if (path === "/tenant/flowbot/bots" && method === "GET") return json(route, { bots: [{ id: botId, name: `${planKey} assistant`, status: "active", defaultLanguage: "en", currentPublishedVersionId: versionId, draftRevision: 3, deploymentCount: 1 }], capabilities: { planKey, accessMode: "active", advancedNodes: planKey === "flowbot_premium", approvedWebhooks: planKey === "flowbot_premium", teamRouting: planKey === "flowbot_premium", brandingRemoval: planKey === "flowbot_premium", limits: { activeBots: planKey === "flowbot_premium" ? 3 : 1, nodesPerBot: planKey === "flowbot_premium" ? 500 : 100, deployments: planKey === "flowbot_premium" ? 5 : 1 } } });
    if (path.endsWith("/draft")) return json(route, method === "GET" ? { draft: { revision: 3, definition: definition(), updatedAt: new Date().toISOString() } } : { status: "updated", revision: 4 });
    if (path.endsWith("/versions")) return json(route, { versions: [{ id: versionId, version: 1, sourceVersionId: null, publishedAt: new Date().toISOString() }] });
    if (path.endsWith("/deployments")) return json(route, { deployments: [{ id: deploymentId, name: "Website", keyPrefix: "djay_flow_demo", status: "active", allowedOrigins: ["https://merchant.example"], createdAt: new Date().toISOString() }] });
    if (path.endsWith("/publish")) return json(route, { status: "published", versionId: crypto.randomUUID(), version: 2 });
    if (path === "/tenant/flowbot/analytics") return json(route, { analytics: { periodDays: 30, level: planKey === "flowbot_premium" ? "advanced" : "core", executions: 18, completed: 13, handovers: 2, leads: 7, messages: 64, nodeEvents: [] } });
    if (path === "/tenant/flowbot/install-checks") return json(route, method === "GET" ? { checks: [{ id: "45000000-0000-4000-8000-000000000001", deploymentId, targetOrigin: "https://merchant.example", status: "verified", safeResultCode: "widget_seen", createdAt: new Date().toISOString() }] } : { status: "requested", checkId: crypto.randomUUID() }, method === "GET" ? 200 : 201);
    if (path === "/tenant/flowbot/downgrade-preflight") return json(route, { preflight: { allowed: planKey === "flowbot_basic", blockers: planKey === "flowbot_premium" ? [{ code: "premium_node_present", detail: "delay" }] : [], remediation: planKey === "flowbot_premium" ? [{ action: "Replace or remove this Premium node in a new draft." }] : [] } });
    if (path === "/tenant/flowbot/notifications") return json(route, method === "GET" ? { notifications: [{ id: "46000000-0000-4000-8000-000000000001", name: "Sales inbox", allowedTemplateKeys: ["flowbot.lead_captured"], status: "active", createdAt: new Date().toISOString() }] } : { status: "created", profileId: crypto.randomUUID() }, method === "GET" ? 200 : 201);
    if (path === "/tenant/flowbot/schedules" || path === "/tenant/flowbot/routing-teams") return json(route, { status: "saved" });
    return json(route, { status: "not_found" }, 404);
  });
}

async function inspectPlan(planKey, viewport, suffix) {
  const context = await browser.newContext({ viewport }); const page = await context.newPage();
  page.on("pageerror", (error) => failures.push(`${planKey}-${suffix}: ${error.message}`));
  page.on("console", (entry) => { if (entry.type() === "error") failures.push(`${planKey}-${suffix}: console ${entry.text()}`); });
  await mockFlowbot(page, planKey);
  const response = await page.goto(`${tenantUrl}/workspace/flowbot`, { waitUntil: "networkidle" });
  if (!response?.ok()) failures.push(`${planKey}-${suffix}: navigation ${response?.status()}`);
  await page.locator("h1", { hasText: "FlowBot" }).waitFor();
  const cards = await page.locator(".flow-node-card").count();
  if (cards !== 2) failures.push(`${planKey}-${suffix}: expected 2 visual nodes, found ${cards}`);
  const palette = await page.locator(".node-palette").innerText();
  if ((planKey === "flowbot_premium") !== palette.includes("delay")) failures.push(`${planKey}-${suffix}: Premium palette classification mismatch`);
  if (!(await page.getByText("Sales inbox", { exact: true }).count())) failures.push(`${planKey}-${suffix}: encrypted merchant notification profile missing`);
  if (suffix === "desktop") {
    await page.getByRole("button", { name: "Lead capture" }).click();
    await page.locator(".flow-node-card").nth(2).waitFor();
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.getByRole("button", { name: "Publish", exact: true }).click();
  }
  const dimensions = await page.evaluate(() => ({ body: document.body.innerText, width: document.documentElement.scrollWidth, viewport: innerWidth }));
  if (dimensions.width > dimensions.viewport + 1) failures.push(`${planKey}-${suffix}: horizontal overflow ${dimensions.width}/${dimensions.viewport}`);
  if (restricted.test(dimensions.body)) failures.push(`${planKey}-${suffix}: restricted provider/model term visible`);
  await page.screenshot({ path: `/tmp/djay-p4-${planKey}-${suffix}.png`, fullPage: true });
  await context.close();
}

if (scope !== "widget") {
  for (const planKey of ["flowbot_basic", "flowbot_premium"]) {
    await inspectPlan(planKey, { width: 1365, height: 900 }, "desktop");
    await inspectPlan(planKey, { width: 390, height: 844 }, "mobile");
  }
}

async function inspectWidget() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await context.newPage();
  let started = false; let humanReply = false;
  const widgetSource = readFileSync(resolve(import.meta.dirname, "../packages/flowbot-widget/dist/index.js"), "utf8");
  await page.route("https://merchant.example/", (route) => route.fulfill({ status: 200, contentType: "text/html", body: `<!doctype html><body><main>Merchant</main><script type="module">import { mountFlowbotWidget } from "https://widget.example/index.js"; mountFlowbotWidget({ deploymentKey: "djay_flow_abcdefghijklmnopqrstuvwxyzABCDEFG", apiBaseUrl: "https://api.example", openOnLoad: true });</script></body>` }));
  await page.route("https://widget.example/index.js", (route) => route.fulfill({ status: 200, contentType: "text/javascript", headers: { "Access-Control-Allow-Origin": "*" }, body: widgetSource }));
  await page.route("https://api.example/public/flowbot/**", async (route) => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    const headers = { "Access-Control-Allow-Origin": "https://merchant.example", "Access-Control-Allow-Headers": "Content-Type, X-DJAY-FlowBot-Key, X-DJAY-FlowBot-Session", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    const fulfill = (body, status = 200) => route.fulfill({ status, contentType: "application/json", headers, body: JSON.stringify(body) });
    if (path.endsWith("/config")) return fulfill({ status: "available", config: { name: "Merchant assistant", defaultLanguage: "en", brandingRemoved: false } });
    if (path.endsWith("/install")) return fulfill({ status: "recorded", verified: 1 });
    if (path.endsWith("/session")) { started = true; return fulfill({ status: "started", sessionToken: "djay_flow_session_abcdefghijklmnopqrstuvwxyzABCDEFG", response: { inputId: crypto.randomUUID(), messages: [], status: "active", nextSequence: 2 } }, 201); }
    if (path.endsWith("/sync")) {
      const body = request.postDataJSON(); const after = body.afterSequence;
      const messages = after === 0 ? [{ sequence: 1, message: { type: "text", nodeId: "43000000-0000-4000-8000-000000000001", content: { text: "Durable welcome" } } }]
        : humanReply && after === 1 ? [{ sequence: 2, message: { type: "text", nodeId: "00000000-0000-4000-8000-000000000000", content: { text: "Human follow-up" } } }] : [];
      return fulfill({ status: "synced", response: { status: humanReply ? "handover" : "active", lastMessageSequence: humanReply ? 2 : 1, messages } });
    }
    return fulfill({ status: "accepted", response: { inputId: crypto.randomUUID(), messages: [], status: "active", nextSequence: 2 } });
  });
  await page.goto("https://merchant.example/", { waitUntil: "networkidle" });
  await page.locator("[data-djay-flowbot]").waitFor({ state: "attached" });
  const host = page.locator("[data-djay-flowbot]");
  await host.locator(".message", { hasText: "Durable welcome" }).waitFor();
  if (!started) failures.push("widget: session did not start");
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("[data-djay-flowbot]").locator(".message", { hasText: "Durable welcome" }).waitFor();
  const draft = page.locator("[data-djay-flowbot]").locator(".composer input");
  await draft.fill("Keep this draft"); await draft.evaluate((element) => element.blur());
  humanReply = true;
  await page.waitForTimeout(5_500);
  await page.locator("[data-djay-flowbot]").locator(".message", { hasText: "Human follow-up" }).waitFor();
  if (await draft.inputValue() !== "Keep this draft") failures.push("widget: background sync erased the visitor draft");
  const contract = await host.evaluate((element) => {
    const root = element.shadowRoot; const panel = root?.querySelector(".panel"); const launcher = root?.querySelector(".launcher"); const mark = root?.querySelector(".mark"); const stream = root?.querySelector(".stream");
    const panelRect = panel?.getBoundingClientRect();
    return {
      role: panel?.getAttribute("role"), modal: panel?.getAttribute("aria-modal"), expanded: launcher?.getAttribute("aria-expanded"),
      controls: launcher?.getAttribute("aria-controls"), panelId: panel?.id,
      launcherColor: launcher ? getComputedStyle(launcher).backgroundColor : "", markColor: mark ? getComputedStyle(mark).backgroundColor : "",
      streamLive: stream?.getAttribute("aria-live"), liveRegions: root?.querySelectorAll(".sr-only[aria-live='polite']").length ?? 0,
      smallTargets: [...(root?.querySelectorAll("button") ?? [])].filter((button) => { const rect = button.getBoundingClientRect(); return rect.width < 44 || rect.height < 44; }).length,
      panelLeft: panelRect?.left ?? -1, panelRight: panelRect?.right ?? innerWidth + 1,
    };
  });
  if (contract.role !== "dialog" || contract.modal !== "false") failures.push("widget: non-modal dialog semantics missing");
  if (contract.expanded !== "true" || contract.controls !== contract.panelId) failures.push("widget: launcher expansion relationship missing");
  if (contract.launcherColor !== "rgb(18, 97, 73)" || contract.markColor !== "rgb(242, 193, 78)") failures.push("widget: canonical DJAY colors missing");
  if (contract.streamLive !== null || contract.liveRegions !== 1) failures.push("widget: bounded announcement region contract missing");
  if (contract.smallTargets) failures.push(`widget: ${contract.smallTargets} controls are smaller than 44px`);
  if (contract.panelLeft < 0 || contract.panelRight > 390) failures.push("widget: panel overflows the mobile viewport");
  await page.screenshot({ path: "/tmp/djay-p4-widget-handover.png", fullPage: true });
  await host.locator("button.icon").focus(); await page.keyboard.press("Escape");
  const closed = await host.evaluate((element) => ({
    expanded: element.shadowRoot?.querySelector(".launcher")?.getAttribute("aria-expanded"),
    focused: element.shadowRoot?.activeElement?.classList.contains("launcher") ?? false,
  }));
  if (closed.expanded !== "false" || !closed.focused) failures.push("widget: Escape did not close and restore launcher focus");
  await context.close();
}

if (scope !== "plans") await inspectWidget();
await browser.close();
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.info("P4 Basic/Premium authoring and widget replay/handover passed desktop/mobile, entitlement, canonical brand, dialog/keyboard, draft-preservation, target-size, console, overflow, and provider-leak checks.");
