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
const legalDocuments = {
  terms: {
    version: "terms-qa-2026-07", title: "Service Terms", effectiveDate: "2026-07-20",
    summary: "Approved service terms used by the production-browser acceptance fixture.",
    sections: [{ heading: "Using the service", paragraphs: ["Use the service according to the approved customer agreement."] }],
  },
  privacy: {
    version: "privacy-qa-2026-07", title: "Privacy Notice", effectiveDate: "2026-07-20",
    summary: "Approved privacy notice used by the production-browser acceptance fixture.",
    sections: [{ heading: "Information handling", paragraphs: ["Information is handled according to the approved privacy notice."] }],
  },
};

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

async function auditFieldBoundary(page, label, expected, name) {
  const field = page.getByLabel(label, { exact: true });
  for (const [attribute, value] of Object.entries(expected)) {
    if (await field.getAttribute(attribute) !== String(value)) {
      failures.push(`${name}: ${label} is missing ${attribute}=${value}`);
    }
  }
}

function auditSecurityHeaders(response, name, url) {
  const headers = response.headers();
  const csp = headers["content-security-policy"] || "";
  for (const directive of ["default-src 'self'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'", "object-src 'none'"]) {
    if (!csp.includes(directive)) failures.push(`${name}: Content-Security-Policy is missing ${directive}`);
  }
  const path = new URL(url).pathname;
  const oneTimeAccountRoute = (url.startsWith(publicUrl) && ["/verify-email", "/invitations/accept"].includes(path))
    || (url.startsWith(tenantUrl) && ["/recovery/complete", "/ownership/accept", "/invitations/accept"].includes(path));
  const expected = {
    "cross-origin-opener-policy": "same-origin",
    "origin-agent-cluster": "?1",
    "referrer-policy": oneTimeAccountRoute ? "no-referrer" : "strict-origin-when-cross-origin",
    "strict-transport-security": "max-age=63072000; includeSubDomains; preload",
    "x-content-type-options": "nosniff",
    "x-dns-prefetch-control": "off",
    "x-frame-options": "DENY",
    "x-permitted-cross-domain-policies": "none",
  };
  for (const [key, value] of Object.entries(expected)) {
    if (headers[key] !== value) failures.push(`${name}: invalid ${key} header (${headers[key] || "missing"})`);
  }
  const microphone = url.startsWith(tenantUrl) ? "microphone=(self)" : "microphone=()";
  const permissions = headers["permissions-policy"] || "";
  for (const policy of ["camera=()", "geolocation=()", microphone, "payment=()", "usb=()"]) {
    if (!permissions.includes(policy)) failures.push(`${name}: Permissions-Policy is missing ${policy}`);
  }
  if (headers["x-powered-by"]) failures.push(`${name}: framework identity header is exposed`);
}

async function visit({ name, url, viewport = desktop, mock, ready = "h1", expectedStatus = 200, check }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on("pageerror", (error) => failures.push(`${name}: page error: ${error.message}`));
  page.on("console", (entry) => {
    if (entry.type() === "error" && !entry.text().startsWith("Failed to load resource:")) failures.push(`${name}: console error: ${entry.text()}`);
  });
  page.on("response", (entry) => {
    const resourceType = entry.request().resourceType();
    const expectedDocument = resourceType === "document" && entry.request().isNavigationRequest() && entry.status() === expectedStatus;
    if (entry.status() >= 400 && !expectedDocument && ["document", "script", "stylesheet", "image", "font"].includes(resourceType)) failures.push(`${name}: ${resourceType} returned ${entry.status()} at ${entry.url()}`);
  });
  if (mock) await mock(page);
  const response = await page.goto(url, { waitUntil: "networkidle" });
  if (response?.status() !== expectedStatus) failures.push(`${name}: navigation returned ${response?.status()} instead of ${expectedStatus}`);
  else auditSecurityHeaders(response, name, url);
  await page.locator(ready).first().waitFor();
  const geometry = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
  if (geometry.document > geometry.viewport + 1) failures.push(`${name}: horizontal overflow ${geometry.document}px > ${geometry.viewport}px`);
  const mark = page.locator(".brand-mark, .mark, .api-mark, .recovery-mark").first();
  if (await mark.count()) brandColors.add(await mark.evaluate((element) => getComputedStyle(element).backgroundColor));
  await check?.(page);
  await auditAccessibility(page, name);
  await context.close();
}

async function mockPublic(page, failedPaths, abortedMutationPaths, changedLegalPaths, requestCounts, invitationStatus = "accepted", requestBodies) {
  await page.route("**/public/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== "GET") {
      requestCounts?.set(path, (requestCounts.get(path) || 0) + 1);
      try { requestBodies?.set(path, route.request().postDataJSON()); } catch { /* body evidence is optional */ }
    }
    if (abortedMutationPaths?.has(path) && route.request().method() !== "GET") return route.abort("connectionfailed");
    if (changedLegalPaths?.has(path) && route.request().method() !== "GET") return json(route, {
      accepted: false,
      status: "legal_version_changed",
      message: "The service terms or privacy notice changed. Review the current documents and accept them again.",
    }, 409);
    if (failedPaths?.has(path)) return json(route, { status: "temporarily_unavailable" }, 503);
    if (path === "/public/catalog") return json(route, { plans: [
      { planKey: "flowbot_basic", productKey: "flowbot", publicName: "FlowBot Basic", tierName: "Basic", summary: "Guided automation", sellable: true, publicHighlights: ["Visual conversation flows"] },
      { planKey: "ai_chat_premium", productKey: "ai_chat", publicName: "AI Chatbot Premium", tierName: "Premium", summary: "AI sales assistance", sellable: true, publicHighlights: ["Knowledge-grounded responses"] },
    ] });
    if (path === "/public/legal") return json(route, {
      status: "available",
      terms: { version: legalDocuments.terms.version, title: legalDocuments.terms.title, effectiveDate: legalDocuments.terms.effectiveDate },
      privacy: { version: legalDocuments.privacy.version, title: legalDocuments.privacy.title, effectiveDate: legalDocuments.privacy.effectiveDate },
    });
    if (path === "/public/legal/terms") return json(route, { status: "available", document: legalDocuments.terms });
    if (path === "/public/legal/privacy") return json(route, { status: "available", document: legalDocuments.privacy });
    if (path === "/public/status") return json(route, { status: { asOf: new Date().toISOString(), overall: "operational", services: [] } });
    if (path === "/public/auth/register") return json(route, { accepted: true, message: "Check your email to continue. If an account already exists, use sign in or recovery." }, 202);
    if (path === "/public/auth/verify-email") return json(route, { status: "verified" });
    if (path === "/public/auth/resend-verification") return json(route, { accepted: true }, 202);
    if (path === "/public/auth/recovery/complete") return json(route, { status: "completed" });
    if (path === "/public/invitations/accept") return json(route, { status: invitationStatus }, invitationStatus === "sign_in_required" ? 401 : 200);
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
    if (path === "/tenant/onboarding") return json(route, { onboarding: {
      tenant_id: tenantId, business_name: "Bangkok Service Studio", slug: "qa-workspace",
      locale: "en", timezone: "Asia/Bangkok", stage: "ready",
      readiness: {
        businessProfile: true, productSelected: true, activeAccess: true,
        selectedProducts: ["ai_chat"], configuredProducts: ["ai_chat"],
        testedProducts: ["ai_chat"], launchReadyProducts: ["ai_chat"],
      },
    } });
    if (path === "/tenant/subscriptions") return json(route, { subscriptions: [{ id: "subscription", productKey: "ai_chat", planKey: "ai_chat_premium", publicName: "AI Chatbot Premium", tierName: "Premium", status: "active", accessMode: "active", snapshotId: "snapshot", periodStart: new Date().toISOString(), periodEnd: new Date(Date.now() + 30 * 86400_000).toISOString() }] });
    if (path === "/tenant/support-access") return json(route, { grants: [] });
    if (path === "/tenant/contacts") return json(route, { contacts: [], identityReviewCandidates: [] });
    if (path === "/tenant/leads") return json(route, { leads: [] });
    if (path === "/tenant/knowledge") return json(route, { sources: [] });
    if (path === "/tenant/conversations") return json(route, { conversations: [{ id: "conversation", contactName: "QA customer", productKey: "ai_chat", channelKind: "web", automationMode: "human", status: "open", lastMessage: "Could you help?", lastMessageAt: new Date().toISOString(), voiceStatus: null, voiceTerminalReason: null, voiceMinutes: null, voiceDurationSeconds: null, voiceOutcome: null, voiceSummary: null, callbackStatus: null, callbackDueAt: null }] });
    if (path === "/tenant/conversations/conversation/messages") return json(route, { messages: [] });
    if (path === "/tenant/team") return json(route, { team: { members: [], invitations: [], transfers: [] } });
    if (path === "/tenant/security/sessions") return json(route, { sessions: [] });
    if (/^\/tenant\/ownership-transfers\/[^/]+\/accept$/.test(path)) return json(route, { status: "accepted" });
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

async function mockTenantLogin(page, loginStatus = "authenticated") {
  await page.route("**/public/auth/login", (route) => json(route, loginStatus === "mfa_required"
    ? { status: "mfa_required" }
    : { status: "authenticated", selectedTenantId: tenantId, workspaces: [] }));
  await page.route("**/public/auth/mfa/challenge", (route) => json(route, {
    status: "authenticated", selectedTenantId: tenantId, workspaces: [],
  }));
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
    if (await page.getByRole("link", { name: "Service Terms" }).getAttribute("href") !== "/terms") failures.push(`public-registration-${name}: terms link missing`);
    if (await page.getByRole("link", { name: "Privacy Notice" }).getAttribute("href") !== "/privacy") failures.push(`public-registration-${name}: privacy link missing`);
    if (!await page.getByText("Versions terms-qa-2026-07 and privacy-qa-2026-07", { exact: false }).count()) failures.push(`public-registration-${name}: accepted legal versions are not visible`);
    await auditFieldBoundary(page, "Your name", { minlength: 2, maxlength: 160 }, `public-registration-${name}`);
    await auditFieldBoundary(page, "Work email", { maxlength: 320 }, `public-registration-${name}`);
    await auditFieldBoundary(page, "Business name", { minlength: 2, maxlength: 200 }, `public-registration-${name}`);
    await page.keyboard.press("Tab");
    const focusOutline = await page.locator(":focus").evaluate((element) => getComputedStyle(element).outlineStyle).catch(() => "none");
    if (focusOutline === "none") failures.push(`public-registration-${name}: keyboard focus is not visible`);
  } });
  for (const kind of ["terms", "privacy"]) {
    await visit({ name: `public-${kind}-${name}`, url: `${publicUrl}/${kind}`, viewport, mock: mockPublic, ready: "#legal-title", check: async (page) => {
      const document = legalDocuments[kind];
      await page.getByText("Version " + document.version, { exact: true }).waitFor();
      if (!await page.getByRole("heading", { name: document.sections[0].heading }).count()) failures.push(`public-${kind}-${name}: approved sections missing`);
      await page.screenshot({ path: `/tmp/djay-public-${kind}-${name}.png`, fullPage: true });
    } });
  }
  await visit({ name: `tenant-login-${name}`, url: tenantUrl, viewport, ready: "#tenant-login-title", check: async (page) => {
    const href = await page.getByRole("link", { name: "Create workspace" }).getAttribute("href");
    if (href !== "https://djaybot.com") failures.push(`tenant-login-${name}: unsafe public registration URL ${href}`);
    await auditFieldBoundary(page, "Email", { maxlength: 320 }, `tenant-login-${name}`);
  } });
  await visit({ name: `api-root-${name}`, url: apiUrl, viewport, ready: "#api-title", check: async (page) => {
    if (await page.getByRole("link", { name: "Go to DJAY Bot" }).getAttribute("href") !== "https://djaybot.com") failures.push(`api-root-${name}: unsafe public site URL`);
  } });
  for (const [realm, origin, heading, recoveryLink] of [
    ["public", publicUrl, "This page is not here.", "Create or view an account"],
    ["tenant", tenantUrl, "This workspace page does not exist.", "Return to workspace"],
    ["platform", platformUrl, "This Platform page does not exist.", "Return to Platform Master"],
    ["api", apiUrl, "This API page does not exist.", "Return to API information"],
  ]) {
    await visit({ name: `${realm}-not-found-${name}`, url: `${origin}/qa-route-that-does-not-exist`, viewport, expectedStatus: 404, ready: "#not-found-title", check: async (page) => {
      if (!await page.getByRole("heading", { name: heading }).count()) failures.push(`${realm}-not-found-${name}: safe heading missing`);
      const link = page.getByRole("link", { name: recoveryLink });
      if (!await link.count()) failures.push(`${realm}-not-found-${name}: recovery link missing`);
      else {
        await link.focus();
        if (await link.evaluate((element) => getComputedStyle(element).outlineStyle) === "none") failures.push(`${realm}-not-found-${name}: recovery focus is not visible`);
      }
    } });
  }
}

await visit({ name: "tenant-login-malicious-continuation", url: `${tenantUrl}/?next=%2F%5C%5Cevil.test`, mock: async (page) => {
  await mockTenantRole(page, "tenant_master_admin");
  await mockTenantLogin(page);
}, ready: "#tenant-login-title", check: async (page) => {
  await page.getByLabel("Email").fill("owner@example.test");
  await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery-staple");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`${tenantUrl}/workspace`);
  if (new URL(page.url()).origin !== tenantUrl) failures.push("tenant-login-malicious-continuation: navigation escaped the Tenant origin");
} });
const ownershipContinuation = "/ownership/accept#transferId=transfer&token=qa-token";
await visit({ name: "tenant-login-valid-continuation", url: `${tenantUrl}/?next=${encodeURIComponent(ownershipContinuation)}`, mock: async (page) => {
  await mockTenantRole(page, "tenant_master_admin");
  await mockTenantLogin(page);
}, ready: "#tenant-login-title", check: async (page) => {
  await page.getByLabel("Email").fill("owner@example.test");
  await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery-staple");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`${tenantUrl}/ownership/accept`);
  await page.getByRole("heading", { name: "Confirm ownership transfer" }).waitFor();
  if (await page.evaluate(() => sessionStorage.getItem("djay.ownership.token")) !== "qa-token") failures.push("tenant-login-valid-continuation: secure token state was not retained");
} });
await visit({ name: "tenant-mfa-malicious-continuation", url: `${tenantUrl}/?next=%2F%5C%5Cevil.test`, mock: async (page) => {
  await mockTenantRole(page, "tenant_master_admin");
  await mockTenantLogin(page, "mfa_required");
}, ready: "#tenant-login-title", check: async (page) => {
  await page.getByLabel("Email").fill("owner@example.test");
  await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery-staple");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByLabel("Authenticator code").fill("123456");
  await page.getByRole("button", { name: "Verify" }).click();
  await page.waitForURL(`${tenantUrl}/workspace`);
  if (new URL(page.url()).origin !== tenantUrl) failures.push("tenant-mfa-malicious-continuation: navigation escaped the Tenant origin");
} });

await visit({ name: "public-status", url: `${publicUrl}/status`, mock: mockPublic, ready: "#status-title", check: async (page) => {
  await page.getByText("All systems operational").waitFor();
} });
await visit({ name: "public-catalog-failure", url: publicUrl, mock: (page) => mockPublic(page, new Set(["/public/catalog"])), ready: ".plan-load-state.error", check: async (page) => {
  if (!await page.getByRole("button", { name: "Try again" }).count()) failures.push("public-catalog-failure: retry action missing");
  if (!await page.getByRole("button", { name: "Create workspace" }).isEnabled()) failures.push("public-catalog-failure: owner registration was unnecessarily blocked");
} });
await visit({ name: "public-legal-failure", url: publicUrl, mock: (page) => mockPublic(page, new Set(["/public/legal"])), ready: ".legal-load-state.error", check: async (page) => {
  if (!await page.getByText("Registration is paused", { exact: false }).count()) failures.push("public-legal-failure: fail-closed explanation missing");
  if (await page.getByRole("button", { name: "Create workspace" }).isEnabled()) failures.push("public-legal-failure: registration remained enabled without approved documents");
  if (!await page.getByRole("button", { name: "Try again" }).count()) failures.push("public-legal-failure: retry action missing");
} });
await visit({ name: "public-terms-failure", url: `${publicUrl}/terms`, mock: (page) => mockPublic(page, new Set(["/public/legal/terms"])), ready: ".legal-state.error", check: async (page) => {
  if (!await page.getByText("Registration remains paused", { exact: false }).count()) failures.push("public-terms-failure: safe unavailable state missing");
} });
await visit({ name: "public-mutation-network-failure", url: publicUrl, mock: (page) => mockPublic(page, undefined, new Set(["/public/auth/register"])), ready: "#register-title", check: async (page) => {
  await page.getByLabel("Your name").fill("QA Owner");
  await page.getByLabel("Work email").fill("owner@example.test");
  await page.getByLabel("Business name").fill("QA Studio");
  await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery-staple");
  await page.getByLabel("Confirm password", { exact: true }).fill("correct-horse-battery-staple");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create workspace" }).click();
  await page.getByText("Registration could not be completed.", { exact: true }).waitFor();
  if (!await page.getByRole("button", { name: "Create workspace" }).isEnabled()) failures.push("public-mutation-network-failure: submit remained busy");
} });
const registrationIdentityRequests = new Map();
await visit({ name: "public-registration-identity-boundary", url: publicUrl, mock: (page) => mockPublic(page, undefined, undefined, undefined, registrationIdentityRequests), ready: "#register-title", check: async (page) => {
  await page.getByLabel("Your name").fill("  ");
  await page.getByLabel("Work email").fill("preserved@example.test");
  await page.getByLabel("Business name").fill("Preserved Studio");
  await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery-staple");
  await page.getByLabel("Confirm password", { exact: true }).fill("correct-horse-battery-staple");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create workspace" }).click();
  await page.getByText("Name must be 2–160 characters after removing leading and trailing spaces.", { exact: true }).waitFor();
  if (registrationIdentityRequests.has("/public/auth/register")) failures.push("public-registration-identity-boundary: whitespace-only name reached the API");
  await page.getByLabel("Your name").fill("Preserved Owner");
  await page.getByLabel("Business name").fill("  ");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await page.getByText("Business name must be 2–200 characters after removing leading and trailing spaces.", { exact: true }).waitFor();
  if (registrationIdentityRequests.has("/public/auth/register")) failures.push("public-registration-identity-boundary: whitespace-only business name reached the API");
  if (await page.getByLabel("Work email").inputValue() !== "preserved@example.test") failures.push("public-registration-identity-boundary: correctable fields were erased");
} });
const registrationMismatchRequests = new Map();
await visit({ name: "public-registration-password-mismatch", url: publicUrl, mock: (page) => mockPublic(page, undefined, undefined, undefined, registrationMismatchRequests), ready: "#register-title", check: async (page) => {
  await page.getByLabel("Your name").fill("Preserved Owner");
  await page.getByLabel("Work email").fill("preserved@example.test");
  await page.getByLabel("Business name").fill("Preserved Studio");
  await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery-staple");
  await page.getByLabel("Confirm password", { exact: true }).fill("different-horse-battery-staple");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create workspace" }).click();
  await page.getByText("Passwords do not match. Enter the same password in both fields.", { exact: true }).waitFor();
  if (registrationMismatchRequests.has("/public/auth/register")) failures.push("public-registration-password-mismatch: mismatched password reached the API");
  if (await page.getByLabel("Your name").inputValue() !== "Preserved Owner") failures.push("public-registration-password-mismatch: account fields were erased");
  if (!await page.getByRole("button", { name: "Create workspace" }).isEnabled()) failures.push("public-registration-password-mismatch: correction remained disabled");
} });
await visit({ name: "public-legal-version-change", url: publicUrl, mock: (page) => mockPublic(page, undefined, undefined, new Set(["/public/auth/register"])), ready: "#register-title", check: async (page) => {
  await page.getByLabel("Your name").fill("Preserved Owner");
  await page.getByLabel("Work email").fill("preserved@example.test");
  await page.getByLabel("Business name").fill("Preserved Studio");
  await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery-staple");
  await page.getByLabel("Confirm password", { exact: true }).fill("correct-horse-battery-staple");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create workspace" }).click();
  await page.getByText("The service terms or privacy notice changed.", { exact: false }).waitFor();
  if (await page.getByRole("checkbox").isChecked()) failures.push("public-legal-version-change: stale acceptance remained checked");
  if (await page.getByLabel("Your name").inputValue() !== "Preserved Owner") failures.push("public-legal-version-change: account fields were erased");
} });
const registrationRequests = new Map();
const registrationBodies = new Map();
await visit({ name: "public-registration-complete", url: publicUrl, mock: (page) => mockPublic(page, undefined, undefined, undefined, registrationRequests, "accepted", registrationBodies), ready: "#register-title", check: async (page) => {
  await page.getByLabel("Your name").fill("  Completed Owner  ");
  await page.getByLabel("Work email").fill("completed@example.test");
  await page.getByLabel("Business name").fill("  Completed Studio  ");
  await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery-staple");
  await page.getByLabel("Confirm password", { exact: true }).fill("correct-horse-battery-staple");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create workspace" }).click();
  await page.getByRole("heading", { name: "Check your email" }).waitFor();
  if (await page.getByRole("button", { name: "Create workspace" }).count()) failures.push("public-registration-complete: live registration form remained after acceptance");
  if (await page.getByLabel("Work email").inputValue() !== "completed@example.test") failures.push("public-registration-complete: resend email was not preserved");
  await page.getByRole("button", { name: "Send new link" }).click();
  await page.getByText("If a pending account matches that email, a new verification link has been sent.", { exact: true }).waitFor();
  if (registrationRequests.get("/public/auth/register") !== 1 || registrationRequests.get("/public/auth/resend-verification") !== 1) failures.push("public-registration-complete: registration or resend mutation was duplicated");
  const registrationBody = registrationBodies.get("/public/auth/register");
  if (registrationBody?.name !== "Completed Owner" || registrationBody?.businessName !== "Completed Studio") failures.push("public-registration-complete: normalized identity values were not trimmed before transport");
  await page.screenshot({ path: "/tmp/djay-registration-complete-desktop.png", fullPage: true });
} });
await visit({ name: "public-registration-complete-mobile", url: publicUrl, viewport: mobile, mock: mockPublic, ready: "#register-title", check: async (page) => {
  await page.getByLabel("Your name").fill("Mobile Owner");
  await page.getByLabel("Work email").fill("mobile@example.test");
  await page.getByLabel("Business name").fill("Mobile Studio");
  await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery-staple");
  await page.getByLabel("Confirm password", { exact: true }).fill("correct-horse-battery-staple");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create workspace" }).click();
  await page.getByRole("heading", { name: "Check your email" }).waitFor();
  await page.screenshot({ path: "/tmp/djay-registration-complete-mobile.png", fullPage: true });
} });
await visit({ name: "public-verification", url: `${publicUrl}/verify-email#token=qa-token`, mock: mockPublic, ready: "#verification-title", check: async (page) => {
  const link = page.getByRole("link", { name: "Continue to sign in" });
  await page.getByRole("button", { name: "Confirm email" }).click();
  await link.waitFor({ timeout: 5_000 }).catch(() => undefined);
  if (!await link.isVisible()) failures.push(`public-verification: verified continuation missing (${(await page.locator(".form-message").textContent().catch(() => "no status"))?.trim()})`);
  else if (await link.getAttribute("href") !== "https://app.djaybot.com") failures.push("public-verification: unsafe tenant sign-in URL");
  if (page.url() !== `${publicUrl}/verify-email`) failures.push("public-verification: token remained in browser history after verification");
  if (await page.evaluate(() => sessionStorage.getItem("djay.verification.token")) !== null) failures.push("public-verification: terminal token state was not cleared");
} });
await visit({ name: "public-verification-missing-token", url: `${publicUrl}/verify-email`, mock: mockPublic, ready: "#verification-title", check: async (page) => {
  if (await page.getByRole("button", { name: "Confirm email" }).count()) failures.push("public-verification-missing-token: dead confirmation control remained visible");
  await auditFieldBoundary(page, "Work email", { maxlength: 320 }, "public-verification-missing-token");
  await page.getByLabel("Work email").fill("owner@example.test");
  await page.getByRole("button", { name: "Send new link" }).click();
  await page.getByText("If a pending account matches that email, a new verification link has been sent.", { exact: true }).waitFor();
  if (!await page.getByText("whether or not an account exists", { exact: false }).count()) failures.push("public-verification-missing-token: anti-enumeration explanation missing");
  await page.screenshot({ path: "/tmp/djay-verification-recovery-desktop.png", fullPage: true });
} });
await visit({ name: "public-verification-missing-token-mobile", url: `${publicUrl}/verify-email`, viewport: mobile, mock: mockPublic, ready: "#verification-title", check: async (page) => {
  if (await page.getByRole("button", { name: "Confirm email" }).count()) failures.push("public-verification-missing-token-mobile: dead confirmation control remained visible");
  await page.getByLabel("Work email").fill("mobile@example.test");
  await page.getByRole("button", { name: "Send new link" }).click();
  await page.getByText("If a pending account matches that email, a new verification link has been sent.", { exact: true }).waitFor();
  await page.screenshot({ path: "/tmp/djay-verification-recovery-mobile.png", fullPage: true });
} });
await visit({ name: "public-verification-network-failure", url: `${publicUrl}/verify-email#token=qa-token`, mock: (page) => mockPublic(page, undefined, new Set(["/public/auth/verify-email"])), ready: "#verification-title", check: async (page) => {
  await page.getByRole("button", { name: "Confirm email" }).click();
  await page.getByText("Email verification is temporarily unavailable. Try again.", { exact: true }).waitFor();
  if (!await page.getByRole("button", { name: "Confirm email" }).isEnabled()) failures.push("public-verification-network-failure: retryable confirmation remained disabled");
  if (!await page.getByRole("button", { name: "Send new link" }).count()) failures.push("public-verification-network-failure: resend alternative missing");
} });
await visit({ name: "public-verification-resend-network-failure", url: `${publicUrl}/verify-email`, mock: (page) => mockPublic(page, undefined, new Set(["/public/auth/resend-verification"])), ready: "#verification-title", check: async (page) => {
  await page.getByLabel("Work email").fill("owner@example.test");
  await page.getByRole("button", { name: "Send new link" }).click();
  await page.getByText("Verification email delivery is temporarily unavailable. Try again shortly.", { exact: true }).waitFor();
  if (!await page.getByRole("button", { name: "Send new link" }).isEnabled()) failures.push("public-verification-resend-network-failure: resend remained busy");
} });
await visit({ name: "public-invitation", url: `${publicUrl}/invitations/accept#token=qa-token`, mock: mockPublic, ready: "#invitation-title", check: async (page) => {
  await auditFieldBoundary(page, "Your name", { minlength: 2, maxlength: 160 }, "public-invitation");
  const href = await page.getByRole("link", { name: "Sign in first" }).getAttribute("href");
  if (href !== "https://app.djaybot.com/invitations/accept#token=qa-token") failures.push(`public-invitation: unsafe existing-account continuation ${href}`);
  if (page.url() !== `${publicUrl}/invitations/accept`) failures.push("public-invitation: token remained in the address after hydration");
} });
const invitationIdentityRequests = new Map();
await visit({ name: "public-invitation-identity-boundary", url: `${publicUrl}/invitations/accept#token=qa-token`, mock: (page) => mockPublic(page, undefined, undefined, undefined, invitationIdentityRequests), ready: "#invitation-title", check: async (page) => {
  await page.getByLabel("Your name").fill("  ");
  await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery-staple");
  await page.getByLabel("Confirm password", { exact: true }).fill("correct-horse-battery-staple");
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await page.getByText("Name must be 2–160 characters after removing leading and trailing spaces.", { exact: true }).waitFor();
  if (invitationIdentityRequests.has("/public/invitations/accept")) failures.push("public-invitation-identity-boundary: whitespace-only name reached the API");
  if (await page.evaluate(() => sessionStorage.getItem("djay.invitation.token")) !== "qa-token") failures.push("public-invitation-identity-boundary: invitation token was discarded");
} });
const invitationMismatchRequests = new Map();
await visit({ name: "public-invitation-password-mismatch", url: `${publicUrl}/invitations/accept#token=qa-token`, mock: (page) => mockPublic(page, undefined, undefined, undefined, invitationMismatchRequests), ready: "#invitation-title", check: async (page) => {
  await page.getByLabel("Your name").fill("New Team Member");
  await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery-staple");
  await page.getByLabel("Confirm password", { exact: true }).fill("different-horse-battery-staple");
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await page.getByText("Passwords do not match. Enter the same password in both fields.", { exact: true }).waitFor();
  if (invitationMismatchRequests.has("/public/invitations/accept")) failures.push("public-invitation-password-mismatch: mismatched password reached the API");
  if (await page.evaluate(() => sessionStorage.getItem("djay.invitation.token")) !== "qa-token") failures.push("public-invitation-password-mismatch: invitation token was discarded");
} });
const existingInvitationBodies = new Map();
await visit({ name: "public-existing-account-invitation", url: `${publicUrl}/invitations/accept#token=qa-token`, mock: (page) => mockPublic(page, undefined, undefined, undefined, undefined, "sign_in_required", existingInvitationBodies), ready: "#invitation-title", check: async (page) => {
  await page.getByLabel("Your name").fill("  Existing User  ");
  await page.getByLabel("Password", { exact: true }).fill("existing-account-password");
  await page.getByLabel("Confirm password", { exact: true }).fill("existing-account-password");
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await page.getByText("This email already has an account. Continue to the secure sign-in journey to accept it.", { exact: true }).waitFor();
  const href = await page.getByRole("link", { name: "Continue to sign in" }).getAttribute("href");
  if (href !== "https://app.djaybot.com/invitations/accept#token=qa-token") failures.push("public-existing-account-invitation: token-safe Tenant continuation missing");
  if (existingInvitationBodies.get("/public/invitations/accept")?.name !== "Existing User") failures.push("public-existing-account-invitation: normalized name was not trimmed before transport");
} });
const redirectContext = await browser.newContext();
const loginRedirect = await redirectContext.request.get(`${publicUrl}/login`, { maxRedirects: 0 });
if (![307, 308].includes(loginRedirect.status()) || !["https://app.djaybot.com", "https://app.djaybot.com/"].includes(loginRedirect.headers().location)) failures.push(`public-login: unsafe redirect ${loginRedirect.status()} ${loginRedirect.headers().location}`);
await redirectContext.close();

await visit({ name: "tenant-recovery", url: `${tenantUrl}/recovery`, ready: "#recovery-title", check: async (page) => {
  await auditFieldBoundary(page, "Work email", { maxlength: 320 }, "tenant-recovery");
} });
const recoveryMismatchRequests = new Map();
await visit({ name: "tenant-recovery-password-mismatch", url: `${tenantUrl}/recovery/complete#token=qa-token`, mock: (page) => mockPublic(page, undefined, undefined, undefined, recoveryMismatchRequests), ready: "#recovery-complete-title", check: async (page) => {
  await page.getByLabel("New password", { exact: true }).fill("replacement-password-accepted");
  await page.getByLabel("Confirm new password", { exact: true }).fill("replacement-password-different");
  await page.getByRole("button", { name: "Update password" }).click();
  await page.getByText("Passwords do not match. Enter the same password in both fields.", { exact: true }).waitFor();
  if (recoveryMismatchRequests.has("/public/auth/recovery/complete")) failures.push("tenant-recovery-password-mismatch: mismatched password reached the API");
  if (await page.evaluate(() => sessionStorage.getItem("djay.recovery.token")) !== "qa-token") failures.push("tenant-recovery-password-mismatch: retry token was discarded");
} });
await visit({ name: "tenant-recovery-complete", url: `${tenantUrl}/recovery/complete#token=qa-token`, mock: mockPublic, ready: "#recovery-complete-title", check: async (page) => {
  await page.getByLabel("New password", { exact: true }).fill("replacement-password-accepted");
  await page.getByLabel("Confirm new password", { exact: true }).fill("replacement-password-accepted");
  await page.getByRole("button", { name: "Update password" }).click();
  await page.getByText("Password updated. All previous sessions were signed out.", { exact: true }).waitFor();
  if (page.url() !== `${tenantUrl}/recovery/complete`) failures.push("tenant-recovery-complete: token remained after completion");
} });
await visit({ name: "tenant-ownership", url: `${tenantUrl}/ownership/accept#transferId=transfer&token=qa-token`, mock: (page) => mockTenantRole(page, "tenant_master_admin"), ready: "#acceptance-title", check: async (page) => {
  await page.getByRole("button", { name: "Accept ownership" }).click();
  await page.getByText("Ownership transferred. Sign in again to start a new secure session.", { exact: true }).waitFor();
  if (page.url() !== `${tenantUrl}/ownership/accept`) failures.push("tenant-ownership: sensitive state remained after acceptance");
} });
await visit({ name: "tenant-existing-account-invitation", url: `${tenantUrl}/invitations/accept#token=qa-token`, mock: async (page) => {
  await mockTenantRole(page, "tenant_operator");
  await mockPublic(page);
}, ready: "#existing-invitation-title", check: async (page) => {
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await page.getByText("Invitation accepted. Sign in again to start a session with your updated workspace access.", { exact: true }).waitFor();
  if (page.url() !== `${tenantUrl}/invitations/accept`) failures.push("tenant-existing-account-invitation: token remained after acceptance");
  if (await page.evaluate(() => sessionStorage.getItem("djay.invitation.token")) !== null) failures.push("tenant-existing-account-invitation: terminal token state was not cleared");
} });
await visit({ name: "tenant-existing-account-invitation-network-failure", url: `${tenantUrl}/invitations/accept#token=qa-token`, mock: async (page) => {
  await mockTenantRole(page, "tenant_operator");
  await mockPublic(page, undefined, new Set(["/public/invitations/accept"]));
}, ready: "#existing-invitation-title", check: async (page) => {
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await page.getByText("Invitation acceptance is temporarily unavailable. No workspace access changed.", { exact: true }).waitFor();
  if (!await page.getByRole("button", { name: "Accept invitation" }).isEnabled()) failures.push("tenant-existing-account-invitation-network-failure: retry remained disabled");
  if (await page.evaluate(() => sessionStorage.getItem("djay.invitation.token")) !== "qa-token") failures.push("tenant-existing-account-invitation-network-failure: retry token was discarded");
} });
await visit({ name: "tenant-existing-account-invitation-mobile", url: `${tenantUrl}/invitations/accept#token=qa-token`, viewport: mobile, mock: async (page) => {
  await page.route("**/tenant/session", (route) => json(route, { status: "unauthenticated" }, 401));
}, ready: "#existing-invitation-title", check: async (page) => {
  const link = page.getByRole("link", { name: "Sign in to continue" });
  if (await link.getAttribute("href") !== "/?next=%2Finvitations%2Faccept") failures.push("tenant-existing-account-invitation-mobile: same-origin continuation missing");
  if (page.url() !== `${tenantUrl}/invitations/accept`) failures.push("tenant-existing-account-invitation-mobile: fragment was not removed");
  if (await page.evaluate(() => sessionStorage.getItem("djay.invitation.token")) !== "qa-token") failures.push("tenant-existing-account-invitation-mobile: token was not retained for sign-in");
} });
await visit({ name: "tenant-ownership-session-failure", url: `${tenantUrl}/ownership/accept?transferId=transfer&token=qa-token`, mock: (page) => mockTenantRole(page, "tenant_master_admin", undefined, new Set(["/tenant/session"])), ready: "#acceptance-title", check: async (page) => {
  if (!await page.getByText("Your account session could not be checked. No ownership state changed.", { exact: true }).count()) failures.push("tenant-ownership-session-failure: safe explanation missing");
  if (!await page.getByRole("button", { name: "Try again" }).count()) failures.push("tenant-ownership-session-failure: retry action missing");
} });
await visit({ name: "workspace-subscription-summary", url: `${tenantUrl}/workspace`, mock: (page) => mockTenantRole(page, "tenant_analyst"), ready: ".product-overview-grid", check: async (page) => {
  if (!await page.getByRole("link", { name: /AI Chatbot Premium/ }).count()) failures.push("workspace-subscription-summary: product route missing");
  if (await page.getByText("No products are configured yet", { exact: true }).count()) failures.push("workspace-subscription-summary: active subscription presented as empty");
  for (const step of ["Account secured", "Business profile", "Product access", "Configure", "Test end to end", "Technical launch readiness"]) {
    if (!await page.getByText(step, { exact: true }).count()) failures.push(`workspace-subscription-summary: launch step missing ${step}`);
  }
  if (await page.locator(".onboarding-checklist button").count()) failures.push("workspace-subscription-summary: browser stage controls remain exposed");
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
      if (route === "team") await auditFieldBoundary(page, "Email", { maxlength: 320 }, `workspace-${routeName}-${viewportName}`);
    } });
  }
}

await visit({ name: "analyst-overview", url: `${tenantUrl}/workspace`, mock: (page) => mockTenantRole(page, "tenant_analyst"), ready: ".onboarding-checklist", check: async (page) => {
  if (await page.getByRole("button", { name: "Refresh checklist" }).count()) failures.push("analyst-overview: onboarding refresh exposed");
} });
await visit({ name: "owner-guided-onboarding", url: `${tenantUrl}/workspace`, mock: (page) => mockTenantRole(page, "tenant_master_admin"), ready: ".onboarding-checklist", check: async (page) => {
  if (!await page.getByRole("button", { name: "Refresh checklist" }).count()) failures.push("owner-guided-onboarding: evidence refresh missing");
  if (!await page.getByText("Progress comes from server-verified workspace and product evidence.", { exact: false }).count()) failures.push("owner-guided-onboarding: evidence authority explanation missing");
  await page.getByRole("button", { name: "Refresh checklist" }).click();
  await page.getByText("Launch checklist refreshed from current product evidence.", { exact: true }).waitFor();
  await page.screenshot({ path: "/tmp/djay-onboarding-owner-desktop.png", fullPage: true });
} });
await visit({ name: "owner-guided-onboarding-mobile", url: `${tenantUrl}/workspace`, viewport: mobile, mock: (page) => mockTenantRole(page, "tenant_master_admin"), ready: ".onboarding-checklist", check: async (page) => {
  if (!await page.getByRole("button", { name: "Refresh checklist" }).count()) failures.push("owner-guided-onboarding-mobile: evidence refresh missing");
  await page.screenshot({ path: "/tmp/djay-onboarding-owner-mobile.png", fullPage: true });
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
await visit({ name: "platform-login", url: platformUrl, mock: (page) => page.route("**/platform/me", (route) => json(route, { status: "unauthenticated" }, 401)), ready: "#platform-login-title", check: async (page) => {
  await auditFieldBoundary(page, "Platform email", { maxlength: 320 }, "platform-login");
} });
await browser.close();

if (brandColors.size !== 1 || !brandColors.has("rgb(242, 193, 78)")) failures.push(`brand mark palette inconsistent: ${[...brandColors].join(", ")}`);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.info("Shared brand, approved legal review, WCAG 2.2 AA automation, responsive overflow, keyboard focus, safe cross-app links, branded 404 recovery, authentication shells, role navigation, dependency failures, and mutation transport recovery passed.");
