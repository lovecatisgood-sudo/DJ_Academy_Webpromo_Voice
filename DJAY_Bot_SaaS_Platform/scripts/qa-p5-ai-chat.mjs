import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const tenantUrl = process.env.TENANT_QA_URL || "http://127.0.0.1:3111";
const browser = await chromium.launch({ headless: true });
const scope = process.env.P5_QA_SCOPE || "all";
const failures = [];
const restricted = /\b(openai|anthropic|claude|gemini|gpt-[0-9]|provider[_ -]?(?:key|name|id)|model[_ -]?id)\b/i;
const workspace = { tenantId: "20000000-0000-4000-8000-000000000001", slug: "ai-browser", businessName: "AI Browser Studio", role: "tenant_master_admin" };
const agentId = "51000000-0000-4000-8000-000000000001";
const secondAgentId = "51000000-0000-4000-8000-000000000002";
const revisionId = "52000000-0000-4000-8000-000000000001";
const profileId = "53000000-0000-4000-8000-000000000001";
const deploymentKey = "djay_ai_" + "b".repeat(48);

function playbook() {
  return {
    schemaVersion: 1, playbookVersionId: "54000000-0000-4000-8000-000000000001",
    businessName: "AI Browser Studio", agentName: "Mali", languages: ["en", "th"],
    tone: "Warm and concise", salesGoal: "Qualify consultation interest",
    approvedClaims: ["Consultations are available by request"], prohibitedClaims: ["Guaranteed results"],
    discoveryQuestions: ["What would you like to improve?"], ctaPolicy: ["Offer a consultation request"],
    requiredContactFields: ["name", "email"], greeting: { th: "สวัสดี", en: "Hello" },
    offlineMessage: { th: "ทีมงานจะติดต่อกลับ", en: "Our team will follow up" }, timezone: "Asia/Bangkok",
    weeklyWindows: [], notificationProfileId: profileId,
  };
}

function json(route, value, status = 200) { return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) }); }

async function mockTenant(page, counters) {
  await page.route("**/tenant/**", async (route) => {
    const path = new URL(route.request().url()).pathname; const method = route.request().method();
    if (path === "/tenant/session") return json(route, { user: { id: "user", displayName: "AI Owner" }, workspaces: [workspace], selectedTenantId: workspace.tenantId, mfaVerifiedAt: new Date().toISOString() });
    if (path === "/tenant/support-access") return json(route, { grants: [] });
    if (path === "/tenant/knowledge") return json(route, { sources: [{ id: "source", revisionId, name: "Approved service guide", sourceKind: "text", status: "active", version: 2 }] });
    if (path === "/tenant/ai-chat/agents" && method === "GET") return json(route, { agents: [
      { id: agentId, name: "Mali", status: "active", defaultLanguage: "en", currentPublishedPlaybookVersionId: playbook().playbookVersionId, draftRevision: 3, deploymentCount: 1 },
      { id: secondAgentId, name: "Arun", status: "draft", defaultLanguage: "th", currentPublishedPlaybookVersionId: null, draftRevision: 1, deploymentCount: 0 },
    ], capabilities: { planKey: "ai_chat_basic", accessMode: "active", web: true, social: { line: false, whatsapp: false, messenger: false }, limits: { deployments: 1, knowledgeDocuments: 10 } } });
    if (path.endsWith("/draft")) {
      if (method === "GET") return json(route, { draft: { revision: 3, definition: playbook(), knowledgeRevisionIds: [revisionId], updatedAt: new Date().toISOString() } });
      counters.draftUpdates += 1; counters.draftBodies.push(route.request().postDataJSON());
      return json(route, { status: "updated", revision: 4 });
    }
    if (path.endsWith("/deployments")) {
      if (method === "GET") return json(route, { deployments: [{ id: "deployment", name: "Main website", channel: "web", keyPrefix: "djay_ai_demo", allowedOrigins: ["https://merchant.example"], status: "active", createdAt: new Date().toISOString() }] });
      counters.deploymentCreates += 1;
      return json(route, { status: "created", deploymentId: crypto.randomUUID(), deploymentKey }, 201);
    }
    if (path.endsWith("/publish")) { counters.publishes += 1; return json(route, { status: "published", playbookVersionId: crypto.randomUUID(), version: 2 }); }
    if (path.endsWith("/test")) return json(route, { preview: { stage: "S2_DISCOVERY", text: "The approved consultation is 30 minutes. What would you like to improve?", proposedActionTypes: [], citationCount: 1, handover: false } });
    if (path === "/tenant/ai-chat/notifications") return json(route, { notifications: [{ id: profileId, name: "Sales inbox", allowedTemplateKeys: ["ai_chat.lead_qualified"], status: "active" }] });
    if (path === "/tenant/ai-chat/analytics") return json(route, { analytics: { periodDays: 30, level: "core", sessions: 21, completedTurns: 48, failedTurns: 1, handovers: 3, leads: 9, appointmentRequests: 4, settledResponses: 48 } });
    if (path === "/tenant/ai-chat/social-connections") return json(route, { connections: [] });
    return json(route, { status: "not_found" }, 404);
  });
}

async function inspectDashboard(viewport, suffix) {
  const context = await browser.newContext({ viewport }); const page = await context.newPage();
  const counters = { deploymentCreates: 0, draftUpdates: 0, draftBodies: [], publishes: 0 };
  page.on("pageerror", (error) => failures.push(`dashboard-${suffix}: ${error.message}`));
  page.on("console", (entry) => { if (entry.type() === "error") failures.push(`dashboard-${suffix}: console ${entry.text()}`); });
  await mockTenant(page, counters);
  const response = await page.goto(`${tenantUrl}/workspace/ai-chat`, { waitUntil: "networkidle" });
  if (!response?.ok()) failures.push(`dashboard-${suffix}: navigation ${response?.status()}`);
  await page.locator("h1", { hasText: "AI Chat" }).waitFor();
  if (!(await page.getByText("Approved service guide", { exact: false }).count())) failures.push(`dashboard-${suffix}: knowledge pin missing`);
  if (!(await page.getByText("Sales inbox", { exact: true }).count())) failures.push(`dashboard-${suffix}: notification profile missing`);
  if (suffix === "desktop") {
    const assistantName = page.getByLabel("Assistant name");
    const businessName = page.getByLabel("Business name", { exact: true }).last();
    const timezone = page.getByLabel("IANA timezone");
    if (await assistantName.getAttribute("minlength") !== "2" || await assistantName.getAttribute("maxlength") !== "100"
      || await businessName.getAttribute("minlength") !== "2" || await businessName.getAttribute("maxlength") !== "200"
      || await timezone.getAttribute("maxlength") !== "100") failures.push(`dashboard-${suffix}: guided playbook field boundaries drifted from Sales Core`);
    await timezone.fill("not/a-timezone");
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.getByRole("alert").getByText("Timezone:", { exact: false }).waitFor();
    if (counters.draftUpdates !== 0) failures.push(`dashboard-${suffix}: invalid timezone reached the draft API`);
    if (!await timezone.evaluate((element) => element === document.activeElement)) failures.push(`dashboard-${suffix}: invalid timezone did not receive focus`);
    await timezone.fill("Asia/Bangkok");
    await assistantName.fill("  Mali Updated  ");
    await page.getByLabel("Discovery questions").fill("What would you like to improve?\nWhen would you like to start?");
    let discardPrompt = ""; page.once("dialog", async (dialog) => { discardPrompt = dialog.message(); await dialog.dismiss(); });
    await page.getByRole("button", { name: /Arun/ }).click();
    if (!discardPrompt.includes("Discard the unsaved playbook") || await assistantName.inputValue() !== "  Mali Updated  ") failures.push(`dashboard-${suffix}: dismissed agent switch discarded unsaved work`);
    if (!await page.getByRole("button", { name: "Publish immutable version" }).isDisabled()) failures.push(`dashboard-${suffix}: publish remained enabled with unsaved guided edits`);
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.getByText("Draft and knowledge pins saved.", { exact: true }).waitFor();
    if (counters.draftUpdates !== 1 || counters.draftBodies[0]?.definition?.agentName !== "Mali Updated"
      || counters.draftBodies[0]?.definition?.discoveryQuestions?.length !== 2
      || counters.draftBodies[0]?.definition?.discoveryQuestions?.[1] !== "When would you like to start?") failures.push(`dashboard-${suffix}: corrected guided draft did not send one normalized update`);

    await page.getByText("Advanced JSON", { exact: true }).click();
    const advanced = page.getByLabel("Advanced AI sales playbook JSON");
    await advanced.fill("{"); await advanced.blur();
    await page.getByRole("alert").getByText("Your text is preserved", { exact: false }).waitFor();
    await page.getByRole("button", { name: "Save draft" }).click();
    if (counters.draftUpdates !== 1) failures.push(`dashboard-${suffix}: malformed Advanced JSON sent a stale draft update`);
    if (await advanced.inputValue() !== "{") failures.push(`dashboard-${suffix}: malformed Advanced JSON was not preserved for repair`);
    await advanced.fill(JSON.stringify({ ...playbook(), tone: "Direct but warm" }, null, 2)); await advanced.blur();
    if (await page.getByLabel("Tone").inputValue() !== "Direct but warm") failures.push(`dashboard-${suffix}: repaired Advanced JSON did not refresh guided fields`);
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.getByText("Draft and knowledge pins saved.", { exact: true }).waitFor();
    if (counters.draftUpdates !== 2) failures.push(`dashboard-${suffix}: repaired Advanced JSON did not send exactly one update`);

    await page.getByRole("button", { name: "Run safe preview" }).click();
    await page.getByText("The approved consultation is 30 minutes.", { exact: false }).waitFor();
    await page.getByRole("button", { name: "Publish immutable version" }).click();
    if (counters.publishes !== 1) failures.push(`dashboard-${suffix}: expected one immutable publish, received ${counters.publishes}`);
    const deploymentForm = page.locator("form.flowbot-deploy").filter({ has: page.getByLabel("Exact allowed website origin") });
    if (await deploymentForm.getByLabel("Deployment name").getAttribute("maxlength") !== "160"
      || await deploymentForm.getByLabel("Exact allowed website origin").getAttribute("maxlength") !== "2048") {
      failures.push(`dashboard-${suffix}: deployment form drifted from the shared field boundary`);
    }
    await deploymentForm.getByLabel("Deployment name").fill("Install contract");
    await deploymentForm.getByLabel("Exact allowed website origin").fill("https://merchant.example/path");
    await deploymentForm.getByRole("button", { name: "Create web deployment" }).click();
    await deploymentForm.getByRole("alert").getByText("Enter an exact HTTPS origin", { exact: false }).waitFor();
    if (counters.deploymentCreates !== 0) failures.push(`dashboard-${suffix}: invalid path origin reached the API`);
    await deploymentForm.getByLabel("Exact allowed website origin").fill("https://merchant.example");
    await deploymentForm.getByRole("button", { name: "Create web deployment" }).click();
    await page.getByText("One-time deployment key", { exact: true }).waitFor();
    if (counters.deploymentCreates !== 1) failures.push(`dashboard-${suffix}: expected one deployment create, received ${counters.deploymentCreates}`);
    const snippet = await page.locator(".deployment-secret pre").innerText();
    const expected = 'import { mountAiChatWidget } from "https://cdn.djaybot.com/ai-chat/v1/index.js";'
      + '\n  mountAiChatWidget({ deploymentKey: "' + deploymentKey + '", apiBaseUrl: "https://api.djaybot.com" });';
    if (!snippet.includes(expected)) failures.push(`dashboard-${suffix}: install snippet drifted from the release contract`);
  }
  const dimensions = await page.evaluate(() => ({ body: document.body.innerText, width: document.documentElement.scrollWidth, viewport: innerWidth }));
  if (dimensions.width > dimensions.viewport + 1) failures.push(`dashboard-${suffix}: horizontal overflow ${dimensions.width}/${dimensions.viewport}`);
  if (restricted.test(dimensions.body)) failures.push(`dashboard-${suffix}: restricted routing term visible`);
  await page.screenshot({ path: `/tmp/djay-p5-ai-chat-${suffix}.png`, fullPage: true });
  await context.close();
}

if (scope !== "widget") {
  await inspectDashboard({ width: 1365, height: 900 }, "desktop");
  await inspectDashboard({ width: 390, height: 844 }, "mobile");
}

async function inspectWidget() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await context.newPage();
  const widgetSource = readFileSync(resolve(import.meta.dirname, "../packages/ai-chat-widget/dist/index.js"), "utf8");
  let messageCalls = 0; let humanReply = false;
  await page.route("https://merchant.example/", (route) => route.fulfill({ status: 200, contentType: "text/html", body: `<!doctype html><body><main>Merchant</main><script type="module">import { mountAiChatWidget } from "https://widget.example/index.js"; mountAiChatWidget({ deploymentKey: "djay_ai_abcdefghijklmnopqrstuvwxyzABCDEFG", apiBaseUrl: "https://api.example", openOnLoad: true, language: "en" });</script></body>` }));
  await page.route("https://widget.example/index.js", (route) => route.fulfill({ status: 200, contentType: "text/javascript", headers: { "Access-Control-Allow-Origin": "*" }, body: widgetSource }));
  await page.route("https://api.example/public/ai-chat/**", async (route) => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    const headers = { "Access-Control-Allow-Origin": "https://merchant.example", "Access-Control-Allow-Headers": "Content-Type, X-DJAY-AI-Key, X-DJAY-AI-Session", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    const fulfill = (body, status = 200) => route.fulfill({ status, contentType: "application/json", headers, body: JSON.stringify(body) });
    if (path.endsWith("/config")) return fulfill({ status: "available", config: { agentName: "Mali", defaultLanguage: "en", brandingRemoved: false } });
    if (path.endsWith("/session")) return fulfill({ status: "started", sessionToken: "djay_ai_session_abcdefghijklmnopqrstuvwxyzABCDEFG", sessionId: crypto.randomUUID(), conversationId: crypto.randomUUID(), greeting: "Hello. What would you like to improve?", nextMessageSequence: 2 }, 201);
    if (path.endsWith("/message")) {
      messageCalls += 1; const inputId = request.postDataJSON().inputId;
      const body = [
        { type: "response.start", inputId },
        { type: "response.delta", text: "I can help " },
        { type: "response.delta", text: "with that." },
        { type: "response.done", status: "completed", quickReplies: [], nextTurnSequence: 2 },
      ].map((item) => JSON.stringify(item)).join("\n") + "\n";
      return route.fulfill({ status: 200, contentType: "application/x-ndjson", headers, body });
    }
    if (path.endsWith("/sync")) return fulfill({ status: "synced", response: { status: humanReply ? "handover" : "active", lastMessageSequence: humanReply ? 3 : 2, messages: humanReply ? [{ sequence: 3, message: { content: { text: "A team member is here." } } }] : [] } });
    return fulfill({ status: "not_found" }, 404);
  });
  await page.goto("https://merchant.example/", { waitUntil: "networkidle" });
  const host = page.locator("[data-djay-ai-chat]"); await host.waitFor({ state: "attached" });
  await host.locator(".message", { hasText: "Hello. What would you like to improve?" }).waitFor();
  await host.locator("input").fill("I need more leads"); await host.locator("button.send").click();
  await host.locator(".message", { hasText: "I can help with that." }).waitFor();
  if (messageCalls !== 1) failures.push(`widget: expected one message request, received ${messageCalls}`);
  const draft = host.locator(".composer input"); await draft.fill("Keep this draft"); await draft.evaluate((element) => element.blur());
  humanReply = true; await page.waitForTimeout(5_500);
  await host.locator(".message", { hasText: "A team member is here." }).waitFor();
  if (await draft.inputValue() !== "Keep this draft") failures.push("widget: background sync erased the visitor draft");
  const contract = await host.evaluate((element) => {
    const root = element.shadowRoot; const panel = root?.querySelector(".panel"); const launcher = root?.querySelector(".launcher"); const mark = root?.querySelector(".mark"); const stream = root?.querySelector(".stream");
    const panelRect = panel?.getBoundingClientRect();
    return {
      role: panel?.getAttribute("role"), modal: panel?.getAttribute("aria-modal"), expanded: launcher?.getAttribute("aria-expanded"),
      controls: launcher?.getAttribute("aria-controls"), panelId: panel?.id,
      launcherColor: launcher ? getComputedStyle(launcher).backgroundColor : "", markColor: mark ? getComputedStyle(mark).backgroundColor : "",
      streamColor: stream ? getComputedStyle(stream).backgroundColor : "",
      streamLive: stream?.getAttribute("aria-live"), liveRegions: root?.querySelectorAll(".sr-only[aria-live='polite']").length ?? 0,
      smallTargets: [...(root?.querySelectorAll("button") ?? [])].filter((button) => { const rect = button.getBoundingClientRect(); return rect.width < 44 || rect.height < 44; }).length,
      panelLeft: panelRect?.left ?? -1, panelRight: panelRect?.right ?? innerWidth + 1,
    };
  });
  if (contract.role !== "dialog" || contract.modal !== "false") failures.push("widget: non-modal dialog semantics missing");
  if (contract.expanded !== "true" || contract.controls !== contract.panelId) failures.push("widget: launcher expansion relationship missing");
  if (contract.launcherColor !== "rgb(18, 97, 73)" || contract.markColor !== "rgb(242, 193, 78)") failures.push("widget: canonical DJAY colors missing");
  if (contract.streamColor !== "rgb(244, 246, 245)") failures.push(`widget: conversation surface color is ${contract.streamColor}`);
  if (contract.streamLive !== null || contract.liveRegions !== 1) failures.push("widget: bounded announcement region contract missing");
  if (contract.smallTargets) failures.push(`widget: ${contract.smallTargets} controls are smaller than 44px`);
  if (contract.panelLeft < 0 || contract.panelRight > 390) failures.push("widget: panel overflows the mobile viewport");
  if (restricted.test(await host.innerText())) failures.push("widget: restricted routing term visible");
  await page.screenshot({ path: "/tmp/djay-p5-ai-widget-handover.png", fullPage: true });
  await host.locator("button.icon").focus(); await page.keyboard.press("Escape");
  const closed = await host.evaluate((element) => ({ expanded: element.shadowRoot?.querySelector(".launcher")?.getAttribute("aria-expanded"), focused: element.shadowRoot?.activeElement?.classList.contains("launcher") ?? false }));
  if (closed.expanded !== "false" || !closed.focused) failures.push("widget: Escape did not close and restore launcher focus");
  await context.close();
}

if (scope !== "dashboard") await inspectWidget();
await browser.close();
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.info("P5 AI Chat dashboard and widget passed desktop/mobile, streaming, handover, canonical brand, dialog/keyboard, draft-preservation, target-size, console, overflow, and provider-leak checks.");
