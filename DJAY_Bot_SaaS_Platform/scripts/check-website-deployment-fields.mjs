import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const failures = [];

const policy = read("packages/shared/src/website-deployment-fields.ts");
for (const marker of [
  "minLength: 2, maxLength: 160",
  "maxLength: 2048, maximumCount: 20",
  "normalizeExactWebsiteOrigin",
  "isExactWebsiteOrigin",
  "websiteDeploymentFormError",
  'parsed.origin === normalized',
]) {
  if (!policy.includes(marker)) failures.push(`Shared website deployment policy is missing ${marker}`);
}

const form = read("apps/tenant-web/app/workspace/WebsiteDeploymentForm.tsx");
for (const marker of [
  "websiteDeploymentFieldConstraints.name",
  "websiteDeploymentFieldConstraints.origin",
  "websiteDeploymentFormError",
  'role="alert"',
  'aria-invalid=',
  "input.name.trim()",
]) {
  if (!form.includes(marker)) failures.push(`Shared website deployment form is missing ${marker}`);
}

for (const path of [
  "apps/tenant-web/app/workspace/flowbot/page.tsx",
  "apps/tenant-web/app/workspace/ai-chat/page.tsx",
]) {
  const source = read(path);
  if ((source.match(/<WebsiteDeploymentForm /g) || []).length !== 1) failures.push(`${path} does not render the shared deployment form exactly once`);
  if (source.includes('name="origin"')) failures.push(`${path} still owns a duplicated website-origin field`);
}

for (const path of [
  "apps/api/app/tenant/flowbot/bots/[botId]/deployments/route.ts",
  "apps/api/app/tenant/ai-chat/agents/[agentId]/deployments/route.ts",
  "apps/api/app/tenant/voice/deployments/route.ts",
  "apps/api/app/tenant/voice/deployments/[deploymentId]/studio/route.ts",
]) {
  const source = read(path);
  if (!source.includes("isExactWebsiteOrigin") || !source.includes("websiteDeploymentFieldLimits") && !source.includes("voiceDeploymentFieldLimits")) {
    failures.push(`${path} does not enforce the shared exact-origin authority`);
  }
  if (source.includes("new URL(value).origin")) failures.push(`${path} still silently converts a full URL into an origin`);
}

for (const path of [
  "packages/db/src/flowbot-store.ts",
  "packages/db/src/ai-chat-store.ts",
  "packages/db/src/voice-deployment-store.ts",
]) {
  if (!read(path).includes("normalizeExactWebsiteOrigin")) failures.push(`${path} does not revalidate exact origins at storage`);
}
if (!read("packages/db/src/flowbot-store.integration.test.ts").includes('"https://merchant.example/path"')) {
  failures.push("FlowBot storage integration does not reject a path-bearing origin");
}

for (const path of ["scripts/qa-p4-flowbot.mjs", "scripts/qa-p5-ai-chat.mjs"]) {
  const source = read(path);
  for (const marker of ["invalid path origin reached the API", '!== "2048"', "expected one deployment create"]) {
    if (!source.includes(marker)) failures.push(`${path} is missing the browser assertion ${marker}`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.info("FlowBot, AI Chat, and Voice share one exact website deployment origin authority.");
