import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const failures = [];

const page = read("apps/platform-master/app/page.tsx");
for (const marker of [
  "const loadGeneration = useRef(0)",
  "generation !== loadGeneration.current",
  "const authorityChanged = Boolean(user && (user.id !== result.user.id || user.role !== result.user.role))",
  "if (authorityChanged)",
  "] = await Promise.all([",
  "setResourceErrors(unavailable.sort())",
  "const controlsBusy = working || dashboardLoading",
  'readinessStage === "loading" && !readiness',
  'reconciliationStage === "loading" && !reconciliation',
  'recoveryStage === "loading" && !recovery',
]) {
  if (!page.includes(marker)) failures.push(`Platform snapshot loader is missing ${marker}`);
}
const concurrentStart = page.indexOf("] = await Promise.all([");
const concurrentEnd = concurrentStart < 0 ? -1 : page.indexOf("]);", concurrentStart);
const concurrentBlock = concurrentEnd < 0 ? "" : page.slice(concurrentStart, concurrentEnd);
for (const path of [
  "/platform/health-summary", "/platform/release-readiness",
  "/platform/commerce-overview", "/platform/usage-reconciliation",
  "/platform/subscriptions", "/platform/tenants", "/platform/support-grants",
  "/platform/dead-letter-recovery", "/platform/voice/runtime-control",
  "/platform/voice/routing", "/platform/voice/incidents",
]) {
  if (!concurrentBlock.includes(path)) failures.push(`Platform snapshot does not load ${path} concurrently`);
}
if (page.includes('setHealth(await loadResource<Health>')) {
  failures.push("Platform health has regressed to a serial resource load");
}
if (page.includes("disabled={working")) {
  failures.push("Platform mutation controls are not locked for the full snapshot refresh");
}

const browserGate = read("scripts/qa-p9-operations.mjs");
for (const marker of [
  "maxConcurrentReads", "maxConcurrentReads < 4", "delayedReadMs",
  "roleAfterReview", "retained restricted",
]) {
  if (!browserGate.includes(marker)) failures.push(`Platform browser concurrency gate is missing ${marker}`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.info("Platform operations load one role-aware concurrent snapshot and discard obsolete refreshes.");
