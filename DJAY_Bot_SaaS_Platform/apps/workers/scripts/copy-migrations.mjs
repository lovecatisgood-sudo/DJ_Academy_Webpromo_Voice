import { cp, readdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Copy the migration SQL next to the bundled migrate-database.js.
 *
 * `migrate-database.ts` resolves its migration directory relative to its own file, so the
 * built runner reads `dist/migrations` — not `packages/db/migrations`. The build step is
 * esbuild only and never copied them, so `dist/migrations` was a stale snapshot that
 * silently lagged the source: it held 79 files while the repo had 85, missing 0079-0084.
 * Running the built runner therefore applied an outdated schema and could never deliver
 * the newest migrations. This makes the copy part of the build.
 *
 * The destination is removed first, so a migration deleted or renamed upstream cannot
 * survive as a stale file and get applied.
 */
const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, "../../../packages/db/migrations");
const destination = resolve(here, "../dist/migrations");

const names = (await readdir(source)).filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name));

// A truncated or mis-resolved source would otherwise produce a runner that applies almost
// nothing and reports success. Fail loudly instead.
if (names.length < 80) {
  throw new Error(`refusing to copy only ${names.length} migrations from ${source} — expected at least 80`);
}

await rm(destination, { recursive: true, force: true });
await cp(source, destination, { recursive: true });

console.info(`copied ${names.length} migrations -> dist/migrations`);
