import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".mjs"]);
const ignored = new Set(["node_modules", ".next", "dist", ".turbo", "coverage"]);

const rules = [
  {
    area: "apps/public-site",
    forbidden: ["@djay/db", "@djay/provider-gateway", "@djay/platform-internal"],
  },
  {
    area: "apps/tenant-web",
    forbidden: ["@djay/db", "@djay/provider-gateway", "@djay/platform-internal"],
  },
  {
    area: "apps/platform-master",
    forbidden: ["@djay/db/raw"],
  },
  {
    area: "apps/api",
    forbidden: ["@djay/db"],
  },
  {
    area: "packages/flowbot-domain",
    forbidden: ["@djay/provider-gateway", "@djay/sales-core"],
  },
  {
    area: "packages/flowbot-engine",
    forbidden: ["@djay/provider-gateway", "@djay/sales-core"],
  },
  {
    area: "packages/flowbot-widget",
    forbidden: ["@djay/provider-gateway", "@djay/sales-core"],
  },
  {
    area: "packages/flowbot-migration",
    forbidden: ["@djay/provider-gateway", "@djay/sales-core"],
  },
  {
    area: "packages/ai-chat-widget",
    forbidden: ["@djay/provider-gateway", "@djay/sales-core", "@djay/db"],
  },
];

const providerTerms = ["openai", "gemini", "anthropic", "gpt-", "claude-"];
const providerNeutralAreas = [
  "apps/public-site", "apps/tenant-web", "packages/shared",
  "packages/flowbot-domain", "packages/flowbot-engine", "packages/flowbot-widget", "packages/flowbot-migration",
  "packages/ai-chat-widget", "packages/sales-core",
];
const failures = [];

function filesUnder(directory) {
  const absolute = join(root, directory);
  const files = [];
  const visit = (current) => {
    for (const name of readdirSync(current)) {
      if (ignored.has(name)) continue;
      const path = join(current, name);
      if (statSync(path).isDirectory()) visit(path);
      else if (sourceExtensions.has(extname(path))) files.push(path);
    }
  };

  try {
    visit(absolute);
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
  return files;
}

for (const rule of rules) {
  for (const file of filesUnder(rule.area)) {
    const source = readFileSync(file, "utf8").toLowerCase();
    for (const forbidden of rule.forbidden) {
      const normalized = relative(root, file).split(sep).join("/");
      if (
        (normalized === "apps/api/lib/container.ts" || normalized === "apps/api/next.config.ts")
        && forbidden === "@djay/db"
      ) continue;
      if (source.includes(forbidden.toLowerCase())) {
        failures.push(`${relative(root, file)} imports or names forbidden module ${forbidden}`);
      }
    }
  }
}

for (const area of providerNeutralAreas) {
  for (const file of filesUnder(area)) {
    if (file.endsWith(".test.ts") || file.endsWith(".test.tsx")) continue;
    const source = readFileSync(file, "utf8").toLowerCase();
    for (const term of providerTerms) {
      if (source.includes(term)) {
        failures.push(`${relative(root, file)} contains restricted provider/model term ${term}`);
      }
    }
  }
}

for (const area of ["apps", "packages"]) {
  for (const file of filesUnder(area)) {
    const normalized = relative(root, file).split(sep).join("/");
    if (normalized.startsWith("packages/db/")) continue;
    const source = readFileSync(file, "utf8").toLowerCase();
    for (const databaseModule of ["from \"postgres\"", "from 'postgres'", "from \"drizzle-orm", "from 'drizzle-orm"]) {
      if (source.includes(databaseModule)) {
        failures.push(`${normalized} imports database module outside packages/db: ${databaseModule}`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Import/provider boundaries passed on ${process.platform}${sep}.`);
