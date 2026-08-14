import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const failures = [];

const policy = read("packages/shared/src/identity-fields.ts");
for (const marker of [
  "maxLength: 320", "minLength: 2, maxLength: 160", "minLength: 2, maxLength: 200",
  "identityTextError", "normalizeIdentityText",
]) {
  if (!policy.includes(marker)) failures.push(`Shared identity-field policy is missing ${marker}`);
}

for (const path of [
  "apps/public-site/app/register/page.tsx",
  "apps/public-site/app/VerificationResendForm.tsx",
  "apps/tenant-web/app/page.tsx",
  "apps/tenant-web/app/recovery/page.tsx",
  "apps/tenant-web/app/workspace/team/page.tsx",
  "apps/platform-master/app/page.tsx",
]) {
  if (!read(path).includes("emailFieldConstraints")) failures.push(`${path} does not use the shared email boundary`);
}

for (const [path, markers] of [
  ["apps/public-site/app/register/page.tsx", ["displayNameFieldConstraints", "businessNameFieldConstraints", "identityTextError", "normalizeIdentityText", "reportValidity()"]],
  ["apps/public-site/app/invitations/accept/InvitationAcceptanceClient.tsx", ["displayNameFieldConstraints", "identityTextError", "normalizeIdentityText", "reportValidity()"]],
]) {
  const source = read(path);
  for (const marker of markers) if (!source.includes(marker)) failures.push(`${path} is missing ${marker}`);
}

function sourceFiles(directory) {
  return readdirSync(resolve(root, directory)).flatMap((entry) => {
    if ([".next", "dist", "node_modules"].includes(entry)) return [];
    const relative = `${directory}/${entry}`;
    return statSync(resolve(root, relative)).isDirectory()
      ? sourceFiles(relative)
      : relative.endsWith(".tsx") ? [relative] : [];
  });
}

for (const path of sourceFiles("apps")) {
  const emailInputs = read(path).match(/<input(?=[^>]*type="email")[^>]*>/g) || [];
  for (const input of emailInputs) {
    if (!input.includes("maxLength={320}") && !input.includes("{...emailFieldConstraints}")) {
      failures.push(`${path} contains an email input without the 320-character server boundary`);
    }
  }
}

const browserGate = read("scripts/qa-ui-foundation.mjs");
for (const marker of [
  "public-registration-identity-boundary", "public-invitation-identity-boundary",
  "Name must be 2–160 characters", "Business name must be 2–200 characters",
]) {
  if (!browserGate.includes(marker)) failures.push(`Identity-field browser gate is missing ${marker}`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.info("Identity fields match the shared browser/server boundaries across every account journey.");
