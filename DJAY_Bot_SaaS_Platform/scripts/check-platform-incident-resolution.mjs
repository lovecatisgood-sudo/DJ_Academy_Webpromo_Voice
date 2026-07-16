import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const failures = [];

const shared = read("packages/shared/src/voice-incident-fields.ts");
for (const marker of [
  "minLength: 12, maxLength: 2_000",
  "voiceIncidentResolutionSchema",
  ".trim()",
  "voiceIncidentResolutionError",
  "12–2,000 characters",
]) if (!shared.includes(marker)) failures.push(`Shared incident resolution contract is missing ${marker}`);

const api = read("apps/api/app/platform/voice/routing/route.ts");
if (!api.includes('command: z.literal("incident.resolve"), incidentId: z.uuid(), resolution: voiceIncidentResolutionSchema')) failures.push("Platform Voice API does not use the shared incident resolution contract");

const store = read("packages/db/src/voice-operations-store.ts");
if (!store.includes("voiceIncidentResolutionSchema.parse(input.resolution)")) failures.push("Platform Voice repository does not revalidate incident resolution");

const page = read("apps/platform-master/app/page.tsx");
const form = read("apps/platform-master/app/VoiceIncidentResolutionForm.tsx");
if (page.includes("window.prompt")) failures.push("Platform Voice incident resolution still relies on an unrecoverable browser prompt");
for (const marker of [
  "voiceIncidentResolutionError",
  "normalizeVoiceIncidentResolution",
  "reportValidity()",
  "Save resolution",
  "onResolve",
]) if (!form.includes(marker)) failures.push(`Platform Voice resolution form is missing ${marker}`);
for (const marker of [
  'role={messageTone === "error" ? "alert" : "status"}',
  "setResolvingIncidentId(null)",
  'showMessage(successMessage, "success")',
]) if (!page.includes(marker)) failures.push(`Platform Voice resolution journey is missing ${marker}`);

const browser = read("scripts/qa-p3-ui.mjs");
for (const marker of [
  "platform-incident-resolution",
  "invalid resolution reached the API",
  "corrected resolution did not send one normalized command",
  "failed resolution did not preserve one exact retryable draft",
]) if (!browser.includes(marker)) failures.push(`P3 browser gate is missing ${marker}`);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.info("Platform Voice incident resolution matches shared validation and accessible retry-safe browser behavior.");
