import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const routeRoot = join(root, "apps/api/app");
const failures = [];
let checked = 0;
let nameReferences = 0;

function routeFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...routeFiles(path));
    else if (entry.name === "route.ts") files.push(path);
  }
  return files;
}

for (const file of routeFiles(routeRoot)) {
  const source = readFileSync(file, "utf8");
  const directWrites = [...source.matchAll(/\.cookies\.(set|delete)\s*\(/g)];
  checked += directWrites.length;
  if (directWrites.length) {
    failures.push(`${relative(root, file).split(sep).join("/")} has ${directWrites.length} direct authentication cookie write(s)`);
  }

  const directNames = [...source.matchAll(/djay_(?:tenant|platform)_[a-z_]+/g)];
  nameReferences += directNames.length;
  if (directNames.length) failures.push(`${relative(root, file).split(sep).join("/")} duplicates an authentication cookie name`);
}

for (const entry of readdirSync(join(root, "apps/api/lib"), { withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith(".ts") || entry.name.startsWith("auth-cookies.")) continue;
  const file = join(root, "apps/api/lib", entry.name);
  const directNames = [...readFileSync(file, "utf8").matchAll(/djay_(?:tenant|platform)_[a-z_]+/g)];
  nameReferences += directNames.length;
  if (directNames.length) failures.push(`${relative(root, file).split(sep).join("/")} duplicates an authentication cookie name`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Authentication cookie policy passed; ${checked} direct route writes and ${nameReferences} duplicated names found.`);
