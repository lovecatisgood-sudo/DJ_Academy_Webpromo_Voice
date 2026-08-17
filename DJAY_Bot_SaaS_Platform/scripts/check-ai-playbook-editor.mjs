import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const failures = [];

const domain = read("packages/sales-core/src/index.ts");
for (const marker of [
  "aiPlaybookFieldLimits",
  "isValidIanaTimeZone",
  '.refine(isValidIanaTimeZone',
  "aiPlaybookFieldLimits.weeklyWindows.maxItems",
  "behaviorInstructions",
  "behaviorBoundaries",
  "approvedFaqs",
  "selectRelevantFaqs",
  "customerMessages",
  "Use the approved fixed operational message verbatim",
]) {
  if (!domain.includes(marker)) failures.push(`Sales Core playbook authority is missing ${marker}`);
}

const editor = read("apps/tenant-web/app/workspace/ai-chat/AiPlaybookEditor.tsx");
for (const marker of [
  'legend>Assistant identity and goals',
  'legend>Approved conversation guidance',
  'legend>Business profile from Builder',
  'legend>Approved FAQ',
  'legend>Customer messages',
  'legend>Business hours',
  'data-ai-playbook-path="timezone"',
  'data-ai-playbook-path="behaviorInstructions"',
  'data-ai-playbook-path="behaviorBoundaries"',
  'data-ai-playbook-path="approvedFaqs"',
  "CUSTOMER_MESSAGE_FIELDS",
  "customerMessages.${key}",
  'aria-label="Advanced AI sales playbook JSON"',
  "Your JSON text is preserved",
]) {
  if (!editor.includes(marker)) failures.push(`Guided AI playbook editor is missing ${marker}`);
}

const page = read("apps/tenant-web/app/workspace/ai-chat/page.tsx");
for (const marker of [
  "aiPlaybookSchema.safeParse(candidate)",
  "setAdvancedPending(true)",
  "setDraftDirty(true)",
  "beforeunload",
  "Discard the unsaved playbook and knowledge changes",
  "working || draftDirty",
  "Advanced JSON must be valid before this draft can be saved",
]) {
  if (!page.includes(marker)) failures.push(`AI Chat draft boundary is missing ${marker}`);
}
const saveStart = page.indexOf("async function saveDraft");
const saveEnd = page.indexOf("async function publish", saveStart);
const save = page.slice(saveStart, saveEnd);
if (save.indexOf("aiPlaybookSchema.safeParse") > save.indexOf("safeMutationFetch")) {
  failures.push("AI Chat playbook schema validation no longer precedes the draft mutation");
}

const browser = read("scripts/qa-p5-ai-chat.mjs");
for (const marker of [
  "invalid timezone reached the draft API",
  "publish remained enabled with unsaved guided edits",
  "dismissed agent switch discarded unsaved work",
  "malformed Advanced JSON sent a stale draft update",
  "malformed Advanced JSON was not preserved for repair",
  "repaired Advanced JSON did not refresh guided fields",
]) {
  if (!browser.includes(marker)) failures.push(`P5 browser gate is missing ${marker}`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.info("AI Chat guided playbook fields, recoverable Advanced JSON, and save/publish authority match Sales Core.");
