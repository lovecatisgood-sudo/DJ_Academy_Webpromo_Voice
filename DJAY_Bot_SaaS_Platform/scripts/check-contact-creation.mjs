import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const failures = [];

const policy = read("packages/shared/src/contact-fields.ts");
for (const marker of [
  "minLength: 1, maxLength: 200", "minLength: 7, maxLength: 32",
  "contactCreationError", "Enter an email address or phone number", "normalizeContactText",
]) {
  if (!policy.includes(marker)) failures.push(`Shared contact-creation policy is missing ${marker}`);
}

const domain = read("packages/domain/src/index.ts");
for (const marker of [
  "contactFieldLimits.displayName.minLength", "contactFieldLimits.displayName.maxLength",
  "contactFieldLimits.phone.minLength", "contactFieldLimits.phone.maxLength",
  "value.email || value.phone",
]) {
  if (!domain.includes(marker)) failures.push(`Contact domain schema is missing ${marker}`);
}

const form = read("apps/tenant-web/app/workspace/contacts/page.tsx");
for (const marker of [
  "contactCreationError", "contactDisplayNameFieldConstraints", "contactPhoneFieldConstraints",
  "emailFieldConstraints", "normalizeContactText", "reportValidity()", "contact-identity-help",
  'role={messageTone === "error" ? "alert" : "status"}',
]) {
  if (!form.includes(marker)) failures.push(`Contact form is missing ${marker}`);
}

const browserGate = read("scripts/qa-ui-foundation.mjs");
for (const marker of [
  "tenant-contact-identity-boundary", "tenant-contact-normalization",
  "Enter an email address or phone number", "Phone number must be 7–32 characters",
  "Contact name must be 1–200 characters",
]) {
  if (!browserGate.includes(marker)) failures.push(`Contact browser gate is missing ${marker}`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.info("Contact creation matches the shared email-or-phone and normalized field contract.");
