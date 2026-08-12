import { existsSync, readFileSync, readdirSync } from "node:fs";
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

const tenantWorkspaceRoot = resolve(root, "apps/tenant-web/app/workspace");
const tenantPages = readdirSync(tenantWorkspaceRoot, { recursive: true })
  .filter((entry) => String(entry).endsWith("page.tsx"))
  .map((entry) => resolve(tenantWorkspaceRoot, String(entry)));
for (const pagePath of tenantPages) {
  const source = readFileSync(pagePath, "utf8");
  if (!source.includes("<WorkspaceSidebar")) continue;
  const relativePath = pagePath.slice(tenantWorkspaceRoot.length + 1);
  if (!source.includes('id="workspace-main"')) failures.push(`${relativePath} renders workspace navigation without its skip-link target`);
  if (!source.includes('tabIndex={-1}')) failures.push(`${relativePath} skip-link target cannot receive focus`);
}

const brandSource = readFileSync(resolve(root, "packages/shared/brand.css"), "utf8");
const stylePaths = apps.slice(0, 3).map((app) => resolve(root, "apps", app, "app/styles.css"));
const allStyles = [brandSource, ...stylePaths.map((path) => readFileSync(path, "utf8"))].join("\n");
const definedTokens = new Set([...allStyles.matchAll(/(--djay-[a-z0-9-]+)\s*:/g)].map((match) => match[1]));
for (const match of allStyles.matchAll(/var\((--djay-[a-z0-9-]+)/g)) {
  if (!definedTokens.has(match[1])) failures.push(`Design token ${match[1]} is referenced but never defined`);
}

const flowBotPage = readFileSync(resolve(tenantWorkspaceRoot, "flowbot/page.tsx"), "utf8");
const aiChatPage = readFileSync(resolve(tenantWorkspaceRoot, "ai-chat/page.tsx"), "utf8");
for (const [label, source] of [["FlowBot", flowBotPage], ["AI Chat", aiChatPage]]) {
  if (source.includes("social-connections") || source.includes("connect/line")) {
    failures.push(`${label} exposes deferred social-channel acquisition in the non-social tenant UI`);
  }
}
const lineLayout = readFileSync(resolve(tenantWorkspaceRoot, "flowbot/connect/line/layout.tsx"), "utf8");
if (!lineLayout.includes('process.env.SOCIAL_CHANNELS_RELEASE_ENABLED !== "true"') || !lineLayout.includes("notFound()")) {
  failures.push("Direct LINE setup route is not fail-closed behind the social release gate");
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`UI recovery boundaries passed for ${apps.length} browser realms.`);
