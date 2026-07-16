import { chromium } from "playwright";

const platformUrl = process.env.P9_PLATFORM_QA_URL || "http://127.0.0.1:3112";
const browser = await chromium.launch({ headless: true });
const failures = [];
const restricted = /\b(openai|anthropic|claude|gemini|gpt-[0-9]|provider[_ -]?(?:key|name|id)|model[_ -]?id|native usage|raw cost|margin)\b/i;
const now = new Date("2026-07-16T09:00:00Z");

const serviceLabels = [
  "Website and signup", "Workspace and API", "Flow automation", "AI conversations",
  "Messaging channels", "Voice conversations", "Background processing",
];

const readiness = {
  asOf: now.toISOString(), environment: "staging", releaseVersion: "p9-readiness-qa",
  status: "blocked",
  services: serviceLabels.map((publicLabel, index) => ({
    serviceKey: `service_${index + 1}`, publicLabel,
    status: index === 3 ? "failing" : "passing", passing: index !== 3,
    issues: index === 3 ? ["Availability is below the objective."] : [],
    objective: {
      availabilityTargetBasisPoints: index < 2 ? 9990 : 9950,
      latencyP95TargetMs: index === 3 ? 8000 : 1500,
      maxQueueAgeSeconds: index >= 2 && index !== 5 ? 120 : null,
      maxDeadLetters: 0, minimumSampleCount: 100,
      minimumWindowMinutes: 1440, maximumAgeMinutes: 30,
    },
    observation: {
      windowEnd: now.toISOString(), availabilityBasisPoints: index === 3 ? 9800 : 10000,
      latencyP95Ms: 740, queueAgeSeconds: index >= 2 && index !== 5 ? 12 : null,
      deadLetterCount: 0, sampleCount: 1200, sourceReference: `monitor:qa-${index + 1}`,
    },
  })),
  attestations: [
    "on_call", "restore", "support_runbook", "security_review", "privacy_review",
    "event_replay", "queue_recovery", "pool_exhaustion", "dependency_outage",
  ].map((kind) => ({
    kind, passing: true, status: "passed", validUntil: "2026-08-16T09:00:00Z",
    sourceReference: `evidence:${kind}-qa`,
  })),
  incidents: { passing: true, blocking: 0, oldestOpenedAt: null },
  usage: { passing: false, status: "attention", attentionAccounts: 1, activeWithoutCurrentAccount: 0, orphanUsageEvents: 0, expiredOpenReservations: 0 },
};

const reconciliation = {
  asOf: now.toISOString(),
  status: "attention",
  summary: {
    quotaAccounts: 2, displayedAccounts: 2, healthyAccounts: 1,
    attentionAccounts: 1, activeWithoutCurrentAccount: 0,
    orphanUsageEvents: 0, expiredOpenReservations: 0,
  },
  accounts: [
    {
      quotaAccountId: "92000000-0000-4000-8000-000000000001",
      tenantId: "20000000-0000-4000-8000-000000000001",
      businessName: "Siam Growth Studio", productKey: "ai_chat",
      publicName: "AI Chatbot Premium", customerUnit: "ai_response",
      periodStart: "2026-07-01T00:00:00Z", periodEnd: "2026-08-01T00:00:00Z",
      accountReserved: 4, reservationReserved: 4, accountSettled: 433,
      reservationSettled: 432, settledEvents: 432, creditedEvents: 0,
      waivedEvents: 0, netSettledEvents: 432, openReservations: 4,
      expiredOpenReservations: 0, reservedVariance: 0, settledVariance: 1,
      eventVariance: 0, status: "attention",
    },
    {
      quotaAccountId: "92000000-0000-4000-8000-000000000002",
      tenantId: "20000000-0000-4000-8000-000000000002",
      businessName: "Bangkok Service Studio", productKey: "flowbot",
      publicName: "FlowBot Basic", customerUnit: "flow_execution",
      periodStart: "2026-07-01T00:00:00Z", periodEnd: "2026-08-01T00:00:00Z",
      accountReserved: 0, reservationReserved: 0, accountSettled: 87,
      reservationSettled: 87, settledEvents: 87, creditedEvents: 0,
      waivedEvents: 0, netSettledEvents: 87, openReservations: 0,
      expiredOpenReservations: 0, reservedVariance: 0, settledVariance: 0,
      eventVariance: 0, status: "healthy",
    },
  ],
};

function json(route, value, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
}

async function mockPlatform(page, role, recoveryMode) {
  const calls = { recoveryRequests: 0, recoveryReviews: 0 };
  await page.route("**/platform/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/platform/me") return json(route, { user: {
      id: role,
      displayName: role.replace("platform_", "").replaceAll("_", " "),
      role, mfaVerifiedAt: now.toISOString(),
    } });
    if (path === "/platform/health-summary") return json(route, { health: { platformUsers: 4, activeSessions: 2 } });
    if (path === "/platform/release-readiness") {
      const roleReadiness = structuredClone(readiness);
      if (!["platform_owner", "platform_finance"].includes(role)) {
        roleReadiness.usage = { passing: false, status: "attention" };
      }
      return json(route, { readiness: roleReadiness });
    }
    if (path === "/platform/commerce-overview") return json(route, { commerce: { tenants: 18, subscriptions: 31, pending: 2, active: 29 } });
    if (path === "/platform/usage-reconciliation") return json(route, { reconciliation });
    if (path === "/platform/subscriptions") return json(route, { subscriptions: [] });
    if (path === "/platform/tenants") return json(route, { tenants: [] });
    if (path === "/platform/support-grants") return json(route, { grants: [] });
    if (path === "/platform/dead-letter-recovery" && route.request().method() === "GET" && recoveryMode === "error") return json(route, { status: "temporarily_unavailable" }, 503);
    if (path === "/platform/dead-letter-recovery" && route.request().method() === "GET") return json(route, { recovery: {
      recoverable: [{
        recordKind: "recoverable", recordId: "94000000-0000-4000-8000-000000000001",
        queueKind: "system_email", itemId: "94000000-0000-4000-8000-000000000001",
        attemptCount: 8, safeErrorCode: "delivery_rejected", occurredAt: now.toISOString(), status: "dead_letter",
      }],
      requests: [{
        recordKind: "request", recordId: "94000000-0000-4000-8000-000000000002",
        queueKind: "flowbot_email", itemId: "94000000-0000-4000-8000-000000000003",
        attemptCount: 8, occurredAt: now.toISOString(), status: "requested",
        reason: "Root cause corrected; permit one idempotent email retry.",
        requestedByPlatformUserId: "platform_support", reviewedByPlatformUserId: null,
      }],
      policy: {
        replayableQueueKinds: ["system_email", "flowbot_email", "ai_chat_email"],
        excludedQueueKinds: ["flowbot_webhook", "social_inbound", "social_delivery"],
      },
    } });
    if (path === "/platform/dead-letter-recovery" && route.request().method() === "POST") {
      calls.recoveryRequests += 1;
      return json(route, { status: "requested", requestId: "94000000-0000-4000-8000-000000000004" }, 202);
    }
    if (path.endsWith("/review")) {
      calls.recoveryReviews += 1;
      return json(route, { status: "applied" });
    }
    if (path === "/platform/voice/runtime-control") return json(route, { control: {
      mode: "paused", reasonCode: "pre_release", version: 1, changedAt: now.toISOString(),
      activeSessions: 0, reconnectingSessions: 0, expiredGrants: 0, staleConnections: 0,
    } });
    if (path === "/platform/voice/routing") return json(route, { routing: {
      admissionEnabled: false, admissionChanges: [], candidates: [], changes: [], incidents: [],
      profiles: [{ capabilityProfile: "voice_gen2", mode: "paused", reasonCode: "qualification_required", version: 1, changedAt: now.toISOString(), primaryCandidateId: null, canaryCandidateId: null, canaryPercent: 0 }],
    } });
    if (path === "/platform/voice/incidents") return json(route, { incidents: [] });
    return json(route, { status: "not_found" }, 404);
  });
  return calls;
}

async function inspect(name, role, viewport, recoveryMode = "ready") {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on("pageerror", (error) => failures.push(`${name}: page error ${error.message}`));
  page.on("console", (entry) => {
    if (entry.type() === "error" && !(recoveryMode === "error" && entry.text().includes("503"))) {
      failures.push(`${name}: console ${entry.text()}`);
    }
  });
  const calls = await mockPlatform(page, role, recoveryMode);
  const response = await page.goto(platformUrl, { waitUntil: "networkidle" });
  if (!response?.ok()) failures.push(`${name}: navigation ${response?.status()}`);
  if (["platform_owner", "platform_finance"].includes(role)) {
    await page.getByRole("heading", { name: "Usage reconciliation" }).waitFor();
  }
  await page.getByRole("heading", { name: "Public release readiness" }).waitFor();
  await page.getByText("Release blocked", { exact: true }).waitFor();
  if (role === "platform_support" && recoveryMode === "ready") {
    await page.getByLabel("Eligible dead letter").selectOption({ index: 1 });
    await page.getByLabel("Root-cause and replay reason").fill("Root cause corrected; approve one idempotent retry.");
    await page.getByRole("button", { name: "Request replay" }).click();
    await page.waitForLoadState("networkidle");
    if (calls.recoveryRequests !== 1) failures.push(`${name}: recovery request was not submitted once`);
  }
  if (role === "platform_owner" && recoveryMode === "ready") {
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Approve one retry" }).click();
    await page.waitForLoadState("networkidle");
    if (calls.recoveryReviews !== 1) failures.push(`${name}: recovery approval was not submitted once`);
  }
  const snapshot = await page.evaluate(() => ({
    body: document.body.innerText,
    reconciliation: document.querySelector(".reconciliation-band")?.textContent || "",
    readiness: document.querySelector(".release-readiness-band")?.textContent || "",
    width: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  if (snapshot.width > snapshot.viewport + 1) failures.push(`${name}: horizontal overflow ${snapshot.width}/${snapshot.viewport}`);
  if (restricted.test(snapshot.reconciliation)) failures.push(`${name}: restricted cost or routing identity visible in reconciliation`);
  if (restricted.test(snapshot.readiness)) failures.push(`${name}: restricted cost or routing identity visible in release readiness`);
  if (!snapshot.readiness.includes("6/7") || !snapshot.readiness.includes("AI conversations") || !snapshot.readiness.toLowerCase().includes("fail-closed")) failures.push(`${name}: actionable release evidence missing`);
  if (!snapshot.readiness.includes("9/9") || !snapshot.readiness.includes("nine time-limited operational attestations") || !snapshot.readiness.toLowerCase().includes("event replay") || !snapshot.readiness.toLowerCase().includes("pool exhaustion") || !snapshot.readiness.toLowerCase().includes("dependency outage")) failures.push(`${name}: resilience drill evidence missing`);
  if (["platform_owner", "platform_finance"].includes(role) && (!snapshot.body.toLowerCase().includes("attention required") || !snapshot.body.includes("Siam Growth Studio"))) failures.push(`${name}: actionable variance evidence missing`);
  if (["platform_owner", "platform_finance"].includes(role) && !snapshot.body.includes("does not enable charging")) failures.push(`${name}: commercial boundary missing`);
  if (role === "platform_owner" && !snapshot.body.includes("Platform Owner review")) failures.push(`${name}: owner authority guidance missing`);
  if (role === "platform_finance" && (!snapshot.body.includes("Finance review") || !snapshot.body.includes("Read-only evidence"))) failures.push(`${name}: finance authority guidance missing`);
  if (role === "platform_support" && !snapshot.body.includes("Keep on-call and support-runbook evidence current")) failures.push(`${name}: support release guidance missing`);
  if (role === "platform_ai_operations" && !snapshot.body.includes("Resolve failing runtime objectives")) failures.push(`${name}: AI Operations release guidance missing`);
  const recoveryVisible = snapshot.body.includes("Reviewed dead-letter replay");
  if (["platform_owner", "platform_support", "platform_ai_operations"].includes(role) && recoveryMode === "ready" && !recoveryVisible) failures.push(`${name}: reviewed recovery workflow missing`);
  if (recoveryMode === "error" && (!snapshot.body.includes("Recovery controls unavailable") || !snapshot.body.includes("Do not use direct SQL"))) failures.push(`${name}: fail-closed recovery error guidance missing`);
  if (role === "platform_finance" && recoveryVisible) failures.push(`${name}: Finance received recovery authority`);
  if (recoveryVisible && (!snapshot.body.includes("durable idempotency key") || !snapshot.body.includes("cannot be proven safe to repeat"))) failures.push(`${name}: recovery safety boundary missing`);
  if (recoveryVisible && /secret-recipient|payload_ciphertext|tenant_id/i.test(snapshot.body)) failures.push(`${name}: recovery confidentiality leak`);
  if (recoveryMode === "ready" && ["platform_support", "platform_ai_operations"].includes(role) && !(await page.getByRole("button", { name: "Request replay" }).isVisible())) failures.push(`${name}: recovery request authority missing`);
  await page.screenshot({ path: `/tmp/djay-p9-operations-${name}.png`, fullPage: true });
  await context.close();
}

await inspect("owner-desktop", "platform_owner", { width: 1365, height: 900 });
await inspect("finance-mobile", "platform_finance", { width: 390, height: 844 });
await inspect("support-desktop", "platform_support", { width: 1280, height: 800 });
await inspect("ai-operations-mobile", "platform_ai_operations", { width: 390, height: 844 });
await inspect("support-recovery-error-mobile", "platform_support", { width: 390, height: 844 }, "error");
await browser.close();

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.info("P9 operations UI passed Owner, Finance, Support, and AI Operations release-readiness, reviewed recovery, reconciliation, authority, overflow, commercial-boundary, console, and confidentiality checks.");
