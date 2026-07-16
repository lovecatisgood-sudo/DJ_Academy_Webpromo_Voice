import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const apps = ["public-site", "tenant-web", "platform-master", "api"];
const failures = [];

for (const app of apps) {
  const appRoot = resolve(root, "apps", app, "app");
  const errorPath = resolve(appRoot, "error.tsx");
  const notFoundPath = resolve(appRoot, "not-found.tsx");
  const stylesPath = resolve(appRoot, "styles.css");
  for (const path of [errorPath, notFoundPath, stylesPath]) {
    if (!existsSync(path)) failures.push(`${app} is missing ${path.slice(appRoot.length + 1)}`);
  }
  if (!existsSync(errorPath) || !existsSync(notFoundPath) || !existsSync(stylesPath)) continue;
  const errorSource = readFileSync(errorPath, "utf8");
  const notFoundSource = readFileSync(notFoundPath, "utf8");
  const stylesSource = readFileSync(stylesPath, "utf8");
  if (!errorSource.startsWith('"use client";') || !errorSource.includes("reset")) failures.push(`${app} render-error boundary has no client retry`);
  if (!errorSource.includes("recovery-page") || !notFoundSource.includes("recovery-page")) failures.push(`${app} recovery pages do not use the shared structure`);
  if (!stylesSource.includes('packages/shared/recovery.css')) failures.push(`${app} does not import the shared recovery visual system`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`UI recovery boundaries passed for ${apps.length} browser realms.`);
