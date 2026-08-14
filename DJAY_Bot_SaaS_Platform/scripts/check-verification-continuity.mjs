import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const failures = [];

const resend = read("apps/public-site/app/VerificationResendForm.tsx");
for (const marker of [
  'safeMutationFetch("/public/auth/resend-verification"',
  "whether or not an account exists",
  'role={status === "error" ? "alert" : "status"}',
  'disabled={status === "working"}',
]) {
  if (!resend.includes(marker)) failures.push(`Verification resend flow is missing ${marker}`);
}

const registration = read("apps/public-site/app/register/page.tsx");
for (const marker of [
  'status === "accepted" ? "Check your email"',
  "<VerificationResendForm initialEmail={registeredEmail}",
  'message && status !== "accepted"',
]) {
  if (!registration.includes(marker)) failures.push(`Registration completion is missing ${marker}`);
}

const verification = read("apps/public-site/app/verify-email/VerifyEmailClient.tsx");
for (const marker of [
  'const showResend = status === "error" || !token',
  'const showConfirm = Boolean(token) && (status !== "error" || retryable)',
  "{showResend ? <VerificationResendForm /> : null}",
]) {
  if (!verification.includes(marker)) failures.push(`Verification recovery is missing ${marker}`);
}

const browserGate = read("scripts/qa-ui-foundation.mjs");
for (const marker of [
  "public-registration-complete", "public-verification-missing-token",
  "public-registration-complete-mobile", "public-verification-missing-token-mobile",
  "public-verification-network-failure", "public-verification-resend-network-failure",
  "registration or resend mutation was duplicated",
]) {
  if (!browserGate.includes(marker)) failures.push(`Verification continuity browser gate is missing ${marker}`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.info("Registration completion and expired-link recovery expose one safe, retryable verification resend flow.");
