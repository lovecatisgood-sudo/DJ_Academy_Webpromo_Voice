import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const failures = [];

const route = read("apps/api/app/tenant/onboarding/route.ts");
for (const marker of ['action: z.literal("refresh")', "refreshOnboarding(resolved.context)"]) {
  if (!route.includes(marker)) failures.push(`onboarding API is missing ${marker}`);
}
if (route.includes("stage: z.enum")) failures.push("onboarding API still trusts a browser-supplied stage");

const store = read("packages/db/src/tenant-workspace-store.ts");
for (const marker of [
  "launchReadyProducts", "current_published_version_id = execution.flow_version_id",
  "current_published_playbook_version_id = session.playbook_version_id",
  "session.status = 'ended'", "activeProducts.has(product)",
]) {
  if (!store.includes(marker)) failures.push(`onboarding evidence store is missing ${marker}`);
}

const page = read("apps/tenant-web/app/workspace/page.tsx");
for (const marker of [
  "Launch checklist", "Progress comes from server-verified workspace and product evidence.",
  "Technical launch readiness", 'JSON.stringify({ action: "refresh" })',
  'complete: readiness?.activeAccess ?? false',
]) {
  if (!page.includes(marker)) failures.push(`guided onboarding UI is missing ${marker}`);
}
for (const forbidden of ["updateStage(", "stage-control", "JSON.stringify({ stage"] ) {
  if (page.includes(forbidden)) failures.push(`guided onboarding UI still contains ${forbidden}`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.info("Onboarding readiness is server-derived from active, configured, current-version tested product evidence.");
