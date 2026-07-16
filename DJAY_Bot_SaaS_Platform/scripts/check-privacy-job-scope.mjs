import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const failures = [];

const shared = read("packages/shared/src/privacy-jobs.ts");
for (const marker of [
  'z.discriminatedUnion("jobType"',
  'jobType: z.literal("erasure")',
  "contactId: z.uuid()",
  "privacyJobSelectionError",
  "Select the specific contact",
]) if (!shared.includes(marker)) failures.push(`Shared privacy job authority is missing ${marker}`);

const api = read("apps/api/app/tenant/privacy-jobs/route.ts");
if (!api.includes("privacyJobRequestSchema.parse")) failures.push("Privacy API does not use the shared discriminated scope contract");
if (api.includes("contactId: z.uuid().optional()")) failures.push("Privacy API still permits unscoped erasure");

const store = read("packages/db/src/shared-domain-store.ts");
for (const marker of [
  "privacyJobRequestSchema.parse(input)",
  'parsed.jobType === "erasure" && contacts[0].status !== "active"',
  "ON CONFLICT (tenant_id, idempotency_key) DO NOTHING",
  'status: "conflict" as const',
]) if (!store.includes(marker)) failures.push(`Privacy repository is missing ${marker}`);

const migration = read("packages/db/migrations/0042_privacy_job_scope.sql");
for (const marker of [
  "privacy_erasure_requires_contact",
  "privacy_job_scope_matches_contact",
  "privacy.erasure.scope_invalidated",
]) if (!migration.includes(marker)) failures.push(`Privacy scope migration is missing ${marker}`);

const page = read("apps/tenant-web/app/workspace/data/page.tsx");
for (const marker of [
  "privacyJobSelectionError",
  "Select a contact to erase",
  "Permanently erase personal data for ${contact.displayName}",
  "No data was exported or erased",
  "retentionMessage",
]) if (!page.includes(marker)) failures.push(`Data Controls privacy journey is missing ${marker}`);

const browser = read("scripts/qa-p3-ui.mjs");
for (const marker of [
  "unscoped erasure reached the API",
  "dismissed named erasure confirmation changed data",
  "scoped erasure did not send one exact request",
  "accepted request did not reset to safe export defaults",
  "retention update did not send exactly one request",
]) if (!browser.includes(marker)) failures.push(`P3 browser gate is missing ${marker}`);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.info("Privacy export and contact-erasure scope match browser, API, repository, and PostgreSQL authority.");
