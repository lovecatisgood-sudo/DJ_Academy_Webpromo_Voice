#!/usr/bin/env node
/**
 * Phase 9 — abuse floor: flood register/login until 429.
 * Requires a running API with rate-limit store.
 */
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";

const API = (process.env.API_APP_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:3103").replace(/\/$/, "");
const PUBLIC = (process.env.PUBLIC_APP_URL || "http://127.0.0.1:3000").replace(/\/$/, "");

async function flood(label, url, count, bodyFactory) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  let saw429 = false;
  const statuses = [];
  for (let i = 0; i < count; i += 1) {
    const res = await page.request.post(url, {
      data: bodyFactory(i),
      headers: {
        Origin: PUBLIC,
        "Content-Type": "application/json",
      },
    });
    statuses.push(res.status());
    if (res.status() === 429) {
      saw429 = true;
      break;
    }
  }
  await browser.close();
  console.log(`${label}: statuses=${statuses.join(",")} saw429=${saw429}`);
  return saw429;
}

async function main() {
  const stamp = Date.now();
  const email = `abuse-floor-${stamp}@example.com`;

  // login-account limit: 8 / 15m
  const login429 = await flood(
    "login-account",
    `${API}/public/auth/login`,
    12,
    () => ({ email, password: "Definitely-Wrong-Pass-1!" }),
  );

  // register-account limit: 5 / 15m (same email)
  const register429 = await flood(
    "register-account",
    `${API}/public/auth/register`,
    8,
    () => ({
      idempotencyKey: randomUUID(),
      name: "Abuse Floor",
      email,
      businessName: "Abuse Floor Co",
      password: "Abuse-Floor-Pass-1!",
      locale: "en",
      timezone: "Asia/Bangkok",
      termsVersion: "terms-2026-07",
      privacyVersion: "privacy-2026-07",
      acceptTerms: true,
      acceptPrivacy: true,
    }),
  );

  if (!login429 && !register429) {
    console.error("FAIL: expected at least one 429 from login or register flood");
    process.exit(1);
  }
  console.log("PASS: abuse floor produced rate_limited responses");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
