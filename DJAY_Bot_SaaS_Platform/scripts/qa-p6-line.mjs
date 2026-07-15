import { chromium } from "playwright";

const tenantUrl = process.env.TENANT_QA_URL || "http://127.0.0.1:3111";
const browser = await chromium.launch({ headless: true });
const failures = [];
const restricted = /\b(openai|anthropic|claude|gemini|gpt-[0-9]|provider[_ -]?(?:key|name|id)|model[_ -]?id)\b/i;
const tenantId = "20000000-0000-4000-8000-000000000006";
const agentId = "51000000-0000-4000-8000-000000000006";
const connectionId = "55000000-0000-4000-8000-000000000006";
const whatsappConnectionId = "55000000-0000-4000-8000-000000000016";
const messengerConnectionId = "55000000-0000-4000-8000-000000000026";
const existingContactId = "50000000-0000-4000-8000-000000000061";
const socialContactId = "50000000-0000-4000-8000-000000000062";

function json(route, value, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
}

function playbook() {
  return {
    schemaVersion: 1, businessName: "Social Studio", agentName: "Mali",
    languages: ["en", "th"], tone: "Warm and concise", salesGoal: "Qualify interest",
    approvedClaims: [], prohibitedClaims: [], discoveryQuestions: ["What do you need?"],
    ctaPolicy: ["Offer a consultation request"], requiredContactFields: ["name"],
    greeting: { en: "Hello", th: "สวัสดี" },
    offlineMessage: { en: "Our team will follow up", th: "ทีมงานจะติดต่อกลับ" },
    timezone: "Asia/Bangkok", weeklyWindows: [], notificationProfileId: null,
  };
}

async function mockTenant(page, role) {
  const state = {
    connectionStatus: "active", healthCalls: 0, rotationBody: null,
    createBody: null, revokeCalls: 0, whatsappCreated: false,
    whatsappCreateBody: null, whatsappRotationBody: null,
    messengerCreated: false, messengerCreateBody: null, messengerRotationBody: null,
  };
  await page.route("**/tenant/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path === "/tenant/session") return json(route, {
      user: { id: "user", displayName: role === "tenant_viewer" ? "AI Viewer" : "AI Owner" },
      workspaces: [{ tenantId, slug: "social-studio", businessName: "Social Studio", role }],
      selectedTenantId: tenantId, mfaVerifiedAt: new Date().toISOString(),
    });
    if (path === "/tenant/support-access") return json(route, { grants: [] });
    if (path === "/tenant/knowledge") return json(route, { sources: [] });
    if (path === "/tenant/contacts" && method === "GET") return json(route, {
      contacts: [
        { id: existingContactId, displayName: "Existing CRM customer", locale: "en",
          consentStatus: "unknown", identities: [{ kind: "email", value: "line@example.test", verificationStatus: "verified" }],
          leadCount: 1, updatedAt: new Date().toISOString() },
        { id: socialContactId, displayName: "LINE Customer", locale: "en",
          consentStatus: "unknown", identities: [{ kind: "email", value: "line@example.test", verificationStatus: "unverified" }],
          leadCount: 1, updatedAt: new Date().toISOString() },
      ],
      identityReviewCandidates: [{ id: crypto.randomUUID(), sourceContactId: socialContactId,
        sourceContactName: "LINE Customer", candidateContactId: existingContactId,
        candidateContactName: "Existing CRM customer", identityKind: "email",
        matchValue: "line@example.test", observedAt: new Date().toISOString() }],
    });
    if (path === "/tenant/ai-chat/notifications") return json(route, { notifications: [] });
    if (path === "/tenant/ai-chat/analytics") return json(route, {
      analytics: { periodDays: 30, level: "core", sessions: 8, completedTurns: 12,
        failedTurns: 1, handovers: 1, leads: 4, appointmentRequests: 2, settledResponses: 12 },
    });
    if (path === "/tenant/ai-chat/agents" && method === "GET") return json(route, {
      agents: [{ id: agentId, name: "Mali", status: "active", defaultLanguage: "en",
        currentPublishedPlaybookVersionId: "54000000-0000-4000-8000-000000000006",
        draftRevision: 2, deploymentCount: 1 }],
      capabilities: { planKey: "ai_chat_premium", accessMode: "active", web: true,
        social: { line: true, whatsapp: true, messenger: true },
        limits: { deployments: 5, knowledgeDocuments: 50 } },
    });
    if (path.endsWith("/draft")) return json(route, { draft: {
      revision: 2, definition: playbook(), knowledgeRevisionIds: [], updatedAt: new Date().toISOString(),
    } });
    if (path.endsWith("/deployments")) return json(route, { deployments: [] });
    if (path === "/tenant/ai-chat/social-connections" && method === "GET") return json(route, {
      connections: [{ id: connectionId, agentId, channel: "line", name: "Main LINE",
        externalAccountRef: "line-main-account", status: state.connectionStatus,
        healthStatus: state.healthCalls ? "healthy" : "unknown", safeErrorCode: null,
        lastHealthAt: state.healthCalls ? new Date().toISOString() : null,
        pendingDeliveries: 2, failedDeliveries: 1, deadLetterDeliveries: 1,
        succeededDeliveries: 17, attemptedQuantity: 22 }, ...(state.whatsappCreated ? [{
        id: whatsappConnectionId, agentId, channel: "whatsapp", name: "Main WhatsApp",
        externalAccountRef: "wa-business-account", status: "active", healthStatus: "unchecked",
        safeErrorCode: null, lastHealthAt: null, pendingDeliveries: 0, failedDeliveries: 0,
        deadLetterDeliveries: 0, succeededDeliveries: 3, attemptedQuantity: 3,
      }] : []), ...(state.messengerCreated ? [{
        id: messengerConnectionId, agentId, channel: "messenger", name: "Main Messenger",
        externalAccountRef: "messenger-page-account", status: "active", healthStatus: "unchecked",
        safeErrorCode: null, lastHealthAt: null, pendingDeliveries: 0, failedDeliveries: 0,
        deadLetterDeliveries: 0, succeededDeliveries: 4, attemptedQuantity: 4,
      }] : [])],
    });
    if (path === "/tenant/ai-chat/social-connections" && method === "POST") {
      const body = route.request().postDataJSON();
      if (body.channel === "messenger") {
        state.messengerCreateBody = body; state.messengerCreated = true;
        return json(route, { status: "created", connectionId: messengerConnectionId,
          webhookKey: "one-time-messenger-webhook-key" }, 201);
      }
      if (body.channel === "whatsapp") {
        state.whatsappCreateBody = body; state.whatsappCreated = true;
        return json(route, { status: "created", connectionId: whatsappConnectionId,
          webhookKey: "one-time-whatsapp-webhook-key" }, 201);
      }
      state.createBody = body;
      return json(route, { status: "created", connectionId: crypto.randomUUID(),
        webhookKey: "one-time-line-webhook-key" }, 201);
    }
    if (path === `/tenant/ai-chat/social-connections/${connectionId}/health` && method === "POST") {
      state.healthCalls += 1; return json(route, { status: "checked", connectionStatus: "active", healthStatus: "healthy" });
    }
    if (path === `/tenant/ai-chat/social-connections/${connectionId}` && method === "PATCH") {
      state.rotationBody = route.request().postDataJSON(); return json(route, { status: "rotated", credentialKeyVersion: 2 });
    }
    if (path === `/tenant/ai-chat/social-connections/${connectionId}` && method === "DELETE") {
      state.revokeCalls += 1; state.connectionStatus = "revoked"; return json(route, { status: "revoked" });
    }
    if (path === `/tenant/ai-chat/social-connections/${whatsappConnectionId}` && method === "PATCH") {
      state.whatsappRotationBody = route.request().postDataJSON();
      return json(route, { status: "rotated", credentialKeyVersion: 2 });
    }
    if (path === `/tenant/ai-chat/social-connections/${messengerConnectionId}` && method === "PATCH") {
      state.messengerRotationBody = route.request().postDataJSON();
      return json(route, { status: "rotated", credentialKeyVersion: 2 });
    }
    return json(route, { status: "not_found" }, 404);
  });
  return state;
}

async function inspectOwner(viewport, suffix) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on("pageerror", (error) => failures.push(`owner-${suffix}: ${error.message}`));
  page.on("console", (entry) => { if (entry.type() === "error") failures.push(`owner-${suffix}: console ${entry.text()}`); });
  const state = await mockTenant(page, "tenant_master_admin");
  const response = await page.goto(`${tenantUrl}/workspace/ai-chat`, { waitUntil: "networkidle" });
  if (!response?.ok()) failures.push(`owner-${suffix}: navigation ${response?.status()}`);
  await page.getByRole("heading", { name: "LINE connections" }).waitFor();
  for (const value of ["17 delivered", "2 pending", "2 failed", "22 channel units attempted"]) {
    if (!(await page.getByText(value, { exact: true }).count())) failures.push(`owner-${suffix}: missing ${value}`);
  }
  if (suffix === "desktop") {
    await page.getByRole("button", { name: "Check health" }).click();
    await page.getByText("Connection health check completed.", { exact: true }).waitFor();
    const rotation = page.locator(".credential-rotation");
    await rotation.locator("summary").click();
    await rotation.getByLabel("New access token").fill("rotated-access-token-value");
    await rotation.getByLabel("New channel secret").fill("rotated-channel-secret-value");
    await rotation.getByRole("button", { name: "Rotate" }).click();
    await page.getByText("LINE credentials rotated.", { exact: false }).waitFor();
    const setup = page.locator(".social-connection-setup");
    await setup.locator("summary").click();
    await setup.getByLabel("Connection name").fill("Backup LINE");
    await setup.getByLabel("LINE account reference").fill("line-backup-account");
    await setup.getByLabel("Channel access token").fill("new-access-token-value");
    await setup.getByLabel("Channel secret").fill("new-channel-secret-value");
    await setup.getByRole("button", { name: "Connect LINE" }).click();
    await page.getByText("One-time LINE webhook URL", { exact: true }).waitFor();
    if (!(await page.getByText("one-time-line-webhook-key", { exact: false }).count())) failures.push("owner-desktop: one-time webhook missing");
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Revoke" }).click();
    await page.getByText("Channel connection revoked.", { exact: true }).waitFor();
    if (state.healthCalls !== 1 || state.revokeCalls !== 1) failures.push("owner-desktop: operation call count mismatch");
    if (state.rotationBody?.channelAccessToken !== "rotated-access-token-value") failures.push("owner-desktop: rotation payload mismatch");
    if (state.createBody?.channelSecret !== "new-channel-secret-value") failures.push("owner-desktop: create payload mismatch");
    const whatsappSetup = page.locator(".whatsapp-connection-setup");
    await whatsappSetup.locator("summary").click();
    await whatsappSetup.getByLabel("Connection name").fill("Main WhatsApp");
    await whatsappSetup.getByLabel("Business account reference").fill("wa-business-account");
    await whatsappSetup.getByLabel("Access token").fill("whatsapp-access-token-value");
    await whatsappSetup.getByLabel("App secret").fill("whatsapp-app-secret-value");
    await whatsappSetup.getByLabel("Verify token").fill("whatsapp-verify-token-value");
    await whatsappSetup.getByLabel("Phone number ID").fill("phone-number-123");
    await whatsappSetup.getByLabel("Business account ID").fill("business-account-123");
    await whatsappSetup.getByRole("button", { name: "Connect WhatsApp" }).click();
    await page.getByText("One-time WhatsApp callback URL", { exact: true }).waitFor();
    if (!(await page.getByText("one-time-whatsapp-webhook-key", { exact: false }).count())) failures.push("owner-desktop: WhatsApp callback missing");
    const whatsappRow = page.locator(".social-connection-row", { hasText: "Main WhatsApp" });
    const whatsappRotation = whatsappRow.locator(".whatsapp-credential-rotation");
    await whatsappRotation.locator("summary").click();
    await whatsappRotation.getByLabel("New access token").fill("rotated-whatsapp-access-token");
    await whatsappRotation.getByLabel("New app secret").fill("rotated-whatsapp-app-secret");
    await whatsappRotation.getByLabel("New verify token").fill("rotated-whatsapp-verify-token");
    await whatsappRotation.getByLabel("Phone number ID").fill("phone-number-123");
    await whatsappRotation.getByLabel("Business account ID").fill("business-account-123");
    await whatsappRotation.getByRole("button", { name: "Rotate" }).click();
    await page.getByText("WhatsApp credentials rotated.", { exact: false }).waitFor();
    if (state.whatsappCreateBody?.verifyToken !== "whatsapp-verify-token-value") failures.push("owner-desktop: WhatsApp create payload mismatch");
    if (state.whatsappRotationBody?.accessToken !== "rotated-whatsapp-access-token") failures.push("owner-desktop: WhatsApp rotation payload mismatch");
    const messengerSetup = page.locator(".messenger-connection-setup");
    await messengerSetup.locator("summary").click();
    await messengerSetup.getByLabel("Connection name").fill("Main Messenger");
    await messengerSetup.getByLabel("Page account reference").fill("messenger-page-account");
    await messengerSetup.getByLabel("Page access token").fill("messenger-page-access-token");
    await messengerSetup.getByLabel("App secret").fill("messenger-app-secret-value");
    await messengerSetup.getByLabel("Verify token").fill("messenger-verify-token-value");
    await messengerSetup.getByLabel("Page ID").fill("messenger-page-123");
    await messengerSetup.getByRole("button", { name: "Connect Messenger" }).click();
    await page.getByText("One-time Messenger callback URL", { exact: true }).waitFor();
    if (!(await page.getByText("one-time-messenger-webhook-key", { exact: false }).count())) failures.push("owner-desktop: Messenger callback missing");
    const messengerRow = page.locator(".social-connection-row", { hasText: "Main Messenger" });
    const messengerRotation = messengerRow.locator(".messenger-credential-rotation");
    await messengerRotation.locator("summary").click();
    await messengerRotation.getByLabel("New page access token").fill("rotated-messenger-page-token");
    await messengerRotation.getByLabel("New app secret").fill("rotated-messenger-app-secret");
    await messengerRotation.getByLabel("New verify token").fill("rotated-messenger-verify-token");
    await messengerRotation.getByLabel("Page ID").fill("messenger-page-123");
    await messengerRotation.getByRole("button", { name: "Rotate" }).click();
    await page.getByText("Messenger credentials rotated.", { exact: false }).waitFor();
    if (state.messengerCreateBody?.verifyToken !== "messenger-verify-token-value") failures.push("owner-desktop: Messenger create payload mismatch");
    if (state.messengerRotationBody?.pageAccessToken !== "rotated-messenger-page-token") failures.push("owner-desktop: Messenger rotation payload mismatch");
  }
  const dimensions = await page.evaluate(() => ({
    body: document.body.innerText, width: document.documentElement.scrollWidth, viewport: innerWidth,
  }));
  if (dimensions.width > dimensions.viewport + 1) failures.push(`owner-${suffix}: horizontal overflow ${dimensions.width}/${dimensions.viewport}`);
  if (restricted.test(dimensions.body)) failures.push(`owner-${suffix}: restricted routing term visible`);
  if (/rotated-channel-secret-value|new-channel-secret-value|whatsapp-app-secret-value|whatsapp-verify-token-value|messenger-app-secret-value|messenger-verify-token-value/.test(dimensions.body)) failures.push(`owner-${suffix}: credential leaked`);
  await page.screenshot({ path: `/tmp/djay-p6-line-owner-${suffix}.png`, fullPage: true });
  await context.close();
}

async function inspectViewer() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage(); await mockTenant(page, "tenant_viewer");
  await page.goto(`${tenantUrl}/workspace/ai-chat`, { waitUntil: "networkidle" });
  await page.getByText("22 channel units attempted", { exact: true }).waitFor();
  for (const name of ["Check health", "Revoke", "Connect LINE", "Connect WhatsApp", "Connect Messenger", "Rotate"]) {
    if (await page.getByRole("button", { name }).count()) failures.push(`viewer: ${name} should be hidden`);
  }
  await page.screenshot({ path: "/tmp/djay-p6-line-viewer-mobile.png", fullPage: true });
  await context.close();
}

async function inspectIdentityReview() {
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  const page = await context.newPage(); await mockTenant(page, "tenant_master_admin");
  await page.goto(`${tenantUrl}/workspace/contacts`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Possible contact matches" }).waitFor();
  await page.getByText("may match Existing CRM customer", { exact: true }).waitFor();
  await page.getByText("line@example.test", { exact: true }).first().waitFor();
  if (await page.getByRole("button", { name: /merge/i }).count()) failures.push("identity-review: merge action must not exist");
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth }));
  if (dimensions.width > dimensions.viewport + 1) failures.push(`identity-review: horizontal overflow ${dimensions.width}/${dimensions.viewport}`);
  await page.screenshot({ path: "/tmp/djay-p6-identity-review-desktop.png", fullPage: true });
  await context.close();
}

await inspectOwner({ width: 1365, height: 900 }, "desktop");
await inspectOwner({ width: 390, height: 844 }, "mobile");
await inspectViewer();
await inspectIdentityReview();
await browser.close();
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.info("P6 LINE, WhatsApp, and Messenger tenant operations passed desktop/mobile metrics, secrets, actions, viewer permissions, console, overflow, and provider-leak checks.");
