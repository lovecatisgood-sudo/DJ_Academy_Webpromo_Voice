#!/usr/bin/env node
/**
 * Phase 9 / G6 — Merchant first-SKU journey (unmocked).
 *
 * Modes:
 *   plan  — print the staging journey and required env (default; no network)
 *   live  — run Playwright against real PUBLIC/TENANT/API URLs with NO page.route mocks
 *
 * Live journey (requires staging + Stripe test mapping):
 *   register → verify email → pay (Stripe test) → /workspace/setup →
 *   widget conversation on allowed origin → conversation visible in Inbox
 *
 * Env (live):
 *   PUBLIC_APP_URL, TENANT_APP_URL, API_APP_URL
 *   MERCHANT_EMAIL, MERCHANT_PASSWORD (optional; otherwise generated)
 *   STRIPE_TEST_READY=true  — set only when flowbot_basic test price is mapped
 *   SKIP_STRIPE=true        — stop after register/login if Stripe not ready
 */

const mode = (process.argv[2] || process.env.QA_MERCHANT_MODE || "plan").toLowerCase();

const requiredLive = ["PUBLIC_APP_URL", "TENANT_APP_URL", "API_APP_URL"];

function printPlan() {
  const steps = [
    "1. Register a new merchant on PUBLIC_APP_URL (paid-first flowbot_basic intent).",
    "2. Complete email verification (mailbox or staging verify helper).",
    "3. Sign in on TENANT_APP_URL; land on Overview/Setup per role home.",
    "4. Continue to payment on Usage; complete Stripe Checkout test card.",
    "5. Confirm webhook activates FlowBot access (accessMode=active).",
    "6. Finish /workspace/setup: profile → template/publish → deploy (exact HTTPS origin) → live test.",
    "7. Open the allowed origin with the install snippet; complete one current-version journey.",
    "8. Refresh onboarding evidence; confirm launchReady; conversation appears in Inbox.",
    "9. Capture axe reports for Setup, Inbox, and Usage?checkout=return (see pen-test doc).",
  ];
  console.log("Phase 9 merchant first-SKU journey (plan mode)\n");
  for (const step of steps) console.log(step);
  console.log("\nLive run:");
  console.log("  QA_MERCHANT_MODE=live PUBLIC_APP_URL=... TENANT_APP_URL=... API_APP_URL=... \\");
  console.log("    pnpm qa:merchant-first-sku live");
  console.log("\nEvidence template: docs/validation/p-first-sku-e2e.md");
  console.log("Pen-test checklist: docs/validation/pen-test-lite-first-sku.md");
}

async function runLive() {
  const missing = requiredLive.filter((key) => !process.env[key]?.trim());
  if (missing.length) {
    throw new Error(`Missing required env for live mode: ${missing.join(", ")}`);
  }
  const publicUrl = process.env.PUBLIC_APP_URL.replace(/\/$/, "");
  const tenantUrl = process.env.TENANT_APP_URL.replace(/\/$/, "");
  const apiUrl = process.env.API_APP_URL.replace(/\/$/, "");
  const stripeReady = process.env.STRIPE_TEST_READY === "true";
  const skipStripe = process.env.SKIP_STRIPE === "true" || !stripeReady;
  const email = process.env.MERCHANT_EMAIL || `merchant+${Date.now()}@example.test`;
  const password = process.env.MERCHANT_PASSWORD || `Djay-Test-${Date.now()}!aA1`;

  const { chromium } = await import("playwright");
  const AxeBuilder = (await import("@axe-core/playwright")).default;
  const browser = await chromium.launch({ headless: true });
  const failures = [];

  async function axe(page, name) {
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    for (const violation of result.violations) {
      failures.push(`${name}: axe ${violation.id} (${violation.impact || "unknown"}): ${violation.help}`);
    }
  }

  try {
    const health = await fetch(`${apiUrl}/health/live`).catch(() => null);
    if (!health?.ok) throw new Error(`API health check failed at ${apiUrl}/health/live`);

    const context = await browser.newContext();
    const page = await context.newPage();

    // Intentionally no page.route mocks — all traffic hits real apps.
    await page.goto(`${publicUrl}/`, { waitUntil: "domcontentloaded" });
    await page.goto(`${publicUrl}/register`, { waitUntil: "domcontentloaded" }).catch(async () => {
      await page.goto(publicUrl, { waitUntil: "domcontentloaded" });
    });

    const emailField = page.getByLabel(/email/i).first();
    if (await emailField.count()) {
      await emailField.fill(email);
      const passwordField = page.getByLabel(/^password$/i).first();
      if (await passwordField.count()) await passwordField.fill(password);
      const submit = page.getByRole("button", { name: /create|register|sign up/i }).first();
      if (await submit.count()) await submit.click();
      await page.waitForTimeout(1500);
    } else {
      failures.push("register: email field not found — confirm PUBLIC_APP_URL registration route");
    }

    await page.goto(`${tenantUrl}/`, { waitUntil: "domcontentloaded" });
    await axe(page, "tenant-login");

    if (skipStripe) {
      console.log("Stripe test path skipped (set STRIPE_TEST_READY=true to continue through pay→wizard→inbox).");
      console.log(`Prepared merchant credentials (if register UI succeeded): ${email}`);
    } else {
      // Remaining steps require verified email + Stripe test mapping on staging.
      await page.goto(`${tenantUrl}/workspace/usage`, { waitUntil: "domcontentloaded" });
      await axe(page, "usage-checkout");
      await page.goto(`${tenantUrl}/workspace/setup`, { waitUntil: "domcontentloaded" });
      await axe(page, "setup-wizard");
      await page.goto(`${tenantUrl}/workspace/inbox`, { waitUntil: "domcontentloaded" });
      await axe(page, "inbox");
      failures.push(
        "live Stripe→widget→inbox automation is operator-gated: complete payment and widget journey manually, then re-run with evidence attached to docs/validation/p-first-sku-e2e.md",
      );
    }

    if (failures.length) {
      console.error(failures.join("\n"));
      process.exitCode = 1;
    } else {
      console.log(`Merchant first-SKU live bootstrap passed against ${publicUrl} / ${tenantUrl} / ${apiUrl}`);
    }
  } finally {
    await browser.close();
  }
}

if (mode === "live") {
  await runLive();
} else {
  printPlan();
}
