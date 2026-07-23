#!/usr/bin/env node
/**
 * Ops helper — upsert catalog.provider_price_mappings for flowbot_basic.
 * Requires a DB role that can INSERT/UPDATE catalog.provider_price_mappings (djay_platform).
 *
 * Env:
 *   BILLING_DATABASE_URL or ADMIN_DATABASE_URL or DATABASE_URL
 *   STRIPE_MAPPING_MODE=test|live
 *   STRIPE_PRODUCT_REF, STRIPE_PRICE_REF
 *   STRIPE_VERIFIED_AMOUNT_MINOR (integer THB minor units)
 *   PLATFORM_VERIFIER_USER_ID (uuid)
 *   DRY_RUN=true — print SQL only
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const require = createRequire(resolve(dirname(fileURLToPath(import.meta.url)), "../packages/db/package.json"));
const postgres = require("postgres");

const mode = (process.env.STRIPE_MAPPING_MODE || "test").trim();
const productRef = (process.env.STRIPE_PRODUCT_REF || "").trim();
const priceRef = (process.env.STRIPE_PRICE_REF || "").trim();
const amount = Number(process.env.STRIPE_VERIFIED_AMOUNT_MINOR || "");
const verifier = (process.env.PLATFORM_VERIFIER_USER_ID || "").trim();
const url = process.env.BILLING_DATABASE_URL || process.env.ADMIN_DATABASE_URL || process.env.DATABASE_URL;
const dryRun = process.env.DRY_RUN === "true";

const errors = [];
if (!["test", "live"].includes(mode)) errors.push("STRIPE_MAPPING_MODE must be test|live");
if (!productRef) errors.push("STRIPE_PRODUCT_REF required");
if (!priceRef) errors.push("STRIPE_PRICE_REF required");
if (!Number.isSafeInteger(amount) || amount < 0) errors.push("STRIPE_VERIFIED_AMOUNT_MINOR must be a non-negative integer");
if (!/^[0-9a-f-]{36}$/i.test(verifier)) errors.push("PLATFORM_VERIFIER_USER_ID must be a uuid");
if (!url && !dryRun) errors.push("BILLING_DATABASE_URL (or ADMIN_DATABASE_URL / DATABASE_URL) required");
if (errors.length) {
  console.error(errors.join("\n"));
  console.error("See docs/runbooks/stripe-price-mapping.md");
  process.exit(1);
}

const sqlText = `
WITH active_catalog AS (
  SELECT id FROM catalog.catalog_versions WHERE status = 'active' LIMIT 1
)
INSERT INTO catalog.provider_price_mappings (
  catalog_version_id, item_kind, item_key, provider_key, provider_mode,
  external_product_ref, external_price_ref, verified_amount_minor, verified_currency,
  status, verified_at, verified_by_platform_user_id
)
SELECT active_catalog.id, 'plan', 'flowbot_basic', 'stripe', $1,
  $2, $3, $4, 'THB', 'ready', now(), $5::uuid
FROM active_catalog
ON CONFLICT (catalog_version_id, item_kind, item_key, provider_key, provider_mode)
DO UPDATE SET
  external_product_ref = EXCLUDED.external_product_ref,
  external_price_ref = EXCLUDED.external_price_ref,
  verified_amount_minor = EXCLUDED.verified_amount_minor,
  status = 'ready',
  verified_at = now(),
  verified_by_platform_user_id = EXCLUDED.verified_by_platform_user_id
RETURNING id, provider_mode, external_price_ref, status, verified_amount_minor;
`;

if (dryRun) {
  console.log("DRY_RUN — would upsert flowbot_basic mapping:");
  console.log({ mode, productRef, priceRef, amount, verifier });
  console.log(sqlText.trim());
  process.exit(0);
}

const sql = postgres(url, { max: 1 });
try {
  const rows = await sql.unsafe(sqlText, [mode, productRef, priceRef, amount, verifier]);
  if (!rows.length) {
    console.error("FAIL: no active catalog.catalog_versions row");
    process.exit(1);
  }
  console.log("OK mapped flowbot_basic:", rows[0]);
} finally {
  await sql.end({ timeout: 5 });
}
