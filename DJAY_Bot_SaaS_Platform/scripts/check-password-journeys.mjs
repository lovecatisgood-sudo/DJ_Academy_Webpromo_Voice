import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const failures = [];

const policy = read("packages/shared/src/passwords.ts");
for (const marker of ["minLength: 12", "maxLength: 128", "passwordConfirmationError", "Passwords do not match"]) {
  if (!policy.includes(marker)) failures.push(`Shared password policy is missing ${marker}`);
}

for (const path of [
  "apps/public-site/app/register/page.tsx",
  "apps/public-site/app/invitations/accept/InvitationAcceptanceClient.tsx",
  "apps/tenant-web/app/recovery/complete/RecoveryCompleteClient.tsx",
]) {
  const source = read(path);
  for (const marker of ["passwordConfirmation", "passwordConfirmationError", "newPasswordConstraints", "reportValidity()", "setCustomValidity(\"\")"]) {
    if (!source.includes(marker)) failures.push(`${path} is missing ${marker}`);
  }
}

for (const path of ["apps/tenant-web/app/page.tsx", "apps/platform-master/app/page.tsx"]) {
  const source = read(path);
  if (!/type="password"[^>]+autoComplete="current-password"[^>]+maxLength=\{128\}/.test(source)) {
    failures.push(`${path} does not enforce the server current-password maximum`);
  }
}

const browserGate = read("scripts/qa-ui-foundation.mjs");
for (const marker of [
  "public-registration-password-mismatch", "public-invitation-password-mismatch",
  "tenant-recovery-password-mismatch", "Passwords do not match",
]) {
  if (!browserGate.includes(marker)) failures.push(`Password browser gate is missing ${marker}`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.info("Password creation and login fields match the shared browser/server boundary.");
