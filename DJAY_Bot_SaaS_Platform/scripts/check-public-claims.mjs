#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const builder = readFileSync(resolve(root, "docs/design/djay-bot-text-voice-configuration-flow.html"), "utf8");
const errors = [];

const unevidencedClaims = [
  /increase[^<\n]{0,80}\b\d{1,3}(?:\.\d+)?\s?%/i,
  /conversion[^<\n]{0,80}\b\d{1,3}(?:\.\d+)?\s?%/i,
  /[+−]\s?\d{1,3}(?:\.\d+)?\s?%/,
  /\b\d{1,3}(?:\.\d+)?\s?[x×]\b/i,
];
for (const pattern of unevidencedClaims) {
  if (pattern.test(builder)) errors.push(`approved builder contains an unevidenced quantified outcome claim matching ${pattern}`);
}

for (const marker of [
  "Flow Bot", "AI Text Bot", "AI Voice Bot", "Approved preview build",
  "AI Voice Bot does not offer a free trial.",
  "30 days, Starter features, website only, 5,000 conversations, no card required.",
  "One Text trial per card.",
]) {
  if (!builder.includes(marker)) errors.push(`approved public builder is missing ${marker}`);
}

for (const forbidden of [
  "Increase lead conversion", "Warm leads +", "Manual follow-up -",
  "Website plus one social channel", "LINE channel", "WhatsApp", "Instagram Direct", "Facebook Messenger",
]) {
  if (builder.includes(forbidden)) errors.push(`approved public builder advertises forbidden or deferred copy: ${forbidden}`);
}

if (errors.length) {
  console.error(`Public claim check FAILED (${errors.length} issues):\n${errors.map((item) => `- ${item}`).join("\n")}`);
  process.exit(1);
}
console.info("Public claim check passed for the approved builder: no unevidenced outcomes, no social claims, and exact trial boundaries remain visible.");
