#!/usr/bin/env node
/**
 * Guard against unevidenced commercial claims on public, prospect-facing surfaces.
 *
 * The public site previously advertised "Increase lead conversion by up to 50%", "Warm leads
 * +50%", "Manual follow-up -70%", and "Channels 4" while the release registry reported zero
 * accepted requirements and no merchant connection flow for three of those four channels.
 * That is a trust, refund, and mis-selling exposure, and nothing in the build detected it.
 *
 * Rule: a quantified claim on a public surface must have a defined metric, a source, and a
 * baseline recorded as release evidence. Until such evidence is accepted, the honest move is
 * to describe what the product does rather than what it achieves.
 *
 * This checker therefore rejects quantified claims in user-visible strings and requires that
 * every advertised product or channel carry an explicit availability state.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Surfaces a prospect can read before they have an account. */
const PUBLIC_SURFACES = ["apps/public-site/app"];

/**
 * Quantified-claim shapes. Each pattern targets marketing arithmetic, not incidental numbers:
 * CSS lengths, HTTP statuses, and character limits must not trip this.
 */
const CLAIM_PATTERNS = [
  { name: "percentage", pattern: /\b\d{1,3}(?:\.\d+)?\s?%/ },
  { name: "signed-delta", pattern: /[+−-]\s?\d{1,3}(?:\.\d+)?\s?%/ },
  { name: "multiplier", pattern: /\b\d{1,3}(?:\.\d+)?\s?[x×]\b/i },
  { name: "vague-quantifier", pattern: /\bup to\s+\d/i },
];

/**
 * Evidence allowlist. To advertise a quantified claim, add it here with the release-evidence
 * file that defines its metric, source, and baseline — and make sure that file exists.
 *
 * Deliberately empty: no quantified commercial claim currently has accepted evidence.
 */
const ALLOWED_CLAIMS = [
  // { text: "…", evidence: "docs/validation/…md" },
];

/** Products and channels must declare one of these states. */
const AVAILABILITY_STATES = ["active", "pilot", "preview", "unavailable"];

const errors = [];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(tsx|ts)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * Extract only the strings a visitor can actually read: JSX text nodes and string literals.
 * Comments are excluded so that this file's own explanatory prose — and the historical
 * examples in it — cannot trip the checker it documents.
 */
function userVisibleStrings(source) {
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
  const found = [];
  for (const match of withoutComments.matchAll(/"([^"\n]{2,})"|'([^'\n]{2,})'|`([^`]{2,})`/g)) {
    found.push(match[1] ?? match[2] ?? match[3]);
  }
  // JSX text between tags, e.g. <strong>+50%</strong>
  for (const match of withoutComments.matchAll(/>([^<>{}\n]{2,})</g)) {
    found.push(match[1]);
  }
  return found;
}

function isAllowed(text) {
  return ALLOWED_CLAIMS.some((entry) => text.includes(entry.text));
}

for (const surface of PUBLIC_SURFACES) {
  const dir = resolve(root, surface);
  for (const file of walk(dir)) {
    const rel = relative(root, file);
    const source = readFileSync(file, "utf8");
    const lines = source.split("\n");

    for (const text of userVisibleStrings(source)) {
      const trimmed = text.trim();
      if (!trimmed || isAllowed(trimmed)) continue;
      for (const { name, pattern } of CLAIM_PATTERNS) {
        if (!pattern.test(trimmed)) continue;
        const lineNumber = lines.findIndex((line) => line.includes(trimmed)) + 1;
        errors.push(
          `${rel}${lineNumber ? `:${lineNumber}` : ""} unevidenced ${name} claim in public copy: ${JSON.stringify(trimmed)}\n`
          + "    Either remove the figure or add it to ALLOWED_CLAIMS with an accepted evidence file.",
        );
      }
    }
  }
}

// Every allowlisted claim must point at an evidence file that exists.
for (const entry of ALLOWED_CLAIMS) {
  try {
    statSync(resolve(root, entry.evidence));
  } catch {
    errors.push(`allowlisted claim ${JSON.stringify(entry.text)} cites missing evidence ${entry.evidence}`);
  }
}

/**
 * The landing page must keep declaring availability per advertised product. If a channel list
 * is present, every channel also needs a state. A deferred channel does not need to be advertised.
 */
const landing = readFileSync(resolve(root, "apps/public-site/app/page.tsx"), "utf8");

if (!/availabilityLabels/.test(landing)) {
  errors.push("apps/public-site/app/page.tsx must declare availabilityLabels so every advertised capability shows an explicit state");
}
for (const list of ["productPillars"]) {
  const block = landing.match(new RegExp(`const ${list}\\s*=\\s*\\[([\\s\\S]*?)\\n\\];`));
  if (!block) {
    errors.push(`apps/public-site/app/page.tsx must declare ${list}`);
    continue;
  }
  const entries = block[1].match(/title:/g) ?? [];
  const states = block[1].match(/availability:\s*"([a-z]+)"/g) ?? [];
  if (entries.length !== states.length) {
    errors.push(`apps/public-site/app/page.tsx ${list}: ${entries.length} entries but ${states.length} availability states — every entry needs one`);
  }
  for (const state of states) {
    const value = state.match(/"([a-z]+)"/)[1];
    if (!AVAILABILITY_STATES.includes(value)) {
      errors.push(`apps/public-site/app/page.tsx ${list}: unknown availability state ${JSON.stringify(value)} (expected ${AVAILABILITY_STATES.join(", ")})`);
    }
  }
}
const channelBlock = landing.match(/const channelStates\s*=\s*\[([\s\S]*?)\n\];/);
if (channelBlock) {
  const entries = channelBlock[1].match(/title:/g) ?? [];
  const states = channelBlock[1].match(/availability:\s*"([a-z]+)"/g) ?? [];
  if (entries.length !== states.length) {
    errors.push(`apps/public-site/app/page.tsx channelStates: ${entries.length} entries but ${states.length} availability states - every advertised channel needs one`);
  }
}

// Instagram, Messenger, and WhatsApp have no merchant connection flow. Advertising any of
// them as usable is the exact defect this checker exists to prevent.
for (const channel of ["Instagram", "Facebook Messenger", "WhatsApp"]) {
  const entry = landing.match(new RegExp(`title:\\s*"${channel}",\\s*availability:\\s*"([a-z]+)"`));
  if (entry && entry[1] !== "unavailable") {
    errors.push(
      `apps/public-site/app/page.tsx advertises ${channel} as "${entry[1]}" but no merchant connection flow exists for it.\n`
      + "    Keep it \"unavailable\" until Meta App Review evidence is accepted.",
    );
  }
}

if (errors.length) {
  console.error(`Public claim check FAILED (${errors.length} issue${errors.length === 1 ? "" : "s"}):\n`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Public claim check passed: no unevidenced quantified claims; all advertised capabilities carry an availability state.");
