import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const failures = [];

const policy = read("packages/shared/src/flowbot-editor-fields.ts");
for (const marker of [
  "minLength: 1, maxLength: 160",
  "maxLength: 10_000",
  "flowbotEditorFieldConstraints",
]) {
  if (!policy.includes(marker)) failures.push(`Shared FlowBot editor policy is missing ${marker}`);
}

const domain = read("packages/flowbot-domain/src/index.ts");
for (const marker of [
  "flowbotEditorFieldLimits.localizedText.maxLength",
  "flowbotEditorFieldLimits.title.minLength",
  "flowbotEditorFieldLimits.title.maxLength",
]) {
  if (!domain.includes(marker)) failures.push(`FlowBot domain schema is missing ${marker}`);
}

const editor = read("apps/tenant-web/app/workspace/flowbot/FlowVisualEditor.tsx");
for (const marker of [
  "flowNodeSchema.safeParse",
  "flowbotEditorFieldConstraints.title",
  "flowbotEditorFieldConstraints.localizedText",
  "Advanced JSON remains open so you can repair it",
  "Node settings must be valid JSON",
  "onEditorErrorChange",
  'data-flow-advanced-json',
]) {
  if (!editor.includes(marker)) failures.push(`FlowBot visual editor is missing ${marker}`);
}

const page = read("apps/tenant-web/app/workspace/flowbot/page.tsx");
for (const marker of [
  "flowSnapshotSchema.safeParse",
  "editorErrorMessage",
  "focusFlowDefinitionIssue",
  'id="flowbot-draft-error"',
  'role="alert"',
]) {
  if (!page.includes(marker)) failures.push(`FlowBot draft-save boundary is missing ${marker}`);
}
const saveStart = page.indexOf("async function saveDraft");
const saveEnd = page.indexOf("async function publish", saveStart);
const save = page.slice(saveStart, saveEnd);
if (save.indexOf("flowSnapshotSchema.safeParse") > save.indexOf("safeMutationFetch")) {
  failures.push("FlowBot draft schema validation no longer precedes the mutation");
}

const browser = read("scripts/qa-p4-flowbot.mjs");
for (const marker of [
  "invalid Advanced JSON removed its repair control",
  "invalid node title reached the API",
  "invalid per-node JSON allowed a stale draft mutation",
  "corrected visual draft did not send exactly one mutation",
]) {
  if (!browser.includes(marker)) failures.push(`P4 browser gate is missing ${marker}`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.info("FlowBot visual fields and repairable JSON editors match domain and mutation authority.");
