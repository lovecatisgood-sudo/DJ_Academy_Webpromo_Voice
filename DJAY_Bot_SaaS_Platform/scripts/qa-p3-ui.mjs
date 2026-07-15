import { chromium } from "playwright";

const tenantUrl = process.env.TENANT_QA_URL || "http://127.0.0.1:3111";
const platformUrl = process.env.PLATFORM_QA_URL || "http://127.0.0.1:3112";
const browser = await chromium.launch({ headless: true });
const failures = [];
const restricted = /\b(openai|anthropic|claude|gemini|gpt-[0-9]|provider[_ -]?key|model[_ -]?id)\b/i;

const workspace = { tenantId: "20000000-0000-4000-8000-000000000001", slug: "browser-workspace", businessName: "Bangkok Service Studio", role: "tenant_master_admin" };
const contact = { id: "50000000-0000-4000-8000-000000000001", displayName: "Narin Customer", locale: "th", consentStatus: "granted", identities: [{ kind: "email", value: "narin@example.test", verificationStatus: "verified" }], leadCount: 1, updatedAt: new Date().toISOString() };
const lead = { id: "60000000-0000-4000-8000-000000000001", contactId: contact.id, contactName: contact.displayName, title: "Premium service enquiry", source: "AI Chatbot", status: "pending_follow_up", updatedAt: new Date().toISOString() };
const conversation = { id: "70000000-0000-4000-8000-000000000001", contactId: contact.id, contactName: contact.displayName, leadId: lead.id, productKey: "ai_chat", publicPlanKey: "ai_chat_premium", channelKind: "web", automationMode: "human", status: "open", assignedMembershipId: null, lastMessage: "Could we confirm tomorrow afternoon?", lastMessageAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
const messages = [
  { id: "71000000-0000-4000-8000-000000000001", sequence: 1, actorType: "customer", direction: "inbound", text: "I would like details about your premium service.", createdAt: new Date(Date.now() - 60_000).toISOString() },
  { id: "71000000-0000-4000-8000-000000000002", sequence: 2, actorType: "human", direction: "outbound", text: "Certainly. Could we confirm tomorrow afternoon?", createdAt: new Date().toISOString() },
];

function json(route, value, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
}

async function mockTenant(page) {
  await page.route("**/tenant/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/tenant/session") return json(route, { user: { id: "user", displayName: "Browser Owner" }, workspaces: [workspace], selectedTenantId: workspace.tenantId, mfaVerifiedAt: new Date().toISOString() });
    if (path === "/tenant/support-access") return json(route, { grants: [{ id: "grant", reason: "Investigating a merchant-reported message delivery issue.", startsAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3_600_000).toISOString() }] });
    if (path === "/tenant/contacts") return json(route, route.request().method() === "GET" ? { contacts: [contact] } : { status: "created", contactId: crypto.randomUUID() }, route.request().method() === "GET" ? 200 : 201);
    if (path === "/tenant/leads") return json(route, route.request().method() === "GET" ? { leads: [lead] } : { status: "created", leadId: crypto.randomUUID() }, route.request().method() === "GET" ? 200 : 201);
    if (path === "/tenant/conversations") return json(route, { conversations: [conversation] });
    if (path.endsWith("/messages")) return json(route, route.request().method() === "GET" ? { messages } : { status: "created", messageId: crypto.randomUUID(), sequence: 3 }, route.request().method() === "GET" ? 200 : 201);
    if (path === "/tenant/knowledge") return json(route, route.request().method() === "GET" ? { sources: [{ id: "80000000-0000-4000-8000-000000000001", name: "Approved service guide", sourceKind: "text", status: "active", version: 2, revisionCreatedAt: new Date().toISOString() }] } : { status: "created" }, route.request().method() === "GET" ? 200 : 201);
    if (path === "/tenant/privacy-jobs") return json(route, route.request().method() === "GET" ? { jobs: [{ id: "90000000-0000-4000-8000-000000000001", contactId: contact.id, contactName: contact.displayName, jobType: "export", status: "completed", requestedAt: new Date().toISOString(), completedAt: new Date().toISOString() }] } : { status: "accepted" }, route.request().method() === "GET" ? 200 : 202);
    return json(route, { status: "not_found" }, 404);
  });
}

async function mockPlatform(page) {
  await page.route("**/platform/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/platform/me") return json(route, { user: { id: "platform-owner", displayName: "Platform Owner", role: "platform_owner", mfaVerifiedAt: new Date().toISOString() } });
    if (path === "/platform/health-summary") return json(route, { health: { platformUsers: 3, activeSessions: 2 } });
    if (path === "/platform/commerce-overview") return json(route, { commerce: { tenants: 18, subscriptions: 31, pending: 2, active: 29 } });
    if (path === "/platform/subscriptions") return json(route, { subscriptions: [{ id: "sub", tenantId: workspace.tenantId, businessName: workspace.businessName, productKey: "ai_chat", planKey: "ai_chat_premium", publicName: "AI Chatbot Premium", status: "active", createdAt: new Date().toISOString() }] });
    if (path === "/platform/tenants") return json(route, { tenants: [{ id: workspace.tenantId, businessName: workspace.businessName, slug: workspace.slug, status: "active" }] });
    if (path === "/platform/support-grants") return json(route, { grants: [{ id: "grant", tenantId: workspace.tenantId, businessName: workspace.businessName, requestedByPlatformUserId: "support-user", approvedByPlatformUserId: "platform-owner", reason: "Investigating a merchant-reported message delivery issue.", status: "active", startsAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3_600_000).toISOString() }] });
    if (path === "/platform/voice/runtime-control") return json(route, { control: { mode: "paused", reasonCode: "scheduled_maintenance", version: 4, changedAt: new Date().toISOString(), activeSessions: 2, reconnectingSessions: 1, expiredGrants: 0, staleConnections: 0 } });
    return json(route, { status: "ok" });
  });
}

async function inspect(url, name, viewport, mock) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on("pageerror", (error) => failures.push(`${name}: page error: ${error.message}`));
  page.on("console", (entry) => { if (entry.type() === "error") failures.push(`${name}: console error: ${entry.text()}`); });
  await mock(page);
  const response = await page.goto(url, { waitUntil: "networkidle" });
  if (!response?.ok()) failures.push(`${name}: navigation returned ${response?.status()}`);
  await page.locator("h1").first().waitFor();
  const result = await page.evaluate(() => ({
    title: document.querySelector("h1")?.textContent?.trim(),
    bodyText: document.body.innerText,
    viewportWidth: window.innerWidth,
    bodyWidth: document.documentElement.scrollWidth,
  }));
  if (result.bodyWidth > result.viewportWidth + 1) failures.push(`${name}: horizontal overflow ${result.bodyWidth}/${result.viewportWidth}`);
  if (restricted.test(result.bodyText)) failures.push(`${name}: restricted provider/model term visible`);
  if (name.startsWith("platform-") && !result.bodyText.includes("Runtime admission and recovery")) failures.push(`${name}: Voice operations control missing`);
  await page.screenshot({ path: `/tmp/djay-p3-${name}.png`, fullPage: true });
  await context.close();
  return result.title;
}

const desktop = { width: 1365, height: 900 };
const mobile = { width: 390, height: 844 };
const pages = ["inbox", "contacts", "leads", "knowledge", "data"];
for (const pageName of pages) {
  await inspect(`${tenantUrl}/workspace/${pageName}`, `${pageName}-desktop`, desktop, mockTenant);
  await inspect(`${tenantUrl}/workspace/${pageName}`, `${pageName}-mobile`, mobile, mockTenant);
}
await inspect(platformUrl, "platform-desktop", desktop, mockPlatform);
await inspect(platformUrl, "platform-mobile", mobile, mockPlatform);
await browser.close();

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.info("P3 tenant operations and platform support UI passed desktop/mobile overflow, console, and boundary checks.");
