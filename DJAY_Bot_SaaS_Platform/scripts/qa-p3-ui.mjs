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
const voiceConversation = { id: "70000000-0000-4000-8000-000000000002", contactId: contact.id, contactName: "Mali Voice Lead", leadId: lead.id, productKey: "voice", publicPlanKey: "voice_basic_gen1", channelKind: "voice", automationMode: "closed", status: "closed", assignedMembershipId: null, lastMessage: "I recorded your callback request for the team.", lastMessageAt: new Date().toISOString(), updatedAt: new Date().toISOString(), voiceStatus: "ended", voiceTerminalReason: "callback_requested", voiceMinutes: 2, voiceDurationSeconds: 62, voiceOutcome: "callback_requested", voiceSummary: "The customer requested a callback.", callbackStatus: "pending", callbackDueAt: new Date(Date.now() + 86_400_000).toISOString() };
const messages = [
  { id: "71000000-0000-4000-8000-000000000001", sequence: 1, actorType: "customer", direction: "inbound", text: "I would like details about your premium service.", createdAt: new Date(Date.now() - 60_000).toISOString() },
  { id: "71000000-0000-4000-8000-000000000002", sequence: 2, actorType: "human", direction: "outbound", text: "Certainly. Could we confirm tomorrow afternoon?", createdAt: new Date().toISOString() },
];

function json(route, value, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
}

async function mockTenant(page, mutationEvidence) {
  await page.route("**/tenant/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/tenant/session") return json(route, { user: { id: "user", displayName: "Browser Owner" }, workspaces: [workspace], selectedTenantId: workspace.tenantId, mfaVerifiedAt: new Date().toISOString() });
    if (path === "/tenant/support-access") return json(route, { grants: [{ id: "grant", reason: "Investigating a merchant-reported message delivery issue.", startsAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3_600_000).toISOString() }] });
    if (path === "/tenant/contacts") return json(route, route.request().method() === "GET" ? { contacts: [contact] } : { status: "created", contactId: crypto.randomUUID() }, route.request().method() === "GET" ? 200 : 201);
    if (path === "/tenant/leads") return json(route, route.request().method() === "GET" ? { leads: [lead] } : { status: "created", leadId: crypto.randomUUID() }, route.request().method() === "GET" ? 200 : 201);
    if (path === "/tenant/conversations") return json(route, { conversations: [voiceConversation, conversation] });
    if (path.endsWith("/messages")) {
      if (route.request().method() !== "GET" && mutationEvidence) {
        mutationEvidence.messageMutations = (mutationEvidence.messageMutations || 0) + 1;
        mutationEvidence.messageBodies = [...(mutationEvidence.messageBodies || []), route.request().postDataJSON()];
        if (mutationEvidence.failMessageMutation) return json(route, { status: "temporarily_unavailable" }, 503);
      }
      return json(route, route.request().method() === "GET" ? { messages } : { status: "created", messageId: crypto.randomUUID(), sequence: 3 }, route.request().method() === "GET" ? 200 : 201);
    }
    if (path === "/tenant/knowledge") return json(route, route.request().method() === "GET" ? { sources: [{ id: "80000000-0000-4000-8000-000000000001", name: "Approved service guide", sourceKind: "text", status: "active", version: 2, revisionCreatedAt: new Date().toISOString() }] } : { status: "created" }, route.request().method() === "GET" ? 200 : 201);
    if (path === "/tenant/privacy-jobs") {
      if (route.request().method() === "GET") return json(route, { jobs: [{ id: "90000000-0000-4000-8000-000000000001", contactId: contact.id, contactName: contact.displayName, jobType: "export", status: "completed", requestedAt: new Date().toISOString(), completedAt: new Date().toISOString() }] });
      if (mutationEvidence) { mutationEvidence.mutations += 1; mutationEvidence.bodies.push(route.request().postDataJSON()); }
      return json(route, { status: "accepted" }, 202);
    }
    if (path === "/tenant/retention-policy") {
      if (route.request().method() !== "GET" && mutationEvidence) mutationEvidence.retentionMutations += 1;
      return json(route, route.request().method() === "GET" ? { policy: { transcriptDays: 90, recordingDays: 0, voicePlanMaximumDays: 365, updatedAt: new Date().toISOString() } } : { status: "updated", transcriptDays: 90, recordingDays: 0, maximumDays: 365 });
    }
    if (path === "/tenant/legal-holds") return json(route, { holds: [] });
    return json(route, { status: "not_found" }, 404);
  });
}

async function mockPlatform(page, incidentEvidence) {
  await page.route("**/platform/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/platform/me") return json(route, { user: { id: "platform-owner", displayName: "Platform Owner", role: "platform_owner", mfaVerifiedAt: new Date().toISOString() } });
    if (path === "/platform/health-summary") return json(route, { health: { platformUsers: 3, activeSessions: 2 } });
    if (path === "/platform/commerce-overview") return json(route, { commerce: { tenants: 18, subscriptions: 31, pending: 2, active: 29 } });
    if (path === "/platform/subscriptions") return json(route, { subscriptions: [{ id: "sub", tenantId: workspace.tenantId, businessName: workspace.businessName, productKey: "ai_chat", planKey: "ai_chat_premium", publicName: "AI Chatbot Premium", status: "active", createdAt: new Date().toISOString() }] });
    if (path === "/platform/tenants") return json(route, { tenants: [{ id: workspace.tenantId, businessName: workspace.businessName, slug: workspace.slug, status: "active" }] });
    if (path === "/platform/support-grants") return json(route, { grants: [{ id: "grant", tenantId: workspace.tenantId, businessName: workspace.businessName, requestedByPlatformUserId: "support-user", approvedByPlatformUserId: "platform-owner", reason: "Investigating a merchant-reported message delivery issue.", status: "active", startsAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3_600_000).toISOString() }] });
    if (path === "/platform/voice/runtime-control" && route.request().method() === "PATCH") {
      const body = route.request().postDataJSON();
      if (incidentEvidence) {
        incidentEvidence.runtimeMutations = (incidentEvidence.runtimeMutations || 0) + 1;
        incidentEvidence.runtimeBodies = [...(incidentEvidence.runtimeBodies || []), body];
      }
      return json(route, { control: { mode: body.mode, reasonCode: body.reasonCode, version: 5, changedAt: new Date().toISOString() } });
    }
    if (path === "/platform/voice/runtime-control") return json(route, { control: { mode: "paused", reasonCode: "scheduled_maintenance", version: 4, changedAt: new Date().toISOString(), activeSessions: 2, reconnectingSessions: 1, expiredGrants: 0, staleConnections: 0 } });
    if (path === "/platform/voice/routing" && route.request().method() === "POST") {
      if (incidentEvidence) {
        incidentEvidence.mutations += 1;
        incidentEvidence.bodies.push(route.request().postDataJSON());
        if (incidentEvidence.failResolution) return json(route, { status: "temporarily_unavailable" }, 503);
      }
      return json(route, { status: "resolved" });
    }
    if (path === "/platform/voice/routing") return json(route, { routing: {
      admissionEnabled: false,
      admissionChanges: [{ id: "admission", capabilityProfile: "voice_gen2", targetEnabled: true, status: "requested", reason: "Named merchant media acceptance passed", requestedByPlatformUserId: "ai-operator", approvedByPlatformUserId: null, requestedAt: new Date().toISOString(), approvedAt: null, appliedAt: null }],
      profiles: [{ capabilityProfile: "voice_gen2", mode: "canary", reasonCode: "reviewed_canary", version: 3, changedAt: new Date().toISOString(), primaryCandidateId: null, canaryCandidateId: "candidate", canaryPercent: 10 }],
      candidates: [{ id: "candidate", capabilityProfile: "voice_gen2", providerKey: "provider.qa", modelKey: "advanced-voice-qa", regionKey: "ap-southeast-1", status: "qualified", proposedByPlatformUserId: "ai-operator", reviewedByPlatformUserId: "platform-owner", proposedAt: new Date().toISOString(), reviewedAt: new Date().toISOString() }],
      changes: [{ id: "change", capabilityProfile: "voice_gen2", candidateId: "candidate", previousCandidateId: null, canaryPercent: 10, status: "canary", reason: "Reviewed browser qualification canary", requestedByPlatformUserId: "ai-operator", approvedByPlatformUserId: "platform-owner", requestedAt: new Date().toISOString(), approvedAt: new Date().toISOString(), canaryStartedAt: new Date().toISOString(), activatedAt: null, rolledBackAt: null, rollbackReason: null }],
      incidents: [],
    } });
    if (path === "/platform/voice/incidents") return json(route, { incidents: [{ id: "incident", capabilityProfile: "voice_gen2", severity: "minor", status: "open", reason: "Browser quality threshold requires monitoring", resolution: null, routingChangeId: "change", creditReviewStatus: "not_required", openedByPlatformUserId: "ai-operator", openedAt: new Date().toISOString(), resolvedAt: null }] });
    return json(route, { status: "ok" });
  });
}

async function inspect(url, name, viewport, mock, check) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(() => localStorage.setItem("djay-ui-locale", "en"));
  const page = await context.newPage();
  page.on("pageerror", (error) => failures.push(`${name}: page error: ${error.message}`));
  page.on("console", (entry) => {
    const expectedRetryFailure = ["inbox-reply-retry", "platform-incident-resolution-retry"].includes(name)
      && entry.text().startsWith("Failed to load resource: the server responded with a status of 503");
    if (entry.type() === "error" && !expectedRetryFailure) failures.push(`${name}: console error: ${entry.text()}`);
  });
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
  if (!name.startsWith("platform-") && restricted.test(result.bodyText)) failures.push(`${name}: restricted provider/model term visible`);
  if (name.startsWith("inbox-") && !result.bodyText.includes("The customer requested a callback.")) failures.push(`${name}: Voice outcome summary missing`);
  if (name.startsWith("data-") && !result.bodyText.includes("Transcript retention")) failures.push(`${name}: retention controls missing`);
  if (name.startsWith("platform-voice") && (!result.bodyText.includes("Runtime admission and recovery") || !result.bodyText.includes("Second-Generation route governance") || !result.bodyText.includes("Production admission") || !result.bodyText.includes("there is no fallback"))) failures.push(`${name}: Voice operations control missing`);
  if (check) await check(page);
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
const privacyEvidence = { mutations: 0, bodies: [], retentionMutations: 0 };
await inspect(`${tenantUrl}/workspace/data`, "data-privacy-scope", desktop, (page) => mockTenant(page, privacyEvidence), async (page) => {
  const requestType = page.locator('select[name="jobType"]');
  const contactScope = page.locator('select[name="contactId"]');
  const submitPrivacyRequest = page.locator("form.privacy-form button[type=submit]");
  await requestType.selectOption("erasure");
  if (await contactScope.locator("option").first().getAttribute("value") !== "") failures.push("data-privacy-scope: erasure retained the workspace-wide export option");
  await submitPrivacyRequest.click();
  await page.getByRole("alert").getByText("Select the specific contact", { exact: false }).waitFor();
  if (privacyEvidence.mutations !== 0) failures.push("data-privacy-scope: unscoped erasure reached the API");
  try {
    await page.waitForFunction(() => document.activeElement?.id === "privacy-contact");
  } catch { failures.push("data-privacy-scope: missing contact scope did not receive focus"); }
  await contactScope.selectOption(contact.id);
  let dismissedMessage = "";
  page.once("dialog", async (dialog) => { dismissedMessage = dialog.message(); await dialog.dismiss(); });
  await submitPrivacyRequest.click();
  if (!dismissedMessage.includes(contact.displayName) || privacyEvidence.mutations !== 0) failures.push("data-privacy-scope: dismissed named erasure confirmation changed data");
  page.once("dialog", async (dialog) => dialog.accept());
  await submitPrivacyRequest.click();
  await page.getByText("Privacy request accepted for processing.", { exact: true }).waitFor();
  if (privacyEvidence.mutations !== 1 || privacyEvidence.bodies[0]?.jobType !== "erasure" || privacyEvidence.bodies[0]?.contactId !== contact.id) failures.push("data-privacy-scope: scoped erasure did not send one exact request");
  if (await requestType.inputValue() !== "export" || await contactScope.inputValue() !== "") failures.push("data-privacy-scope: accepted request did not reset to safe export defaults");
  await page.getByRole("button", { name: "Save retention" }).click();
  const retentionSection = page.locator(".tool-band").filter({ hasText: "Transcript retention" });
  await retentionSection.getByRole("status").getByText("Retention policy saved", { exact: false }).waitFor();
  if (privacyEvidence.retentionMutations !== 1) failures.push("data-privacy-scope: retention update did not send exactly one request");
});
const replyEvidence = { messageMutations: 0, messageBodies: [] };
await inspect(`${tenantUrl}/workspace/inbox`, "inbox-reply-boundary", desktop, (page) => mockTenant(page, replyEvidence), async (page) => {
  await page.getByRole("button", { name: new RegExp(contact.displayName) }).click();
  const reply = page.getByLabel("Reply");
  await reply.fill("   ");
  await page.getByRole("button", { name: "Send reply" }).click();
  await page.getByRole("alert").getByText("Write a reply with at least one visible character.", { exact: true }).waitFor();
  if (replyEvidence.messageMutations !== 0) failures.push("inbox-reply-boundary: whitespace-only reply reached the API");
  if (!await reply.evaluate((element) => element === document.activeElement)) failures.push("inbox-reply-boundary: invalid reply did not retain field focus");
  await reply.fill("  We can help with that.  ");
  await page.getByRole("button", { name: "Send reply" }).click();
  await page.getByRole("status").getByText("Reply sent.", { exact: true }).waitFor();
  if (replyEvidence.messageMutations !== 1 || replyEvidence.messageBodies[0]?.text !== "We can help with that.") failures.push("inbox-reply-boundary: corrected reply did not send one normalized message");
  if (await reply.inputValue() !== "") failures.push("inbox-reply-boundary: accepted reply did not clear the composer");
});
const replyFailureEvidence = { messageMutations: 0, messageBodies: [], failMessageMutation: true };
await inspect(`${tenantUrl}/workspace/inbox`, "inbox-reply-retry", desktop, (page) => mockTenant(page, replyFailureEvidence), async (page) => {
  await page.getByRole("button", { name: new RegExp(contact.displayName) }).click();
  const reply = page.getByLabel("Reply");
  await reply.fill("Please retry this message.");
  await page.getByRole("button", { name: "Send reply" }).click();
  await page.getByRole("alert").getByText("Reply could not be saved. Your text is still available to retry.", { exact: true }).waitFor();
  if (replyFailureEvidence.messageMutations !== 1 || await reply.inputValue() !== "Please retry this message.") failures.push("inbox-reply-retry: failed reply did not preserve one exact retryable draft");
  if (!await page.getByRole("button", { name: "Send reply" }).isEnabled()) failures.push("inbox-reply-retry: failed reply left the composer busy");
});
await inspect(platformUrl, "platform-desktop", desktop, mockPlatform);
await inspect(platformUrl, "platform-mobile", mobile, mockPlatform);
const voiceActionEvidence = { mutations: 0, bodies: [], runtimeMutations: 0, runtimeBodies: [] };
await inspect(`${platformUrl}/operations/voice`, "platform-voice-action-reasons", desktop, (page) => mockPlatform(page, voiceActionEvidence), async (page) => {
  const runtimeReason = page.locator("#voice-runtime-reason");
  await runtimeReason.fill("   ");
  await page.getByRole("button", { name: "Resume admission", exact: true }).click();
  await page.getByRole("alert").getByText("Operational reason must be 3–200 characters after removing leading and trailing spaces.", { exact: true }).waitFor();
  if (voiceActionEvidence.runtimeMutations !== 0) failures.push("platform-voice-action-reasons: invalid runtime reason reached the API");
  if (!await runtimeReason.evaluate((element) => element === document.activeElement)) failures.push("platform-voice-action-reasons: invalid runtime reason did not retain field focus");
  await runtimeReason.fill("  reviewed recovery  ");
  page.once("dialog", async (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Resume admission", exact: true }).click();
  await page.getByRole("status").getByText("Voice runtime control updated.", { exact: true }).waitFor();
  if (voiceActionEvidence.runtimeMutations !== 1
    || voiceActionEvidence.runtimeBodies[0]?.mode !== "running"
    || voiceActionEvidence.runtimeBodies[0]?.reasonCode !== "reviewed recovery") failures.push("platform-voice-action-reasons: corrected runtime reason did not send one normalized command");

  const actionReason = page.locator("#voice-routing-action-reason");
  await actionReason.fill("   ");
  await page.getByRole("button", { name: "Promote", exact: true }).click();
  await page.getByRole("alert").getByText("Action reason must be 12–500 characters after removing leading and trailing spaces.", { exact: true }).waitFor();
  if (voiceActionEvidence.mutations !== 0) failures.push("platform-voice-action-reasons: invalid routing action reason reached the API");
  if (!await actionReason.evaluate((element) => element === document.activeElement)) failures.push("platform-voice-action-reasons: invalid routing action reason did not retain field focus");
  await actionReason.fill("  Promote after reviewed evidence  ");
  page.once("dialog", async (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Promote", exact: true }).click();
  await page.getByRole("status").getByText("Routing action promote completed.", { exact: true }).waitFor();
  if (voiceActionEvidence.mutations !== 1
    || voiceActionEvidence.bodies[0]?.command !== "change.apply"
    || voiceActionEvidence.bodies[0]?.action !== "promote"
    || voiceActionEvidence.bodies[0]?.reason !== "Promote after reviewed evidence") failures.push("platform-voice-action-reasons: corrected routing reason did not send one normalized command");
});
const incidentEvidence = { mutations: 0, bodies: [] };
await inspect(`${platformUrl}/operations/voice`, "platform-incident-resolution", desktop, (page) => mockPlatform(page, incidentEvidence), async (page) => {
  await page.getByRole("button", { name: "Resolve", exact: true }).click();
  const resolution = page.getByLabel("Resolution for minor incident");
  await resolution.fill("Draft recovery evidence");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  if (await resolution.count() !== 0 || incidentEvidence.mutations !== 0) failures.push("platform-incident-resolution: cancel changed incident state");
  await page.getByRole("button", { name: "Resolve", exact: true }).click();
  const reopenedResolution = page.getByLabel("Resolution for minor incident");
  await reopenedResolution.fill("   ");
  await page.getByRole("button", { name: "Save resolution", exact: true }).click();
  await page.getByRole("alert").getByText("Resolution must be 12–2,000 characters after removing leading and trailing spaces.", { exact: true }).waitFor();
  if (incidentEvidence.mutations !== 0) failures.push("platform-incident-resolution: invalid resolution reached the API");
  if (!await reopenedResolution.evaluate((element) => element === document.activeElement)) failures.push("platform-incident-resolution: invalid resolution did not retain field focus");
  await reopenedResolution.fill("  Route remains paused pending reviewed recovery.  ");
  await page.getByRole("button", { name: "Save resolution", exact: true }).click();
  await page.getByRole("status").getByText("Incident resolved; routing remains explicit and fail-closed.", { exact: true }).waitFor();
  if (incidentEvidence.mutations !== 1
    || incidentEvidence.bodies[0]?.command !== "incident.resolve"
    || incidentEvidence.bodies[0]?.incidentId !== "incident"
    || incidentEvidence.bodies[0]?.resolution !== "Route remains paused pending reviewed recovery.") failures.push("platform-incident-resolution: corrected resolution did not send one normalized command");
  try {
    await reopenedResolution.waitFor({ state: "detached" });
  } catch { failures.push("platform-incident-resolution: accepted resolution form remained open"); }
});
const incidentFailureEvidence = { mutations: 0, bodies: [], failResolution: true };
await inspect(`${platformUrl}/operations/voice`, "platform-incident-resolution-retry", mobile, (page) => mockPlatform(page, incidentFailureEvidence), async (page) => {
  await page.getByRole("button", { name: "Resolve", exact: true }).click();
  const resolution = page.getByLabel("Resolution for minor incident");
  const retryableDraft = "Route stays paused while recovery evidence is reviewed.";
  await resolution.fill(retryableDraft);
  await page.getByRole("button", { name: "Save resolution", exact: true }).click();
  await page.getByRole("alert").getByText("Advanced Voice controls are temporarily unavailable. No routing state changed.", { exact: true }).waitFor();
  if (incidentFailureEvidence.mutations !== 1 || await resolution.inputValue() !== retryableDraft) failures.push("platform-incident-resolution-retry: failed resolution did not preserve one exact retryable draft");
  if (!await page.getByRole("button", { name: "Save resolution", exact: true }).isEnabled()) failures.push("platform-incident-resolution-retry: failed resolution left the form busy");
});
await browser.close();

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.info("P3 tenant operations and platform support UI passed desktop/mobile overflow, console, and boundary checks.");
