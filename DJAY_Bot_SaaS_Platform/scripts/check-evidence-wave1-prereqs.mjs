#!/usr/bin/env node
/**
 * Wave 1 evidence prereqs — fails until Commerce/SQA paste-back env is present.
 * Does not invent Stripe Price IDs. Does not write to the database.
 */

const required = [
  ["STRIPE_PRODUCT_REF", "Stripe test Product id (prod_…)"],
  ["STRIPE_PRICE_REF", "Stripe test Price id (price_…)"],
  ["STRIPE_VERIFIED_AMOUNT_MINOR", "Catalogue first-term minor units (249900)"],
  ["PLATFORM_VERIFIER_USER_ID", "platform.users UUID"],
  ["BILLING_DATABASE_URL", "Billing/platform DB URL for mapping seed"],
  ["API_APP_URL", "Reachable API for smoke/abuse/merchant live"],
];

const missing = [];
for (const [key, hint] of required) {
  if (!process.env[key]?.trim()) missing.push(`  - ${key}: ${hint}`);
}

const amount = process.env.STRIPE_VERIFIED_AMOUNT_MINOR?.trim();
if (amount && amount !== "249900") {
  missing.push(`  - STRIPE_VERIFIED_AMOUNT_MINOR must be 249900 for flowbot_basic (got ${amount})`);
}

const product = process.env.STRIPE_PRODUCT_REF?.trim() || "";
const price = process.env.STRIPE_PRICE_REF?.trim() || "";
if (product && (product.includes("example") || product === "replace-with-stripe-price-id")) {
  missing.push("  - STRIPE_PRODUCT_REF looks like a placeholder — use a real prod_… id");
}
if (price && (price.includes("example") || price.startsWith("replace-"))) {
  missing.push("  - STRIPE_PRICE_REF looks like a placeholder — use a real price_… id");
}

console.log("Wave 1 evidence prereqs");
if (missing.length) {
  console.error("BLOCKED — missing or invalid:");
  for (const line of missing) console.error(line);
  console.error("\nSee docs/validation/wave1-commerce-escalation.md");
  process.exit(1);
}

console.log("OK — env present. Next:");
console.log("  1) DRY_RUN=true pnpm ops:stripe-mapping");
console.log("  2) pnpm ops:stripe-mapping");
console.log("  3) API_APP_URL=… pnpm qa:smoke-negatives");
console.log("  4) API_APP_URL=… pnpm qa:abuse-floor");
console.log("  5) STRIPE_TEST_READY=true pnpm qa:merchant-first-sku live");
process.exit(0);
