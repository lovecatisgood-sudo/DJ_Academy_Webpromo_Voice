import { existsSync, readFileSync } from "node:fs";
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

const apiContainer = read("apps/api/lib/container.ts");
const workers = read("apps/workers/src/index.ts");
for (const [path, source] of [["apps/api/lib/container.ts", apiContainer], ["apps/workers/src/index.ts", workers]]) {
  if (!source.includes("SOCIAL_CHANNELS_RELEASE_ENABLED")) failures.push(`${path} does not gate deferred social release configuration`);
  if (!source.includes("socialReleaseEnabled && env.")) failures.push(`${path} can load social credentials without the release gate`);
}
if (!workers.includes("Social workers require SOCIAL_CHANNELS_RELEASE_ENABLED=true.")) {
  failures.push("Workers can enable social processing while the social release remains disabled");
}

for (const path of ["apps/workers/package.json", "apps/voice-gateway/package.json"]) {
  const manifest = JSON.parse(read(path));
  if (manifest.dependencies?.["@djay/shared"] !== "workspace:*") {
    failures.push(`${path} does not declare the shared admission dependency`);
  }
}

/*
 * Environment files must not wrap values in quotes.
 *
 * A shell sources `.env` and strips the quotes, so quoting looks harmless locally. But
 * `docker run --env-file` and Cloud Run's environment injection do NOT parse shell quoting —
 * they take the bytes after `=` literally. `DATABASE_URL="postgresql://..."` therefore becomes
 * a connection string that begins and ends with a double-quote character and fails to parse,
 * and a quoted secret authenticates with quotes included. This surfaces for the first time at
 * deploy, which is the worst place to discover it.
 *
 * Only variable NAMES are ever reported; values are never read into the failure text.
 */
const QUOTED_ASSIGNMENT = /^([A-Z_][A-Z0-9_]*)=(["'])(.*)\2\s*$/;
for (const path of [".env", ".env.example", ".env.local"]) {
  const absolute = resolve(root, path);
  if (!existsSync(absolute)) continue;
  const offenders = [];
  for (const line of readFileSync(absolute, "utf8").split("\n")) {
    if (line.trimStart().startsWith("#")) continue;
    const match = QUOTED_ASSIGNMENT.exec(line);
    // A value containing whitespace or '#' genuinely needs quoting for shell sourcing; those
    // are exempt because the deploy path would mangle them either way and they must be
    // handled deliberately rather than silently unquoted here.
    if (match && !/[\s#]/.test(match[3])) offenders.push(match[1]);
  }
  if (offenders.length) {
    failures.push(
      `${path} quotes ${offenders.length} value(s) that must be unquoted for `
      + `docker --env-file and Cloud Run: ${offenders.join(", ")}`,
    );
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.info("Production configuration admission is enforced by API, workers, and Voice gateway.");
console.info("Environment files carry no shell-quoted values.");
