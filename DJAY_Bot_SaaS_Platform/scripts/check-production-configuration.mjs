import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const failures = [];

for (const path of [
  "apps/api/lib/container.ts",
  "apps/workers/src/index.ts",
  "apps/voice-gateway/src/index.ts",
]) {
  const source = read(path);
  if (!source.includes('from "@djay/shared/production-config"')) {
    failures.push(`${path} does not import the shared production admission policy`);
  }
  if (!source.includes("assertNoProductionPlaceholders(env.NODE_ENV, env);")) {
    failures.push(`${path} does not apply the shared production admission policy`);
  }
  if (source.includes(".passthrough()")) {
    failures.push(`${path} admits undeclared host variables into production configuration checks`);
  }
}

const gateway = read("apps/voice-gateway/src/index.ts");
if (!gateway.includes('NODE_ENV: z.enum(["development", "test", "production"])')) {
  failures.push("Voice gateway does not distinguish production startup");
}

for (const path of ["apps/workers/package.json", "apps/voice-gateway/package.json"]) {
  const manifest = JSON.parse(read(path));
  if (manifest.dependencies?.["@djay/shared"] !== "workspace:*") {
    failures.push(`${path} does not declare the shared admission dependency`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.info("Production configuration admission is enforced by API, workers, and Voice gateway.");
