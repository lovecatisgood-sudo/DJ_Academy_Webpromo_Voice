import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const failures = [];
const routes = [
  ["apps/public-site/app/public/[...path]/route.ts", "public"],
  ["apps/tenant-web/app/public/[...path]/route.ts", "public"],
  ["apps/tenant-web/app/tenant/[...path]/route.ts", "tenant"],
  ["apps/platform-master/app/platform/[...path]/route.ts", "platform"],
];
const methods = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"];
const readinessRoutes = [
  ["apps/public-site/app/api/health/ready/route.ts", "public-site"],
  ["apps/tenant-web/app/api/health/ready/route.ts", "tenant-web"],
  ["apps/platform-master/app/api/health/ready/route.ts", "platform-master"],
];

for (const [file, prefix] of routes) {
  const source = readFileSync(resolve(root, file), "utf8");
  if (!source.includes("proxyApiRequest(request")) failures.push(`${file} does not use the shared runtime proxy`);
  if (!source.includes("process.env.API_APP_URL")) failures.push(`${file} does not resolve API_APP_URL at request time`);
  if (!source.includes(`prefix: "${prefix}"`)) failures.push(`${file} has the wrong API realm prefix`);
  for (const method of methods) {
    if (!source.includes(`handler as ${method}`)) failures.push(`${file} does not forward ${method}`);
  }
}

for (const [file, app] of readinessRoutes) {
  const source = readFileSync(resolve(root, file), "utf8");
  if (!source.includes("apiProxyReadiness(")) failures.push(`${file} does not use shared dependency readiness`);
  if (!source.includes("process.env.API_APP_URL")) failures.push(`${file} does not resolve API_APP_URL at request time`);
  if (!source.includes(`"${app}"`)) failures.push(`${file} reports the wrong application identity`);
}

for (const app of ["public-site", "tenant-web", "platform-master"]) {
  const file = `apps/${app}/next.config.ts`;
  const source = readFileSync(resolve(root, file), "utf8");
  if (/\brewrites\s*\(/.test(source)) failures.push(`${file} contains a build-time API rewrite`);
  if (source.includes("127.0.0.1:3103") || source.includes("API_APP_URL")) {
    failures.push(`${file} embeds API routing configuration at build time`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.info(`Runtime API proxy policy passed for ${routes.length} realm routes, ${readinessRoutes.length} readiness routes, and 7 HTTP methods.`);
