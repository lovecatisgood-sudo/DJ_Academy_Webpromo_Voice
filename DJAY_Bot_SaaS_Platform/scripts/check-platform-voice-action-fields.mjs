import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const failures = [];

const shared = read("packages/shared/src/platform-voice-action-fields.ts");
for (const marker of [
  "voiceRuntimeReasonSchema",
  "voiceRoutingActionReasonSchema",
  "normalizePlatformVoiceReason",
  "voiceRuntimeReasonError",
  "voiceRoutingActionReasonError",
  ".trim()",
]) if (!shared.includes(marker)) failures.push(`Shared Platform Voice action contract is missing ${marker}`);

const runtimeApi = read("apps/api/app/platform/voice/runtime-control/route.ts");
if (!runtimeApi.includes("reasonCode: voiceRuntimeReasonSchema")) failures.push("Voice runtime API does not use the shared reason contract");
const routingApi = read("apps/api/app/platform/voice/routing/route.ts");
if (!routingApi.includes("reason: voiceRoutingActionReasonSchema")) failures.push("Voice routing API does not use the shared action-reason contract");

const store = read("packages/db/src/voice-operations-store.ts");
for (const marker of [
  "voiceRuntimeReasonSchema.parse(input.reasonCode)",
  "voiceRoutingActionReasonSchema.parse(input.reason)",
]) if (!store.includes(marker)) failures.push(`Voice operations repository is missing ${marker}`);

const page = read("apps/platform-master/app/page.tsx");
for (const marker of [
  "voiceRuntimeReasonError(voiceReason)",
  "voiceRoutingActionReasonError(routingActionReason)",
  "normalizePlatformVoiceReason(voiceReason)",
  "normalizePlatformVoiceReason(routingActionReason)",
  "reportValidity()",
  "Voice runtime control updated.",
  "clearAuthorizedPlatformSnapshot()",
  'recoveryStage !== "error" && recovery',
]) if (!page.includes(marker)) failures.push(`Platform Voice action journey is missing ${marker}`);

const browser = read("scripts/qa-p3-ui.mjs");
for (const marker of [
  "platform-voice-action-reasons",
  "invalid runtime reason reached the API",
  "corrected runtime reason did not send one normalized command",
  "invalid routing action reason reached the API",
  "corrected routing reason did not send one normalized command",
]) if (!browser.includes(marker)) failures.push(`P3 browser gate is missing ${marker}`);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.info("Platform Voice runtime and routing actions enforce shared, focused, normalized reason evidence.");
