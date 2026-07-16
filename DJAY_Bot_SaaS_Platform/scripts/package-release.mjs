import { createHash } from "node:crypto";
import {
  cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nextApps = ["api", "platform-master", "public-site", "tenant-web"];

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

for (const [app, entries] of [
  ["voice-gateway", ["index.js"]],
  ["workers", ["index.js", "bootstrap-platform-owner.js", "migrate-flowbot-v1.js", "migrate-voice-text-v2.js"]],
]) {
  const directory = resolve(root, "apps", app, "dist");
  for (const entry of entries) {
    if (!existsSync(resolve(directory, entry))) fail(`${app}/${entry} is missing`);
  }
  if (app === "workers") {
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
    const optionalRoot = resolve(root, "node_modules", ".pnpm", "node_modules", "@node-rs");
    const nativePackages = readdirSync(optionalRoot).filter((name) => name.startsWith("argon2-")).sort();
    if (nativePackages.length === 0) fail("worker Argon2 native runtime is missing");
    for (const name of nativePackages) {
      copyRuntimeDependency(resolve(optionalRoot, name), resolve(runtimeModules, "@node-rs", name));
    }
  }
  const evidence = treeEvidence(directory);
  writeManifest(directory, {
    schema: "djay.release-artifact.v1",
    app,
    runtime: "node24",
    entrypoint: "index.js",
    healthPath: app === "voice-gateway" ? "/health/live" : null,
    readinessPath: app === "voice-gateway" ? "/health/ready" : null,
    bundles: evidence,
  });
  console.info(`Packaged ${app}: ${evidence.fileCount} bundles (${evidence.sha256}).`);
}
