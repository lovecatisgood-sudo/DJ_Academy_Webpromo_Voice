#!/usr/bin/env node
/**
 * Phase 13 / G7 — sellable flip readiness gate.
 *
 * Default: asserts no package is sellable (safe CI).
 * Flip mode: AUTHORIZE_SELLABLE_FLIP=true allows flowbot_basic only when
 * docs/validation/phase13-sellable-g7.md contains all required PASS markers.
 *
 * Never invents Stripe/privacy evidence — operators must write PASS lines.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const errors = [];
const notes = [];

function read(rel) {
  const path = resolve(root, rel);
  if (!existsSync(path)) {
    errors.push(`missing ${rel}`);
    return "";
  }
  return readFileSync(path, "utf8");
}

const registry = JSON.parse(read("requirements/market-release-v1.yaml") || "{}");
const packages = registry.packages ?? [];
for (const pkg of packages) {
  if (pkg.plan_key === "flowbot_basic") continue;
  if (pkg.sellable === true) {
    errors.push(`${pkg.plan_key} must remain sellable=false (SKU1-only program)`);
  }
}

const flowbot = packages.find((pkg) => pkg.plan_key === "flowbot_basic");
if (!flowbot) errors.push("flowbot_basic missing from market-release-v1.yaml packages");

const catalogSrc = read("packages/catalog/src/index.ts");
if (catalogSrc.includes("flowbot_premium") && /flowbot_premium:[\s\S]*?sellable:\s*true/.test(catalogSrc)) {
  errors.push("catalog flowbot_premium must not be sellable");
}

const evidence = read("docs/validation/phase13-sellable-g7.md");
const requiredArtifacts = [
  "docs/runbooks/customer-support-sku1.md",
  "docs/runbooks/sellable-kill-switch.md",
  "docs/validation/named-merchant-worksheet-sku1.md",
  "docs/compliance/sku1-requirement-acceptance-list.md",
];
for (const rel of requiredArtifacts) {
  if (!existsSync(resolve(root, rel))) errors.push(`missing artifact ${rel}`);
}

const authorize = process.env.AUTHORIZE_SELLABLE_FLIP === "true";
const yamlSellable = flowbot?.sellable === true;
const catalogSellable = /flowbot_basic:\s*\{[\s\S]*?sellable:\s*true/.test(catalogSrc);

if (yamlSellable || catalogSellable) {
  if (!authorize) {
    errors.push("flowbot_basic is sellable but AUTHORIZE_SELLABLE_FLIP=true was not set");
  }
  const markers = [
    "G6_PASS: true",
    "G6B_PASS: true",
    "G6C_PASS: true",
    "G6E_PASS: true",
    "KILL_SWITCH_DRILL_UTC:",
    "STAGING_SOAK_END_UTC:",
    "NAMED_MERCHANT_SIGNED: true",
    "PO_SIGN: true",
  ];
  for (const marker of markers) {
    if (!evidence.includes(marker)) {
      errors.push(`phase13 evidence missing marker ${marker}`);
    }
  }
  if (evidence.includes("G6D_PASS: false")) {
    notes.push("WARN: G6d marked false — production flip strongly discouraged");
  }
} else {
  notes.push("flowbot_basic remains sellable=false (ready-to-flip package only)");
  // Prerequisite honesty: report open gates from phase docs if present
  const openChecks = [
    ["docs/validation/phase9-e2e-pentest.md", "staging evidence open"],
    ["docs/validation/phase10-privacy-g6c.md", "counsel sign-off open"],
    ["docs/validation/phase11-commercial-g6e.md", "Stripe live_ready evidence open"],
    ["docs/validation/phase12-reliability-g6d.md", "staging apply + drill evidence open"],
  ];
  for (const [rel, needle] of openChecks) {
    const text = read(rel);
    if (text.includes(needle) || /evidence open|sign-off open/i.test(text)) {
      notes.push(`OPEN: ${rel} still reports open evidence`);
    }
  }
}

if (errors.length) {
  console.error("SELLABLE FLIP GATE FAIL\n" + errors.join("\n"));
  process.exit(1);
}
console.log("SELLABLE FLIP GATE OK");
for (const note of notes) console.log(`- ${note}`);
if (!authorize) {
  console.log("To flip later: complete phase13 markers, set sellable=true, then AUTHORIZE_SELLABLE_FLIP=true pnpm gate:sellable-flip");
}
