import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const failures = [];

const policy = read("packages/shared/src/flowbot-operations-fields.ts");
for (const marker of [
  "^[a-z][a-z0-9_-]{0,99}$",
  "minLength: 2, maxLength: 160",
  "minLength: 3, maxLength: 64",
  "members: Object.freeze({ min: 1, max: 100 })",
  "isSupportedIanaTimezone",
  "flowbotScheduleFormError",
  "flowbotRoutingTeamFormError",
]) {
  if (!policy.includes(marker)) failures.push(`Shared FlowBot operations policy is missing ${marker}`);
}

const domain = read("packages/flowbot-domain/src/index.ts");
for (const marker of ["flowbotOperationKeyPattern", "flowbotOperationsFieldLimits", "refine(isSupportedIanaTimezone)"]) {
  if (!domain.includes(marker)) failures.push(`FlowBot domain schedule authority is missing ${marker}`);
}

for (const path of [
  "apps/api/app/tenant/flowbot/schedules/route.ts",
  "apps/api/app/tenant/flowbot/routing-teams/route.ts",
]) {
  const source = read(path);
  if (!source.includes("flowbotOperationsFieldLimits")) failures.push(`${path} does not use shared Premium operations limits`);
}
if (!read("apps/api/app/tenant/flowbot/routing-teams/route.ts").includes("flowbotOperationKeyPattern")) {
  failures.push("Routing-team API does not use the shared storage-safe key pattern");
}

const store = read("packages/db/src/flowbot-store.ts");
for (const marker of ["flowbotScheduleFormError", "flowbotRoutingTeamFormError", "input.name.trim()", "uuidSchema.safeParse"]) {
  if (!store.includes(marker)) failures.push(`FlowBot storage validation is missing ${marker}`);
}

const page = read("apps/tenant-web/app/workspace/flowbot/page.tsx");
for (const marker of [
  "flowbotOperationsFieldConstraints.key",
  "flowbotOperationsFieldConstraints.name",
  "flowbotOperationsFieldConstraints.timezone",
  "flowbotScheduleFormError",
  "flowbotRoutingTeamFormError",
  'id="flowbot-schedule-error"',
  'id="flowbot-team-error"',
  "No active team members",
]) {
  if (!page.includes(marker)) failures.push(`FlowBot Premium operations UI is missing ${marker}`);
}

const browser = read("scripts/qa-p4-flowbot.mjs");
for (const marker of [
  "invalid timezone reached the API",
  "empty routing team reached the API",
  "corrected schedule did not send one normalized mutation",
  "corrected routing team did not send one normalized mutation",
]) {
  if (!browser.includes(marker)) failures.push(`P4 browser gate is missing ${marker}`);
}

const integration = read("packages/db/src/flowbot-store.integration.test.ts");
for (const marker of ['timezone: "Mars/Colony"', 'membershipIds: []', 'scheduleKey: " sales "']) {
  if (!integration.includes(marker)) failures.push(`FlowBot integration gate is missing ${marker}`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.info("FlowBot Premium schedule and routing fields match browser, API, domain, and storage authority.");
