import { spawn } from "node:child_process";
import { createDecipheriv, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { chromium } from "playwright";

const requireFromDb = createRequire(new URL("../packages/db/package.json", import.meta.url));
const postgres = requireFromDb("postgres");

const publicUrl = process.env.PUBLIC_APP_URL ?? "http://localhost:3100";
const tenantUrl = process.env.TENANT_APP_URL ?? "http://localhost:3101";
const apiUrl = process.env.API_APP_URL ?? "http://localhost:3103";
const appWorkspace = process.env.E2E_APP_WORKSPACE ?? new URL("..", import.meta.url).pathname;
const nodeWrapper = new URL("./use-node24.sh", import.meta.url).pathname;
const adminDatabaseUrl = process.env.ADMIN_DATABASE_URL;
const envelopeKeyValue = process.env.AUTH_EMAIL_ENVELOPE_KEY;

if (!adminDatabaseUrl || !envelopeKeyValue) {
  throw new Error("ADMIN_DATABASE_URL and AUTH_EMAIL_ENVELOPE_KEY are required.");
}

const envelopeKey = Buffer.from(envelopeKeyValue, "base64");
if (envelopeKey.length !== 32) throw new Error("AUTH_EMAIL_ENVELOPE_KEY must decode to 32 bytes.");

function openJson(envelope) {
  const [version, ivValue, tagValue, ciphertextValue] = envelope.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue) throw new Error("Invalid outbox envelope.");
  const decipher = createDecipheriv("aes-256-gcm", envelopeKey, Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return JSON.parse(Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8"));
}

async function waitFor(url, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError?.message ?? "unavailable"}`);
}

function stopProcessGroup(child) {
  if (!child?.pid || child.exitCode !== null) return;
  try { process.kill(-child.pid, "SIGTERM"); } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const sql = postgres(adminDatabaseUrl, { max: 1 });
const apps = [];
let browser;
const appLogs = [];

try {
  const appDefinitions = [
    ["public-site", new URL(publicUrl).port],
    ["tenant-web", new URL(tenantUrl).port],
    ["api", new URL(apiUrl).port],
  ];
  for (const [appName, port] of appDefinitions) {
    const appDirectory = `${appWorkspace}/apps/${appName}`;
    const child = spawn(nodeWrapper, [`${appDirectory}/node_modules/.bin/next`, "dev", "--webpack", "--port", port], {
      cwd: appDirectory,
      env: process.env,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    apps.push(child);
    for (const stream of [child.stdout, child.stderr]) {
      stream.setEncoding("utf8");
      stream.on("data", (chunk) => {
        appLogs.push(`[${appName}] ${chunk}`);
        if (appLogs.length > 300) appLogs.shift();
      });
    }
  }
  await Promise.all([
    waitFor(`${apiUrl}/api/health/live`),
    waitFor(`${publicUrl}/register`),
    waitFor(tenantUrl),
  ]);
  for (const legalUrl of [`${apiUrl}/public/legal?lang=en`, `${publicUrl}/public/legal?lang=en`]) {
    const response = await fetch(legalUrl);
    const body = await response.text();
    assert(response.ok, `Legal preflight failed at ${legalUrl}: ${response.status} ${body}`);
  }

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: "en-US", timezoneId: "Asia/Bangkok", bypassCSP: true });
  await context.addCookies([
    { name: "djay-locale", value: "en", url: publicUrl },
    { name: "djay-locale", value: "en", url: tenantUrl },
  ]);
  const page = await context.newPage();
  // The temporary source mirror uses webpack because Turbopack rejects dependency symlinks
  // outside its filesystem root. Only webpack's development runtime needs this CSP bypass;
  // production bundles remain covered by the application's unchanged security headers.
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const marker = randomUUID();
  const email = `signup-e2e-${marker}@example.test`;
  const password = `Local E2E ${marker} password!`;

  await page.goto(`${publicUrl}/register`);
  await page.locator('input[name="name"]').fill("E2E Owner");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="businessName"]').fill("E2E Survey Business");
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[name="passwordConfirmation"]').fill(password);
  await page.locator('input[name="acceptTerms"]').waitFor({ state: "visible" });
  await page.locator('input[name="acceptTerms"]:not(:disabled)').check();
  await page.locator('form button[type="submit"]').click();
  await page.getByRole("heading", { name: "ตรวจอีเมลของคุณ" }).waitFor();

  const outboxRows = await sql`
    SELECT outbox.payload_ciphertext
    FROM operations.outbox outbox
    JOIN identity.signup_intents signup ON signup.id = outbox.aggregate_id
    WHERE outbox.topic = 'auth.verify_email' AND signup.email_normalized = ${email}
  `;
  assert(outboxRows.length === 1, `Expected one verification email, found ${outboxRows.length}.`);
  const { verificationUrl } = openJson(outboxRows[0].payload_ciphertext);
  assert(typeof verificationUrl === "string" && verificationUrl.includes("#token="), "Verification URL was missing from the encrypted outbox.");

  await page.goto(verificationUrl);
  await page.getByRole("button", { name: "ยืนยันอีเมล" }).click();
  await page.getByRole("link", { name: "ไปหน้าเข้าสู่ระบบ" }).waitFor();
  await page.getByRole("link", { name: "ไปหน้าเข้าสู่ระบบ" }).click();

  async function signIn() {
    await page.locator("form").waitFor();
    await page.waitForFunction(() => {
      const form = document.querySelector("form");
      return Boolean(form && Object.keys(form).some((key) => key.startsWith("__reactProps")));
    });
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(/\/workspace\/setup(?:\?.*)?$/, { timeout: 30_000 });
  }

  await signIn();
  await page.getByRole("heading", { name: "What should your chatbot help with first?" }).waitFor();
  await page.locator('input[name="businessGoal"][value="book_appointments"]').check();
  await page.locator('select[name="industry"]').selectOption("education");
  await page.locator("form button.guided-primary").click();
  await page.getByRole("heading", { name: "Here are the conversations your chatbot should handle" }).waitFor();
  await page.locator("button.guided-primary").click();
  await page.getByText("Flow Bot access is not active yet.").waitFor();

  const stateRows = await sql`
    SELECT signup.provisioned_tenant_id AS tenant_id,
      onboarding.business_goal, onboarding.industry,
      onboarding.preferences_completed_at,
      (SELECT count(*)::int FROM tenancy.audit_logs audit
       WHERE audit.tenant_id = signup.provisioned_tenant_id
         AND audit.action = 'tenant.onboarding_conversations_reviewed'
         AND audit.result = 'succeeded') AS conversation_review_count,
      (SELECT count(*)::int FROM tenancy.memberships membership
       WHERE membership.tenant_id = signup.provisioned_tenant_id
         AND membership.role = 'tenant_master_admin' AND membership.status = 'active') AS owner_count,
      (SELECT count(*)::int FROM identity.legal_acceptances legal
       WHERE legal.tenant_id = signup.provisioned_tenant_id) AS legal_count
    FROM identity.signup_intents signup
    JOIN tenancy.tenant_onboarding onboarding ON onboarding.tenant_id = signup.provisioned_tenant_id
    WHERE signup.email_normalized = ${email}
  `;
  assert(stateRows.length === 1, "Expected exactly one provisioned onboarding record.");
  const firstState = stateRows[0];
  assert(firstState.business_goal === "book_appointments", "The selected business goal was not persisted.");
  assert(firstState.industry === "education", "The selected industry was not persisted.");
  assert(firstState.preferences_completed_at, "Survey completion timestamp was not persisted.");
  assert(firstState.conversation_review_count === 1, "Conversation review was not recorded exactly once.");
  assert(firstState.owner_count === 1, "Signup did not create exactly one active tenant owner.");
  assert(firstState.legal_count === 2, "Signup did not record both legal acceptances.");
  const completionTimestamp = new Date(firstState.preferences_completed_at).toISOString();

  async function assertSurveySkipped() {
    await page.getByText("Flow Bot access is not active yet.").waitFor();
    assert(await page.getByRole("heading", { name: "What should your chatbot help with first?" }).count() === 0, "The completed goal survey was shown again.");
    assert(await page.getByRole("heading", { name: "Here are the conversations your chatbot should handle" }).count() === 0, "The completed conversation review was shown again.");
  }

  await page.reload();
  await assertSurveySkipped();
  await page.goto(`${tenantUrl}/workspace/start`);
  await page.waitForURL(/\/workspace\/setup(?:\?.*)?$/, { timeout: 30_000 });
  await assertSurveySkipped();

  const logoutStatus = await page.evaluate(async () => (await fetch("/tenant/auth/logout", { method: "POST" })).status);
  assert(logoutStatus === 200, `Logout returned ${logoutStatus}.`);
  await page.goto(tenantUrl);
  await signIn();
  await assertSurveySkipped();

  const repeatedReviewStatus = await page.evaluate(async () => {
    const response = await fetch("/tenant/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "review_conversations" }),
    });
    return response.status;
  });
  assert(repeatedReviewStatus === 200, `Idempotent conversation review returned ${repeatedReviewStatus}.`);

  const finalRows = await sql`
    SELECT onboarding.preferences_completed_at,
      (SELECT count(*)::int FROM tenancy.audit_logs audit
       WHERE audit.tenant_id = signup.provisioned_tenant_id
         AND audit.action = 'tenant.onboarding_conversations_reviewed'
         AND audit.result = 'succeeded') AS conversation_review_count
    FROM identity.signup_intents signup
    JOIN tenancy.tenant_onboarding onboarding ON onboarding.tenant_id = signup.provisioned_tenant_id
    WHERE signup.email_normalized = ${email}
  `;
  assert(new Date(finalRows[0].preferences_completed_at).toISOString() === completionTimestamp, "Survey completion timestamp changed after revisit/login.");
  assert(finalRows[0].conversation_review_count === 1, "Repeated review created a duplicate completion event.");
  assert(pageErrors.length === 0, `Browser page errors: ${pageErrors.join(" | ")}`);

  console.log("PASS: signup, email verification, one-time survey persistence, revisit, logout/login, and idempotent completion all succeeded.");
} catch (error) {
  const recentLogs = appLogs.join("").split("\n").slice(-100).join("\n");
  console.error(recentLogs ? `\nRecent application logs:\n${recentLogs}` : "");
  throw error;
} finally {
  await browser?.close().catch(() => undefined);
  for (const child of apps) stopProcessGroup(child);
  await sql.end({ timeout: 5 }).catch(() => undefined);
}
