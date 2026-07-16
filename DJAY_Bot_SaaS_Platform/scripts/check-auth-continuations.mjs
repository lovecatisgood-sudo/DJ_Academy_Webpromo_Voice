import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const failures = [];

const navigation = read("packages/shared/src/navigation.ts");
for (const marker of [
  "safeSameOriginPath", 'value.includes("\\\\")', "ambiguousEncoding",
  "resolved.origin !== navigationSentinel", "resolveApplicationOrigin",
  "resolved.origin !== candidate", "localDevelopment",
]) {
  if (!navigation.includes(marker)) failures.push(`Shared navigation policy is missing ${marker}`);
}

const login = read("apps/tenant-web/app/page.tsx");
for (const marker of [
  "safeSameOriginPath", "continuationDestination()",
  "tenantApplicationEnvironment.publicAppUrl",
]) {
  if (!login.includes(marker)) failures.push(`Tenant login continuation is missing ${marker}`);
}
for (const forbidden of ["requested?.startsWith", "process.env.NEXT_PUBLIC_PUBLIC_APP_URL"]) {
  if (login.includes(forbidden)) failures.push(`Tenant login still trusts ${forbidden}`);
}

for (const [path, marker] of [
  ["apps/public-site/next.config.ts", 'import "./lib/application-environment"'],
  ["apps/tenant-web/next.config.ts", 'import "./lib/application-environment"'],
  ["apps/public-site/app/login/page.tsx", "publicApplicationEnvironment.tenantAppUrl"],
  ["apps/public-site/app/verify-email/page.tsx", "publicApplicationEnvironment.tenantAppUrl"],
  ["apps/public-site/app/invitations/accept/page.tsx", "publicApplicationEnvironment.tenantAppUrl"],
]) {
  if (!read(path).includes(marker)) failures.push(`${path} is missing ${marker}`);
}

const browserGate = read("scripts/qa-ui-foundation.mjs");
for (const marker of [
  "tenant-login-malicious-continuation", "tenant-login-valid-continuation",
  "tenant-mfa-malicious-continuation", "navigation escaped the Tenant origin",
]) {
  if (!browserGate.includes(marker)) failures.push(`Continuation browser gate is missing ${marker}`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.info("Browser continuations and configured cross-realm links remain on exact admitted DJAY origins.");
