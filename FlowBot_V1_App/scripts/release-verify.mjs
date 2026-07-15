import { readFile } from "node:fs/promises";

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

const failures = [];
const packageJson = await readJson("package.json");
const nodeVersion = (await readFile(".node-version", "utf8")).trim();
const envExample = await readFile(".env.example", "utf8");

function expect(condition, message) {
  if (!condition) failures.push(message);
}

expect(packageJson.packageManager === "pnpm@11.12.0", "packageManager must be pnpm@11.12.0.");
expect(packageJson.engines?.node === ">=24.0.0", "Node engine must require Node 24+.");
expect(nodeVersion.startsWith("v24."), ".node-version must pin Node 24.");

for (const script of [
  "verify",
  "verify:release",
  "verify:audit",
  "verify:secrets",
  "test:e2e",
  "smoke:m2",
  "smoke:m3",
  "smoke:m5",
  "smoke:settings",
  "smoke:privacy",
  "smoke:rate-limit",
  "smoke:sse-soak"
]) {
  expect(Boolean(packageJson.scripts?.[script]), `Missing package script: ${script}`);
}

for (const key of ["DATABASE_URL", "AUTH_SECRET", "TENANT_ID", "OWNER_EMAIL", "OWNER_PASSWORD", "APP_URL"]) {
  expect(envExample.includes(`${key}=`), `.env.example missing ${key}.`);
}

for (const path of [
  "docs/00-CODEX-HANDOFF.md",
  "docs/01-FLOWBOT-V1-PRD.md",
  "docs/05-ARCHITECTURE.md",
  "docs/09-TESTING-QA-PLAN.md",
  "docs/10-DEVOPS-DEPLOYMENT.md",
  "docs/specs/M0-implementation-status.md",
  ".github/workflows/ci.yml"
]) {
  try {
    await readFile(path, "utf8");
  } catch {
    failures.push(`Missing required release artifact: ${path}`);
  }
}

if (failures.length) {
  console.error("Release verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Release verification passed.");
