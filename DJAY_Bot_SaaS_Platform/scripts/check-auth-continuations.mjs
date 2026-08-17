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
if (!login.includes("window.location.replace")) failures.push("Tenant login does not replace the credential-page history entry");
if (login.includes("window.location.assign")) failures.push("Tenant login still retains the credential page in browser history");

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

for (const [path, marker] of [
  ["packages/auth/src/registration.ts", "verificationUrl.hash"],
  ["packages/auth/src/recovery.ts", "recoveryUrl.hash"],
  ["packages/auth/src/invitations.ts", "/invitations/accept#"],
  ["packages/auth/src/ownership.ts", "/ownership/accept#"],
  ["apps/tenant-web/app/invitations/accept/ExistingAccountInvitationClient.tsx", "retainBrowserOneTimeValues"],
]) {
  if (!read(path).includes(marker)) failures.push(`${path} does not keep one-time state out of HTTP query strings`);
}

const builderClaimIssuer = read("apps/api/app/public/builder/claim-continuation/route.ts");
const builderClaimConsumer = read("apps/api/app/public/builder/claim/route.ts");
const registration = read("apps/public-site/app/register/page.tsx");
for (const marker of ["createOpaqueToken", "hashOpaqueToken", "issueClaimContinuation", "TENANT_APP_URL"]) {
  if (!builderClaimIssuer.includes(marker)) failures.push(`Builder claim issuer is missing ${marker}`);
}
for (const marker of ["hashOpaqueToken", "session.current", "selectedTenantId", "claimExistingAccountDraft", "onboarding.update"]) {
  if (!builderClaimConsumer.includes(marker)) failures.push(`Builder claim consumer is missing ${marker}`);
}
for (const marker of ["destination.hash", "builder_claim", "/public/builder/claim-continuation"]) {
  if (!registration.includes(marker)) failures.push(`Existing-account registration continuation is missing ${marker}`);
}
for (const marker of ["retainBrowserOneTimeValues", "clearBrowserOneTimeValues", "/public/builder/claim", "workspace_required"]) {
  if (!login.includes(marker)) failures.push(`Tenant Builder claim continuation is missing ${marker}`);
}
for (const marker of ["/workspace/onboarding", "claimAndContinue", "clearBrowserOneTimeValues"]) {
  if (!login.includes(marker)) failures.push(`Post-claim merchant onboarding continuation is missing ${marker}`);
}
if (registration.includes("searchParams.set(\"builder_claim\"") || login.includes("searchParams.get(\"builder_claim\"")) {
  failures.push("Builder claim continuation exposes its one-time token in the query string");
}

const securityHeaders = read("config/next-security-headers.ts");
for (const marker of ["oneTimeAccountRoutes", 'value: "no-referrer"', '"/verify-email"', '"/recovery/complete"']) {
  if (!securityHeaders.includes(marker)) failures.push(`One-time account-route header policy is missing ${marker}`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.info("Browser continuations and configured cross-realm links remain on exact admitted DJAY origins.");
