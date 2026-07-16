import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const failures = [];

const policy = read("packages/shared/src/voice-deployment-fields.ts");
for (const marker of [
  "name: websiteDeploymentFieldLimits.name", "minLength: 2, maxLength: 100",
  "origin: websiteDeploymentFieldLimits.origin", "minLength: 1, maxLength: 500",
  "minLength: 8, maxLength: 500", "voiceDeploymentValidationError",
]) {
  if (!policy.includes(marker)) failures.push(`Shared Voice deployment policy is missing ${marker}`);
}
if (!read("packages/shared/src/website-deployment-fields.ts").includes("maxLength: 2048, maximumCount: 20")) {
  failures.push("Shared website deployment origin boundary is no longer 2,048 characters / 20 origins");
}

const salesCore = read("packages/sales-core/src/index.ts");
if (!salesCore.includes("localizedMessage: Object.freeze({ minLength: 1, maxLength: 500 })")
  || !salesCore.includes("th: z.string().trim().min(aiPlaybookFieldLimits.localizedMessage.minLength).max(aiPlaybookFieldLimits.localizedMessage.maxLength)")
  || !salesCore.includes("en: z.string().trim().min(aiPlaybookFieldLimits.localizedMessage.minLength).max(aiPlaybookFieldLimits.localizedMessage.maxLength)")) {
  failures.push("Immutable Sales Core greeting boundary is no longer 1–500 characters");
}

for (const path of [
  "apps/api/app/tenant/voice/deployments/route.ts",
  "apps/api/app/tenant/voice/deployments/[deploymentId]/studio/route.ts",
]) {
  const source = read(path);
  if (!source.includes("voiceDeploymentFieldLimits")) failures.push(`${path} does not use the shared Voice deployment limits`);
  if (/greeting(?:Th|En).*max\(1000\)/.test(source)) failures.push(`${path} still accepts greetings rejected by the immutable playbook`);
}

const form = read("apps/tenant-web/app/workspace/voice/VoiceDeploymentForm.tsx");
for (const marker of [
  "voiceDeploymentFieldConstraints.name", "voiceDeploymentFieldConstraints.agentName",
  "voiceDeploymentFieldConstraints.businessName", "voiceDeploymentFieldConstraints.origin",
  "voiceDeploymentFieldConstraints.greeting", "voiceDeploymentFieldConstraints.disclosure",
  "voiceDeploymentFieldConstraints.maxCallSeconds", "voiceDeploymentFieldConstraints.reconnectWindowSeconds",
]) {
  if (!form.includes(marker)) failures.push(`Shared Voice deployment form is missing ${marker}`);
}

const studio = read("apps/tenant-web/app/workspace/voice/page.tsx");
if ((studio.match(/<VoiceDeploymentForm /g) || []).length !== 2) failures.push("Voice first/additional deployment journeys do not share one form");
for (const marker of ["voiceDeploymentValidationError", "studioValidationMessage", 'role="alert"']) {
  if (!studio.includes(marker)) failures.push(`Voice Studio validation is missing ${marker}`);
}
if (studio.includes('<form className="voice-deploy"')) failures.push("A duplicated Voice deployment form remains in the Studio page");

const focusedBrowserGate = read("scripts/qa-p7-voice-widget.mjs");
for (const marker of ["Each greeting must be 1–500 characters", "invalid Studio greeting reached the API", '!== "2048"']) {
  if (!focusedBrowserGate.includes(marker)) failures.push(`Focused Voice browser gate is missing ${marker}`);
}
const routeMatrix = read("scripts/qa-ui-foundation.mjs");
for (const marker of ["English greeting", "Thai greeting", "English disclosure", "Allowed website origin"]) {
  if (!routeMatrix.includes(marker)) failures.push(`Voice route matrix is missing ${marker}`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.info("Voice deployment creation and Studio fields match the immutable Sales Core boundary.");
