import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const failures = [];
const widgets = [
  ["packages/flowbot-widget", "src/index.ts", true],
  ["packages/ai-chat-widget", "src/index.ts", true],
  ["packages/voice-widget", "src/index.ts", false],
];
const sharedMarkers = [
  "djayWidgetBaseStyles",
  "normalizeWidgetApiOrigin",
  "widgetFetch",
  'setAttribute("role", "dialog")',
  'setAttribute("aria-modal", "false")',
  'setAttribute("aria-expanded"',
  'setAttribute("aria-controls"',
  'event.key === "Escape"',
];

for (const [directory, sourceName, usesDurableSync] of widgets) {
  const sourcePath = resolve(root, directory, sourceName);
  const source = readFileSync(sourcePath, "utf8");
  const manifest = JSON.parse(readFileSync(resolve(root, directory, "package.json"), "utf8"));
  if (manifest.dependencies?.["@djay/shared"] !== "workspace:*") {
    failures.push(`${directory}/package.json does not pin the shared widget foundation`);
  }
  if (!source.includes('from "@djay/shared/widget-ui"')) {
    failures.push(`${directory}/${sourceName} does not import the shared widget foundation`);
  }
  for (const marker of sharedMarkers) {
    if (!source.includes(marker)) failures.push(`${directory}/${sourceName} is missing ${marker}`);
  }
  if (/\bfetch\s*\(/.test(source)) failures.push(`${directory}/${sourceName} bypasses bounded widgetFetch`);
  if (usesDurableSync) {
    for (const marker of ["private syncing = false", 'document.visibilityState !== "hidden"', "hasEditableFocus()", "const draft = previousInput?.value"]) {
      if (!source.includes(marker)) failures.push(`${directory}/${sourceName} is missing safe polling marker ${marker}`);
    }
  }
  if (directory === "packages/ai-chat-widget" && !source.includes("updateStreamingAssistant")) {
    failures.push("AI Chat widget rebuilds the full shadow tree for streamed deltas");
  }
  if (directory === "packages/voice-widget") {
    for (const marker of ["timer.textContent =", "transcript.scrollTo("]) {
      if (!source.includes(marker)) failures.push(`Voice widget is missing in-place update marker ${marker}`);
    }
  }
}

const sharedSource = readFileSync(resolve(root, "packages/shared/src/widget-ui.ts"), "utf8");
for (const marker of ["--djay-widget-green: #126149", "--djay-widget-accent: #f2c14e", ":focus-visible", "prefers-reduced-motion", "forced-colors", "safe-area-inset-bottom"]) {
  if (!sharedSource.includes(marker)) failures.push(`shared widget foundation is missing ${marker}`);
}

const releaseSource = readFileSync(resolve(root, "scripts/package-release.mjs"), "utf8");
const releaseQaSource = readFileSync(resolve(root, "scripts/qa-release-artifacts.mjs"), "utf8");
for (const marker of ["widget-cdn", "packages/flowbot-widget/dist/index.js", "packages/ai-chat-widget/dist/index.js", "packages/voice-widget/dist/index.js", "${product}/v1/index.js", "sriSha384"]) {
  if (!releaseSource.includes(marker)) failures.push(`widget release package is missing ${marker}`);
}
for (const marker of ["widget-cdn evidence mismatch", "cross-origin module contract", "canonical DJAY tokens", "accessible shell semantics"]) {
  if (!releaseQaSource.includes(marker)) failures.push(`widget release QA is missing ${marker}`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.info("Shared DJAY widget brand, dialog, keyboard, polling, transport, and CDN release policy passed for FlowBot, AI Chat, and Voice.");
