import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const demoPath = resolve(root, "docs/design/djay-bots-saas-owner-analytics-full-flow.html");
const source = readFileSync(demoPath, "utf8");
const errors = [];

const requiredRoutes = [
  "/operations/overview",
  "/merchants",
  "/merchants/[tenantId]",
  "/users",
  "/users/[userId]",
  "/subscriptions",
  "/subscriptions/[subscriptionId]",
  "/revenue",
  "/usage/text",
  "/usage/voice",
  "/models",
  "/trials",
  "/reports",
  "/alerts",
  "/exports",
  "/exports/[exportId]",
];

const requiredRoles = ["Platform Owner", "Platform Finance", "AI Operations", "Platform Support"];
const requiredStates = ["Default", "True zero", "Empty", "Delayed", "Incomplete", "Reconciliation required", "Unavailable", "Read error"];
const requiredBoundaries = [
  "Merchant end customers excluded",
  "Merchant subscription start",
  "Committed AI replies",
  "Exact connected seconds",
  "Provider confidentiality",
  "Recent assurance required",
  "Secrets, payment instruments, end-customer messages, transcripts, recordings and raw contacts",
  "Illustrative data only",
  "page-by-page review",
  "100 results per page",
  "Merchant name",
  "Company role",
  "Membership state",
  "First join date",
  "Merchant subscription start",
  "Expiry or access end",
  "Subscribed products",
  "Personal contact details",
  "Primary email",
  "Personal contact address",
  "Platform Owner only",
  "Recent assurance",
  "Net revenue",
  "Operational net collected",
  "Daily",
  "Monthly",
  "View exact values as a table",
  "Definition net_collected v1",
];

for (const route of requiredRoutes) {
  if (!source.includes(`route:\"${route}\"`)) errors.push(`missing canonical route: ${route}`);
}
for (const role of requiredRoles) {
  if (!source.includes(role)) errors.push(`missing role projection: ${role}`);
}
for (const state of requiredStates) {
  if (!source.includes(`>${state}<`)) errors.push(`missing presentation state: ${state}`);
}
for (const boundary of requiredBoundaries) {
  if (!source.includes(boundary)) errors.push(`missing contract boundary: ${boundary}`);
}

if (source.includes("—") || source.includes("–")) errors.push("demo contains a disallowed dash character");
if (/https?:\/\//.test(source)) errors.push("demo must not depend on remote resources");
if (!source.includes("@media (max-width: 820px)")) errors.push("mobile shell breakpoint is missing");
if (!source.includes("prefers-reduced-motion")) errors.push("reduced-motion handling is missing");
if (!source.includes('class="skip"')) errors.push("keyboard skip link is missing");
if (!source.includes('tabindex="0" data-row')) errors.push("keyboard-operable table rows are missing");

const script = source.match(/<script>([\s\S]*)<\/script>/)?.[1];
if (!script) {
  errors.push("embedded demo script is missing");
} else {
  try {
    Function(script);
  } catch (error) {
    errors.push(`embedded demo script does not parse: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

console.info(`Platform Owner analytics demo QA passed: ${requiredRoutes.length} routes, ${requiredRoles.length} roles, ${requiredStates.length} data states.`);
