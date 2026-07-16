import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const publicUrl = process.env.PUBLIC_QA_URL || "http://127.0.0.1:3110";
const tenantUrl = process.env.TENANT_QA_URL || "http://127.0.0.1:3111";
const platformUrl = process.env.PLATFORM_QA_URL || "http://127.0.0.1:3112";
const apiUrl = process.env.API_QA_URL || "http://127.0.0.1:3113";
const browser = await chromium.launch({ headless: true });
const failures = [];
const brandColors = new Set();
const desktop = { width: 1365, height: 900 };
const mobile = { width: 390, height: 844 };
const tenantId = "20000000-0000-4000-8000-000000000001";

function json(route, value, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
}

async function auditAccessibility(page, name) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  for (const violation of result.violations) {
    const targets = violation.nodes.slice(0, 3).flatMap((node) => node.target).join(", ");
    failures.push(`${name}: accessibility ${violation.id} (${violation.impact || "unknown"}) at ${targets}: ${violation.help}`);
  }
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
  const mark = page.locator(".brand-mark, .mark, .api-mark").first();
  if (await mark.count()) brandColors.add(await mark.evaluate((element) => getComputedStyle(element).backgroundColor));
  await check?.(page);
  await auditAccessibility(page, name);
  await context.close();
}

async function mockPublic(page, failedPaths, abortedMutationPaths) {
  await page.route("**/public/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (abortedMutationPaths?.has(path) && route.request().method() !== "GET") return route.abort("connectionfailed");
    if (failedPaths?.has(path)) return json(route, { status: "temporarily_unavailable" }, 503);
    if (path === "/public/catalog") return json(route, { plans: [
      { planKey: "flowbot_basic", productKey: "flowbot", publicName: "FlowBot Basic", tierName: "Basic", summary: "Guided automation", sellable: true, publicHighlights: ["Visual conversation flows"] },
      { planKey: "ai_chat_premium", productKey: "ai_chat", publicName: "AI Chatbot Premium", tierName: "Premium", summary: "AI sales assistance", sellable: true, publicHighlights: ["Knowledge-grounded responses"] },
    ] });
    if (path === "/public/status") return json(route, { status: { asOf: new Date().toISOString(), overall: "operational", services: [] } });
    if (path === "/public/auth/verify-email") return json(route, { status: "verified" });
    if (path === "/public/invitations/accept") return json(route, { status: "accepted" });
    return json(route, { status: "not_found" }, 404);
  });
}

async function mockTenantRole(page, role, requestedPaths, failedPaths, abortedMutationPaths, productDetail = false) {
  await page.route("**/tenant/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    requestedPaths?.add(path);
    if (abortedMutationPaths?.has(path) && route.request().method() !== "GET") return route.abort("connectionfailed");
    if (failedPaths?.has(path)) return json(route, { status: "temporarily_unavailable" }, 503);
    if (path === "/tenant/session") return json(route, { user: { id: "user", displayName: "QA user" }, workspaces: [{ tenantId, slug: "qa-workspace", businessName: "Bangkok Service Studio", role }], selectedTenantId: tenantId, mfaVerifiedAt: new Date().toISOString() });
    if (path === "/tenant/onboarding") return json(route, { onboarding: { tenant_id: tenantId, business_name: "Bangkok Service Studio", slug: "qa-workspace", locale: "en", timezone: "Asia/Bangkok", stage: "ready" } });
    if (path === "/tenant/subscriptions") return json(route, { subscriptions: [{ id: "subscription", productKey: "ai_chat", planKey: "ai_chat_premium", publicName: "AI Chatbot Premium", tierName: "Premium", status: "active", accessMode: "active", snapshotId: "snapshot", periodStart: new Date().toISOString(), periodEnd: new Date(Date.now() + 30 * 86400_000).toISOString() }] });
    if (path === "/tenant/support-access") return json(route, { grants: [] });
    if (path === "/tenant/contacts") return json(route, { contacts: [], identityReviewCandidates: [] });
    if (path === "/tenant/leads") return json(route, { leads: [] });
    if (path === "/tenant/knowledge") return json(route, { sources: [] });
    if (path === "/tenant/conversations") return json(route, { conversations: [{ id: "conversation", contactName: "QA customer", productKey: "ai_chat", channelKind: "web", automationMode: "human", status: "open", lastMessage: "Could you help?", lastMessageAt: new Date().toISOString(), voiceStatus: null, voiceTerminalReason: null, voiceMinutes: null, voiceDurationSeconds: null, voiceOutcome: null, voiceSummary: null, callbackStatus: null, callbackDueAt: null }] });
    if (path === "/tenant/conversations/conversation/messages") return json(route, { messages: [] });
    if (path === "/tenant/team") return json(route, { team: { members: [], invitations: [], transfers: [] } });
    if (path === "/tenant/security/sessions") return json(route, { sessions: [] });
    if (path === "/tenant/privacy-jobs") return json(route, { jobs: [] });
    if (path === "/tenant/retention-policy") return json(route, { policy: { transcriptDays: 90, recordingDays: 0, voicePlanMaximumDays: 365, updatedAt: new Date().toISOString() } });
    if (path === "/tenant/flowbot/bots" && productDetail) return json(route, { bots: [{ id: "30000000-0000-4000-8000-000000000001", name: "Sales flow", status: "published", defaultLanguage: "en", currentPublishedVersionId: "40000000-0000-4000-8000-000000000001", draftRevision: 1, deploymentCount: 1 }], capabilities: { planKey: "flowbot_premium", accessMode: "active", advancedNodes: true, approvedWebhooks: true, teamRouting: true, brandingRemoval: true, limits: { activeBots: 10, nodesPerBot: 200, deployments: 10 } } });
    if (path === "/tenant/flowbot/bots/30000000-0000-4000-8000-000000000001/draft") return json(route, { draft: { revision: 1, definition: { schemaVersion: 1, nodes: {} }, updatedAt: new Date().toISOString() } });
    if (path === "/tenant/flowbot/bots/30000000-0000-4000-8000-000000000001/versions") return json(route, { versions: [] });
    if (path === "/tenant/flowbot/bots/30000000-0000-4000-8000-000000000001/deployments") return json(route, { deployments: [{ id: "50000000-0000-4000-8000-000000000001", name: "Website", keyPrefix: "flow_qa", status: "active", allowedOrigins: ["https://merchant.example"], createdAt: new Date().toISOString() }] });
    if (path === "/tenant/flowbot/bots") return json(route, { bots: [], capabilities: { planKey: "flowbot_basic", accessMode: "active", advancedNodes: false, approvedWebhooks: false, teamRouting: false, brandingRemoval: false, limits: { activeBots: 1, nodesPerBot: 25, deployments: 1 } } });
    if (path === "/tenant/flowbot/analytics") return json(route, { analytics: null });
    if (path === "/tenant/flowbot/install-checks") return json(route, { checks: [] });
    if (path === "/tenant/flowbot/downgrade-preflight") return json(route, { preflight: null });
    if (path === "/tenant/flowbot/notifications") return json(route, { notifications: [] });
    if (path === "/tenant/ai-chat/agents" && productDetail) return json(route, { agents: [{ id: "60000000-0000-4000-8000-000000000001", name: "Sales assistant", status: "published", defaultLanguage: "en", currentPublishedPlaybookVersionId: "70000000-0000-4000-8000-000000000001", draftRevision: 1, deploymentCount: 1 }], capabilities: { planKey: "ai_chat_premium", accessMode: "active", web: true, social: { line: true, whatsapp: true, messenger: true }, limits: { deployments: 10, knowledgeDocuments: 100 } } });
    if (path === "/tenant/ai-chat/agents/60000000-0000-4000-8000-000000000001/draft") return json(route, { draft: { revision: 1, definition: {}, knowledgeRevisionIds: [], updatedAt: new Date().toISOString() } });
    if (path === "/tenant/ai-chat/agents/60000000-0000-4000-8000-000000000001/deployments") return json(route, { deployments: [{ id: "80000000-0000-4000-8000-000000000001", name: "Website", channel: "web", keyPrefix: "chat_qa", allowedOrigins: ["https://merchant.example"], status: "active", createdAt: new Date().toISOString() }] });
    if (path === "/tenant/ai-chat/agents") return json(route, { agents: [], capabilities: { planKey: "ai_chat_basic", accessMode: "active", web: true, social: { line: false, whatsapp: false, messenger: false }, limits: { deployments: 1, knowledgeDocuments: 10 } } });
    if (path === "/tenant/ai-chat/notifications") return json(route, { notifications: [] });
    if (path === "/tenant/ai-chat/analytics") return json(route, { analytics: null });
    if (path === "/tenant/ai-chat/social-connections") return json(route, { connections: [] });
    if (path === "/tenant/voice/deployments") return json(route, { capability: { enabled: true, publicLabel: "First-Generation Voice Engine" }, deployments: [] });
    if (path === "/tenant/usage") return json(route, { usage: { asOf: new Date().toISOString(), billingMode: "pre_release", invoicesAvailable: false, subscriptions: [] } });
    return json(route, { status: "not_found" }, 404);
  });
}

async function mockPlatformRole(page, role, failedPaths, abortedMutationPaths) {
  await page.route("**/platform/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (abortedMutationPaths?.has(path) && route.request().method() !== "GET") return route.abort("connectionfailed");
    if (failedPaths?.has(path)) return json(route, { status: "temporarily_unavailable" }, 503);
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
  await visit({ name: `api-root-${name}`, url: apiUrl, viewport, ready: "#api-title", check: async (page) => {
    if (await page.getByRole("link", { name: "Go to DJAY Bot" }).getAttribute("href") !== "https://djaybot.com") failures.push(`api-root-${name}: unsafe public site URL`);
  } });
}

await visit({ name: "public-status", url: `${publicUrl}/status`, mock: mockPublic, ready: "#status-title", check: async (page) => {
  await page.getByText("All systems operational").waitFor();
} });
await visit({ name: "public-catalog-failure", url: publicUrl, mock: (page) => mockPublic(page, new Set(["/public/catalog"])), ready: ".plan-load-state.error", check: async (page) => {
  if (!await page.getByRole("button", { name: "Try again" }).count()) failures.push("public-catalog-failure: retry action missing");
  if (!await page.getByRole("button", { name: "Create workspace" }).isEnabled()) failures.push("public-catalog-failure: owner registration was unnecessarily blocked");
} });
await visit({ name: "public-mutation-network-failure", url: publicUrl, mock: (page) => mockPublic(page, undefined, new Set(["/public/auth/register"])), ready: "#register-title", check: async (page) => {
  await page.getByLabel("Your name").fill("QA Owner");
  await page.getByLabel("Work email").fill("owner@example.test");
  await page.getByLabel("Business name").fill("QA Studio");
  await page.getByLabel("Password").fill("correct-horse-battery-staple");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create workspace" }).click();
  await page.getByText("Registration could not be completed.", { exact: true }).waitFor();
  if (!await page.getByRole("button", { name: "Create workspace" }).isEnabled()) failures.push("public-mutation-network-failure: submit remained busy");
} });
await visit({ name: "public-verification", url: `${publicUrl}/verify-email?token=qa-token`, mock: mockPublic, ready: "#verification-title", check: async (page) => {
  const link = page.getByRole("link", { name: "Continue to sign in" });
  await page.getByRole("button", { name: "Confirm email" }).click();
  await link.waitFor({ timeout: 5_000 }).catch(() => undefined);
  if (!await link.isVisible()) failures.push(`public-verification: verified continuation missing (${(await page.locator(".form-message").textContent().catch(() => "no status"))?.trim()})`);
  else if (await link.getAttribute("href") !== "https://app.djaybot.com") failures.push("public-verification: unsafe tenant sign-in URL");
} });
await visit({ name: "public-invitation", url: `${publicUrl}/invitations/accept?token=qa-token`, mock: mockPublic, ready: "#invitation-title", check: async (page) => {
  if (await page.getByRole("link", { name: "Sign in first" }).getAttribute("href") !== "https://app.djaybot.com") failures.push("public-invitation: unsafe tenant sign-in URL");
} });
const redirectContext = await browser.newContext();
const loginRedirect = await redirectContext.request.get(`${publicUrl}/login`, { maxRedirects: 0 });
if (![307, 308].includes(loginRedirect.status()) || !["https://app.djaybot.com", "https://app.djaybot.com/"].includes(loginRedirect.headers().location)) failures.push(`public-login: unsafe redirect ${loginRedirect.status()} ${loginRedirect.headers().location}`);
await redirectContext.close();

await visit({ name: "tenant-recovery", url: `${tenantUrl}/recovery`, ready: "#recovery-title" });
await visit({ name: "tenant-recovery-complete", url: `${tenantUrl}/recovery/complete?token=qa-token`, ready: "#recovery-complete-title" });
await visit({ name: "tenant-ownership", url: `${tenantUrl}/ownership/accept?transferId=transfer&token=qa-token`, mock: (page) => mockTenantRole(page, "tenant_master_admin"), ready: "#acceptance-title" });
await visit({ name: "tenant-ownership-session-failure", url: `${tenantUrl}/ownership/accept?transferId=transfer&token=qa-token`, mock: (page) => mockTenantRole(page, "tenant_master_admin", undefined, new Set(["/tenant/session"])), ready: "#acceptance-title", check: async (page) => {
  if (!await page.getByText("Your account session could not be checked. No ownership state changed.", { exact: true }).count()) failures.push("tenant-ownership-session-failure: safe explanation missing");
  if (!await page.getByRole("button", { name: "Try again" }).count()) failures.push("tenant-ownership-session-failure: retry action missing");
} });
await visit({ name: "workspace-subscription-summary", url: `${tenantUrl}/workspace`, mock: (page) => mockTenantRole(page, "tenant_analyst"), ready: ".product-overview-grid", check: async (page) => {
  if (!await page.getByRole("link", { name: /AI Chatbot Premium/ }).count()) failures.push("workspace-subscription-summary: product route missing");
  if (await page.getByText("No products are configured yet", { exact: true }).count()) failures.push("workspace-subscription-summary: active subscription presented as empty");
} });

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

const workspaceRoutes = ["", "flowbot", "ai-chat", "voice", "inbox", "contacts", "leads", "knowledge", "data", "team", "usage", "security"];
for (const [viewportName, viewport] of [["desktop", desktop], ["mobile", mobile]]) {
  for (const route of workspaceRoutes) {
    const routeName = route || "overview";
    await visit({ name: `workspace-${routeName}-${viewportName}`, url: `${tenantUrl}/workspace${route ? `/${route}` : ""}`, viewport, mock: (page) => mockTenantRole(page, "tenant_master_admin"), ready: "h1", check: async (page) => {
      if (!await page.locator(".workspace-main").count()) failures.push(`workspace-${routeName}-${viewportName}: workspace shell missing`);
    } });
  }
}

await visit({ name: "analyst-overview", url: `${tenantUrl}/workspace`, mock: (page) => mockTenantRole(page, "tenant_analyst"), ready: ".stage-control", check: async (page) => {
  if (await page.locator(".stage-control button:enabled").count()) failures.push("analyst-overview: onboarding mutations exposed");
} });
for (const [route, forbiddenHeading] of [["contacts", "Create contact"], ["leads", "Create lead"], ["knowledge", "Add source"]]) {
  await visit({ name: `analyst-${route}`, url: `${tenantUrl}/workspace/${route}`, mock: (page) => mockTenantRole(page, "tenant_analyst"), ready: "h1", check: async (page) => {
    if (await page.getByRole("heading", { name: forbiddenHeading }).count()) failures.push(`analyst-${route}: write control exposed`);
    if (!await page.locator(".workspace-access-note").count()) failures.push(`analyst-${route}: view-only explanation missing`);
  } });
}
await visit({ name: "analyst-inbox", url: `${tenantUrl}/workspace/inbox`, mock: (page) => mockTenantRole(page, "tenant_analyst"), ready: ".conversation-panel", check: async (page) => {
  for (const action of ["Send reply", "Take over", "Release automation"]) if (await page.getByRole("button", { name: action }).count()) failures.push(`analyst-inbox: ${action} exposed`);
} });
for (const route of ["team", "security"]) {
  const requestedPaths = new Set();
  await visit({ name: `analyst-${route}-denied`, url: `${tenantUrl}/workspace/${route}`, mock: (page) => mockTenantRole(page, "tenant_analyst", requestedPaths), ready: ".workspace-access-denied", check: async (page) => {
    if (!await page.getByRole("heading", { name: "You don’t have access to this area" }).count()) failures.push(`analyst-${route}: access explanation missing`);
    const protectedPath = route === "team" ? "/tenant/team" : "/tenant/security/sessions";
    if (requestedPaths.has(protectedPath)) failures.push(`analyst-${route}: protected data request was initiated`);
  } });
}
const analystDataRequests = new Set();
await visit({ name: "analyst-data-denied", url: `${tenantUrl}/workspace/data`, mock: (page) => mockTenantRole(page, "tenant_analyst", analystDataRequests), ready: "h1", check: async (page) => {
  if (!await page.getByRole("heading", { name: "Tenant Master Admin access required" }).count()) failures.push("analyst-data: access explanation missing");
  for (const path of ["/tenant/contacts", "/tenant/privacy-jobs", "/tenant/retention-policy"]) if (analystDataRequests.has(path)) failures.push(`analyst-data: protected data request initiated at ${path}`);
} });
await visit({ name: "operator-knowledge", url: `${tenantUrl}/workspace/knowledge`, mock: (page) => mockTenantRole(page, "tenant_operator"), ready: "h1", check: async (page) => {
  if (await page.getByRole("heading", { name: "Add source" }).count()) failures.push("operator-knowledge: write control exposed");
} });
await visit({ name: "operator-inbox", url: `${tenantUrl}/workspace/inbox`, mock: (page) => mockTenantRole(page, "tenant_operator"), ready: ".conversation-panel", check: async (page) => {
  if (!await page.getByRole("button", { name: "Send reply" }).count()) failures.push("operator-inbox: reply control missing");
} });
await visit({ name: "tenant-mutation-network-failure", url: `${tenantUrl}/workspace/contacts`, mock: (page) => mockTenantRole(page, "tenant_master_admin", undefined, undefined, new Set(["/tenant/contacts"])), ready: ".record-form", check: async (page) => {
  await page.getByLabel("Name").fill("QA Contact");
  await page.getByRole("button", { name: "Create contact" }).click();
  await page.getByText("Contact could not be created.", { exact: true }).waitFor();
  if (!await page.getByRole("button", { name: "Create contact" }).isEnabled()) failures.push("tenant-mutation-network-failure: control remained busy");
} });
await visit({ name: "tenant-support-status-failure", url: `${tenantUrl}/workspace/contacts`, mock: (page) => mockTenantRole(page, "tenant_master_admin", undefined, new Set(["/tenant/support-access"])), ready: ".support-access-banner.error", check: async (page) => {
  if (!await page.getByText("Refresh before handling customer data or making workspace changes.", { exact: true }).count()) failures.push("tenant-support-status-failure: safe support-access guidance missing");
} });
await visit({ name: "inbox-message-failure", url: `${tenantUrl}/workspace/inbox`, mock: (page) => mockTenantRole(page, "tenant_operator", undefined, new Set(["/tenant/conversations/conversation/messages"])), ready: ".conversation-panel", check: async (page) => {
  if (!await page.getByRole("button", { name: "Retry messages" }).count()) failures.push("inbox-message-failure: inline retry action missing");
} });
const flowbotSecondaryFailures = new Set(["/tenant/flowbot/analytics", "/tenant/flowbot/install-checks", "/tenant/team", "/tenant/flowbot/downgrade-preflight", "/tenant/flowbot/notifications"]);
await visit({ name: "flowbot-secondary-failures", url: `${tenantUrl}/workspace/flowbot`, mock: (page) => mockTenantRole(page, "tenant_master_admin", undefined, flowbotSecondaryFailures, undefined, true), ready: ".flowbot-operations-grid", check: async (page) => {
  for (const message of ["Install verification status could not be loaded. Deployment records remain available.", "Active team members could not be loaded.", "Notification recipients could not be loaded", "FlowBot analytics could not be loaded", "Downgrade compatibility could not be checked"]) {
    if (!await page.getByText(message, { exact: true }).count()) failures.push(`flowbot-secondary-failures: missing ${message}`);
  }
  if (await page.getByText("No recipients", { exact: true }).count()) failures.push("flowbot-secondary-failures: unavailable recipients presented as empty");
  if (await page.getByRole("button", { name: "Save routing team" }).isEnabled()) failures.push("flowbot-secondary-failures: routing could be saved without team evidence");
} });
const analystFlowRequests = new Set();
await visit({ name: "flowbot-analyst-secondary-permissions", url: `${tenantUrl}/workspace/flowbot`, mock: (page) => mockTenantRole(page, "tenant_analyst", analystFlowRequests, undefined, undefined, true), ready: ".flowbot-tabs", check: async () => {
  for (const path of ["/tenant/team", "/tenant/flowbot/downgrade-preflight"]) if (analystFlowRequests.has(path)) failures.push(`flowbot-analyst-secondary-permissions: unauthorized request initiated at ${path}`);
} });
const aiChatSecondaryFailures = new Set(["/tenant/knowledge", "/tenant/ai-chat/notifications", "/tenant/ai-chat/analytics", "/tenant/ai-chat/social-connections"]);
await visit({ name: "ai-chat-secondary-failures", url: `${tenantUrl}/workspace/ai-chat`, mock: (page) => mockTenantRole(page, "tenant_master_admin", undefined, aiChatSecondaryFailures, undefined, true), ready: ".ai-authoring-grid", check: async (page) => {
  for (const message of ["Knowledge options could not be loaded", "Notification recipients could not be loaded", "AI Chat analytics could not be loaded", "Social connections could not be loaded"]) {
    if (!await page.getByText(message, { exact: true }).count()) failures.push(`ai-chat-secondary-failures: missing ${message}`);
  }
  for (const emptyState of ["No LINE connection", "No WhatsApp connection", "No Messenger connection"]) if (await page.getByText(emptyState, { exact: true }).count()) failures.push(`ai-chat-secondary-failures: unavailable social data presented as ${emptyState}`);
  if (await page.getByRole("button", { name: "Add recipient" }).isEnabled()) failures.push("ai-chat-secondary-failures: recipient creation enabled without current recipient evidence");
} });

const failureMatrix = [
  ["", "/tenant/onboarding", ".workspace-load-error"],
  ["contacts", "/tenant/contacts", ".workspace-load-error"],
  ["leads", "/tenant/leads", ".workspace-load-error"],
  ["inbox", "/tenant/conversations", ".workspace-load-error"],
  ["knowledge", "/tenant/knowledge", ".workspace-load-error"],
  ["data", "/tenant/privacy-jobs", ".workspace-load-error"],
  ["team", "/tenant/team", ".workspace-load-error"],
  ["security", "/tenant/security/sessions", ".workspace-load-error"],
  ["flowbot", "/tenant/flowbot/bots", ".workspace-load-error"],
  ["ai-chat", "/tenant/ai-chat/agents", ".workspace-load-error"],
  ["voice", "/tenant/voice/deployments", ".workspace-load-error"],
  ["usage", "/tenant/usage", ".usage-state-error"],
];
for (const [route, failedPath, selector] of failureMatrix) {
  const name = route || "overview";
  await visit({ name: `${name}-dependency-failure`, url: `${tenantUrl}/workspace${route ? `/${route}` : ""}`, mock: (page) => mockTenantRole(page, "tenant_master_admin", undefined, new Set([failedPath])), ready: selector, check: async (page) => {
    if (!await page.getByRole("button", { name: "Try again" }).count()) failures.push(`${name}-dependency-failure: retry action missing`);
  } });
}
await visit({ name: "overview-subscription-failure", url: `${tenantUrl}/workspace`, mock: (page) => mockTenantRole(page, "tenant_master_admin", undefined, new Set(["/tenant/subscriptions"])), ready: ".workspace-load-error", check: async (page) => {
  if (!await page.getByRole("button", { name: "Try again" }).count()) failures.push("overview-subscription-failure: retry action missing");
} });
await visit({ name: "workspace-session-failure", url: `${tenantUrl}/workspace/contacts`, mock: (page) => mockTenantRole(page, "tenant_master_admin", undefined, new Set(["/tenant/session"])), ready: ".workspace-session-error", check: async (page) => {
  if (!await page.getByRole("heading", { name: "We couldn’t load your workspace" }).count()) failures.push("workspace-session-failure: safe explanation missing");
} });

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

const platformFailedResources = new Set(["/platform/health-summary", "/platform/commerce-overview", "/platform/subscriptions", "/platform/tenants", "/platform/support-grants", "/platform/voice/runtime-control", "/platform/voice/routing", "/platform/voice/incidents"]);
await visit({ name: "platform-resource-failure", url: platformUrl, mock: (page) => mockPlatformRole(page, "platform_owner", platformFailedResources), ready: ".platform-resource-status.error", check: async (page) => {
  const alert = await page.locator(".platform-resource-status.error").innerText();
  for (const label of ["Platform health", "Commerce overview", "Product subscriptions", "Tenant directory", "Support access grants", "Voice runtime controls", "Advanced Voice routing", "Voice incidents"]) if (!alert.includes(label)) failures.push(`platform-resource-failure: ${label} was not disclosed`);
  if (await page.getByText("No product subscriptions", { exact: true }).count()) failures.push("platform-resource-failure: failed subscriptions were presented as empty");
  if (await page.getByText("No support access grants", { exact: true }).count()) failures.push("platform-resource-failure: failed support grants were presented as empty");
} });
await visit({ name: "platform-session-failure", url: platformUrl, mock: (page) => mockPlatformRole(page, "platform_owner", new Set(["/platform/me"])), ready: ".platform-session-error", check: async (page) => {
  if (!await page.getByRole("button", { name: "Try again" }).count()) failures.push("platform-session-failure: retry action missing");
} });
await visit({ name: "platform-mutation-network-failure", url: platformUrl, mock: (page) => mockPlatformRole(page, "platform_owner", undefined, new Set(["/platform/voice/runtime-control"])), ready: "#voice-operations", check: async (page) => {
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Resume admission" }).click();
  await page.getByText("Voice runtime control could not be changed.", { exact: true }).waitFor();
  if (!await page.getByRole("button", { name: "Resume admission" }).isEnabled()) failures.push("platform-mutation-network-failure: control remained busy");
} });
await visit({ name: "platform-login", url: platformUrl, mock: (page) => page.route("**/platform/me", (route) => json(route, { status: "unauthenticated" }, 401)), ready: "#platform-login-title" });
await browser.close();

if (brandColors.size !== 1 || !brandColors.has("rgb(242, 193, 78)")) failures.push(`brand mark palette inconsistent: ${[...brandColors].join(", ")}`);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.info("Shared brand, WCAG 2.2 AA automation, responsive overflow, keyboard focus, safe cross-app links, authentication shells, role navigation, dependency failures, and mutation transport recovery passed.");
