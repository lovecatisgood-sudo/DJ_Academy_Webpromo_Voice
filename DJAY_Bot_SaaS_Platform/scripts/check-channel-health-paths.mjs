import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * CHN-007 — every product that can connect a social channel must also expose a
 * self-test/health path for that connection.
 *
 * Deliberately data-driven: the product list is discovered from the filesystem, never
 * hardcoded, so adding a new product (or a new channel under an existing product)
 * cannot silently skip the requirement. Adding `tenant/<product>/social-connections/`
 * immediately makes this check demand a matching health route.
 */

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const tenantRoutes = resolve(root, "apps/api/app/tenant");
const failures = [];

const directories = (path) => existsSync(path)
  ? readdirSync(path).filter((entry) => statSync(resolve(path, entry)).isDirectory())
  : [];

// A "connect route" is any tenant product exposing a social-connections collection.
const connectRoutes = directories(tenantRoutes).flatMap((product) => {
  const collection = resolve(tenantRoutes, product, "social-connections");
  return existsSync(resolve(collection, "route.ts")) ? [{ product, collection }] : [];
});

if (!connectRoutes.length) {
  console.error("No tenant social-connections routes were discovered; this check would pass vacuously.");
  process.exit(1);
}

// Channels are declared in the connect route's request schema, not as separate routes,
// so they are read from source to keep the report specific about what is unprotected.
const channelsOf = (collection) => {
  const source = readFileSync(resolve(collection, "route.ts"), "utf8");
  const found = [...source.matchAll(/z\.literal\("(line|messenger|whatsapp|instagram)"\)/g)].map((match) => match[1]);
  return [...new Set(found)];
};

for (const { product, collection } of connectRoutes) {
  const channels = channelsOf(collection);
  const health = resolve(collection, "[connectionId]", "health", "route.ts");
  const label = channels.length ? `${product} x ${channels.join(", ")}` : product;
  if (!existsSync(health)) {
    failures.push(`CHN-007: ${label} has a social connect route but no health route at `
      + `apps/api/app/tenant/${product}/social-connections/[connectionId]/health/route.ts`);
    continue;
  }
  const source = readFileSync(health, "utf8");
  if (!/export async function (GET|POST)\s*\(/.test(source)) {
    failures.push(`CHN-007: ${label} health route exports no GET or POST handler`);
  }
  // A health path that never records its verdict leaves the connection status stale,
  // which is the defect CHN-007 exists to prevent.
  if (!source.includes("recordHealth")) {
    failures.push(`CHN-007: ${label} health route does not persist a verdict via recordHealth`);
  }
  for (const marker of ["tenantRoleAllows", "hasTrustedOrigin"]) {
    if (!source.includes(marker)) failures.push(`CHN-007: ${label} health route is missing ${marker}`);
  }
}

// LINE's two silent-failure prerequisites must be visible wherever LINE can be connected.
for (const { product, collection } of connectRoutes) {
  if (!channelsOf(collection).includes("line")) continue;
  const health = resolve(collection, "[connectionId]", "health", "route.ts");
  if (!existsSync(health)) continue;
  const sources = [readFileSync(health, "utf8"), readFileSync(resolve(root, "apps/api/lib/social-health.ts"), "utf8")].join("\n");
  for (const marker of ["lineAutoReplyBlocksBot", "webhookEndpointActive"]) {
    if (!sources.includes(marker)) {
      failures.push(`CHN-007: ${product} connects LINE but its health path never reports ${marker}`);
    }
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.info(`Channel health paths present for every product with a social connect route (${connectRoutes.map((entry) => entry.product).join(", ")}).`);
