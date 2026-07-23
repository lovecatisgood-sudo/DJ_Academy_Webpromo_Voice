import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const routeRoot = join(root, "apps/api/app");
const mutationHandler = /export async function (POST|PUT|PATCH|DELETE)\b/g;
const failures = [];
let checked = 0;

function routeFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...routeFiles(path));
    else if (entry.name === "route.ts") files.push(path);
  }
  return files;
}

function requiresBrowserOrigin(relativePath) {
  return relativePath.startsWith("apps/api/app/tenant/")
    || relativePath.startsWith("apps/api/app/platform/")
    || relativePath.startsWith("apps/api/app/public/auth/")
    || relativePath.startsWith("apps/api/app/public/invitations/");
}

for (const file of routeFiles(routeRoot)) {
  const source = readFileSync(file, "utf8");
  const methods = [...source.matchAll(mutationHandler)].map((match) => match[1]);
  if (!methods.length) continue;
  const normalized = relative(root, file).split(sep).join("/");
  if (!requiresBrowserOrigin(normalized)) continue;
  checked += methods.length;
  if (!/hasTrustedOrigin\s*\(\s*request\s*\)/.test(source) && !/withTenantMutation\s*\(/.test(source)) {
    failures.push(`${normalized} exports ${methods.join(", ")} without hasTrustedOrigin or withTenantMutation`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Browser mutation origin coverage passed for ${checked} handlers.`);
