import { createHash } from "node:crypto";
import {
  cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nextApps = ["api", "platform-master", "public-site", "tenant-web"];
const widgetInstallContract = JSON.parse(
  readFileSync(resolve(root, "packages", "shared", "src", "widget-install-contract.json"), "utf8"),
);

function fail(message) {
  throw new Error(`release_package_invalid: ${message}`);
}

function filesUnder(directory) {
  const files = [];
  function visit(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = resolve(current, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && entry.name !== "release-manifest.json") files.push(path);
    }
  }
  visit(directory);
  return files.sort((left, right) => relative(directory, left).localeCompare(relative(directory, right)));
}

function treeEvidence(directory) {
  const hash = createHash("sha256");
  const files = filesUnder(directory);
  for (const file of files) {
    hash.update(relative(directory, file));
    hash.update("\0");
    hash.update(readFileSync(file));
    hash.update("\0");
  }
  return { fileCount: files.length, sha256: hash.digest("hex") };
}

function replaceDirectory(source, destination) {
  if (!existsSync(source)) fail(`missing ${relative(root, source)}`);
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination, { recursive: true });
}

function writeManifest(directory, value) {
  writeFileSync(resolve(directory, "release-manifest.json"), `${JSON.stringify(value, null, 2)}\n`);
}

function sriSha384(file) {
  return `sha384-${createHash("sha384").update(readFileSync(file)).digest("base64")}`;
}

function copyRuntimeDependency(source, destination) {
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(realpathSync(source), destination, { recursive: true });
}

for (const app of nextApps) {
  const appRoot = resolve(root, "apps", app);
  const buildRoot = resolve(appRoot, ".next");
  const runtimeRoot = resolve(buildRoot, "standalone", "apps", app);
  const entrypoint = resolve(runtimeRoot, "server.js");
  const buildIdPath = resolve(buildRoot, "BUILD_ID");
  if (!existsSync(entrypoint) || !statSync(entrypoint).isFile()) fail(`${app} standalone server is missing`);
  if (!existsSync(buildIdPath)) fail(`${app} BUILD_ID is missing`);

  const staticSource = resolve(buildRoot, "static");
  const staticDestination = resolve(runtimeRoot, ".next", "static");
  replaceDirectory(staticSource, staticDestination);
  const publicSource = resolve(appRoot, "public");
  if (existsSync(publicSource)) replaceDirectory(publicSource, resolve(runtimeRoot, "public"));

  const staticEvidence = treeEvidence(staticDestination);
  if (staticEvidence.fileCount === 0) fail(`${app} packaged no static assets`);
  writeManifest(runtimeRoot, {
    schema: "djay.release-artifact.v1",
    app,
    runtime: "node24",
    entrypoint: "server.js",
    healthPath: "/api/health/live",
    readinessPath: "/api/health/ready",
    buildId: readFileSync(buildIdPath, "utf8").trim(),
    staticAssets: staticEvidence,
  });
  console.info(`Packaged ${app}: ${staticEvidence.fileCount} static assets (${staticEvidence.sha256}).`);
}

const widgetCdnRoot = resolve(root, "apps", "widget-cdn", "dist");
rmSync(widgetCdnRoot, { recursive: true, force: true });
mkdirSync(widgetCdnRoot, { recursive: true });
cpSync(resolve(root, "apps", "widget-cdn", "build", "index.js"), resolve(widgetCdnRoot, "index.js"));
const widgetSources = {
  flowbot: "packages/flowbot-widget/dist/index.js",
  "ai-chat": "packages/ai-chat-widget/dist/index.js",
  voice: "packages/voice-widget/dist/index.js",
};
const widgetAssets = Object.entries(widgetInstallContract.products).map(([product, productContract]) => {
  const source = widgetSources[product];
  if (!source) fail(`missing source contract for ${product}`);
  const publicPath = productContract.publicPath;
  const sourcePath = resolve(root, source);
  if (!existsSync(sourcePath)) fail(`missing ${source}`);
  const destination = resolve(widgetCdnRoot, publicPath.slice(1));
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(sourcePath, destination);
  return { product, publicPath, contentType: "text/javascript; charset=utf-8", integrity: sriSha384(destination) };
});
const widgetEvidence = treeEvidence(widgetCdnRoot);
writeManifest(widgetCdnRoot, {
  schema: "djay.release-artifact.v1",
  app: "widget-cdn",
  runtime: "node24",
  entrypoint: "index.js",
  healthPath: "/health/live",
  readinessPath: "/health/ready",
  cacheControl: "public, max-age=300, must-revalidate",
  responseHeaders: {
    "Access-Control-Allow-Origin": "*",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "X-Content-Type-Options": "nosniff",
  },
  assets: widgetAssets,
  publicAssets: widgetEvidence,
});
console.info(`Packaged widget-cdn: ${widgetEvidence.fileCount} assets (${widgetEvidence.sha256}).`);

for (const [app, entries] of [
  ["ai-gateway", ["index.js"]],
  ["voice-gateway", ["index.js"]],
  ["workers", ["index.js", "bootstrap-platform-owner.js", "migrate-database.js", "migrate-flowbot-v1.js", "migrate-voice-text-v2.js"]],
]) {
  const directory = resolve(root, "apps", app, "dist");
  for (const entry of entries) {
    if (!existsSync(resolve(directory, entry))) fail(`${app}/${entry} is missing`);
  }
  if (app === "workers") {
    replaceDirectory(resolve(root, "packages", "db", "migrations"), resolve(directory, "migrations"));
    const runtimeModules = resolve(directory, "node_modules");
    rmSync(runtimeModules, { recursive: true, force: true });
    copyRuntimeDependency(
      resolve(root, "apps", "workers", "node_modules", "postgres"),
      resolve(runtimeModules, "postgres"),
    );
    copyRuntimeDependency(
      resolve(root, "apps", "workers", "node_modules", "@node-rs", "argon2"),
      resolve(runtimeModules, "@node-rs", "argon2"),
    );
    copyRuntimeDependency(
      resolve(root, "apps", "workers", "node_modules", "@napi-rs", "canvas"),
      resolve(runtimeModules, "@napi-rs", "canvas"),
    );
    const optionalRoot = resolve(root, "node_modules", ".pnpm", "node_modules", "@node-rs");
    const nativePackages = readdirSync(optionalRoot).filter((name) => name.startsWith("argon2-")).sort();
    if (nativePackages.length === 0) fail("worker Argon2 native runtime is missing");
    for (const name of nativePackages) {
      copyRuntimeDependency(resolve(optionalRoot, name), resolve(runtimeModules, "@node-rs", name));
    }
    const canvasOptionalRoot = resolve(root, "node_modules", ".pnpm", "node_modules", "@napi-rs");
    const canvasNativePackages = readdirSync(canvasOptionalRoot).filter((name) => name.startsWith("canvas-")).sort();
    if (canvasNativePackages.length === 0) fail("worker Canvas native runtime is missing");
    for (const name of canvasNativePackages) {
      copyRuntimeDependency(resolve(canvasOptionalRoot, name), resolve(runtimeModules, "@napi-rs", name));
    }
  }
  const evidence = treeEvidence(directory);
  writeManifest(directory, {
    schema: "djay.release-artifact.v1",
    app,
    runtime: "node24",
    entrypoint: "index.js",
    healthPath: app.endsWith("gateway") || app === "workers" ? "/health/live" : null,
    readinessPath: app.endsWith("gateway") || app === "workers" ? "/health/ready" : null,
    bundles: evidence,
  });
  console.info(`Packaged ${app}: ${evidence.fileCount} bundles (${evidence.sha256}).`);
}
