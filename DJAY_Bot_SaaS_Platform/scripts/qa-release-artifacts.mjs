import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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

function evidence(directory) {
  const hash = createHash("sha256");
  const files = filesUnder(directory);
  for (const file of files) {
    hash.update(relative(directory, file)); hash.update("\0");
    hash.update(readFileSync(file)); hash.update("\0");
  }
  return { fileCount: files.length, sha256: hash.digest("hex") };
}

function assert(condition, message) {
  if (!condition) throw new Error(`release_artifact_qa_failed: ${message}`);
}

function assertSecurityHeaders(response, app) {
  const csp = response.headers.get("content-security-policy") || "";
  for (const directive of ["default-src 'self'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'", "object-src 'none'"]) {
    assert(csp.includes(directive), `${app} CSP missing ${directive}`);
  }
  const expected = {
    "cross-origin-opener-policy": "same-origin",
    "origin-agent-cluster": "?1",
    "referrer-policy": "strict-origin-when-cross-origin",
    "strict-transport-security": "max-age=63072000; includeSubDomains; preload",
    "x-content-type-options": "nosniff",
    "x-dns-prefetch-control": "off",
    "x-frame-options": "DENY",
    "x-permitted-cross-domain-policies": "none",
  };
  for (const [key, value] of Object.entries(expected)) assert(response.headers.get(key) === value, `${app} ${key}`);
  const permissions = response.headers.get("permissions-policy") || "";
  const microphone = app === "tenant-web" ? "microphone=(self)" : "microphone=()";
  for (const policy of ["camera=()", "geolocation=()", microphone, "payment=()", "usb=()"]) {
    assert(permissions.includes(policy), `${app} Permissions-Policy missing ${policy}`);
  }
  assert(!response.headers.has("x-powered-by"), `${app} exposed framework identity`);
}

function manifest(directory) {
  const value = JSON.parse(readFileSync(resolve(directory, "release-manifest.json"), "utf8"));
  assert(value.schema === "djay.release-artifact.v1", `${value.app ?? directory} manifest schema`);
  assert(value.runtime === "node24", `${value.app} runtime must be Node 24`);
  return value;
}

async function stop(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((done) => child.once("exit", done)),
    new Promise((done) => setTimeout(done, 2_000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function waitFor(url, child, output) {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`process exited before ${url}: ${output.value.slice(-500)}`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(500) });
      if (response.ok) return response;
    } catch {}
    await new Promise((done) => setTimeout(done, 50));
  }
  throw new Error(`timeout waiting for ${url}: ${output.value.slice(-500)}`);
}

function start(entrypoint, cwd, environment) {
  const child = spawn(process.execPath, [entrypoint], {
    cwd,
    env: { ...process.env, NODE_ENV: "production", ...environment },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = { value: "" };
  child.stdout.on("data", (chunk) => { output.value += chunk; });
  child.stderr.on("data", (chunk) => { output.value += chunk; });
  return { child, output };
}

const nextApps = ["api", "platform-master", "public-site", "tenant-web"];
for (const [index, app] of nextApps.entries()) {
  const runtimeRoot = resolve(root, "apps", app, ".next", "standalone", "apps", app);
  const value = manifest(runtimeRoot);
  const actual = evidence(resolve(runtimeRoot, ".next", "static"));
  assert(JSON.stringify(actual) === JSON.stringify(value.staticAssets), `${app} static evidence mismatch`);
  const port = 3120 + index;
  const running = start("server.js", runtimeRoot, {
    PORT: String(port), HOSTNAME: "127.0.0.1", API_APP_URL: "http://127.0.0.1:9",
  });
  try {
    const origin = `http://127.0.0.1:${port}`;
    const health = await waitFor(`${origin}${value.healthPath}`, running.child, running.output);
    const healthBody = await health.json();
    assert(healthBody.status === "ok" && healthBody.app === app, `${app} liveness contract`);
    const page = await fetch(origin, { signal: AbortSignal.timeout(2_000) });
    assert(page.ok, `${app} root returned ${page.status}`);
    assertSecurityHeaders(page, app);
    const html = await page.text();
    const assets = [...new Set([...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"?]+)(?:\?[^\"]*)?"/g)].map((match) => match[1]))];
    assert(assets.length > 0, `${app} root references no static assets`);
    for (const asset of assets) {
      const response = await fetch(`${origin}${asset}`, { signal: AbortSignal.timeout(2_000) });
      assert(response.ok, `${app} asset ${asset} returned ${response.status}`);
    }
    console.info(`Verified ${app}: liveness, root security headers, and ${assets.length} referenced assets.`);
  } finally {
    await stop(running.child);
  }
}

const isolationRoot = mkdtempSync(resolve(tmpdir(), "djay-release-artifact-"));
process.once("exit", () => rmSync(isolationRoot, { recursive: true, force: true }));
const voiceRoot = resolve(isolationRoot, "voice-gateway");
cpSync(resolve(root, "apps", "voice-gateway", "dist"), voiceRoot, { recursive: true });
const voiceManifest = manifest(voiceRoot);
assert(evidence(voiceRoot).sha256 === voiceManifest.bundles.sha256, "voice-gateway bundle evidence mismatch");
const voice = start("index.js", voiceRoot, {
  PORT: "3124",
  VOICE_AUTHORIZATION_ENDPOINT: "http://127.0.0.1:9/authorize",
  VOICE_HEARTBEAT_ENDPOINT: "http://127.0.0.1:9/heartbeat",
  VOICE_DISCONNECT_ENDPOINT: "http://127.0.0.1:9/disconnect",
  VOICE_FINISH_ENDPOINT: "http://127.0.0.1:9/finish",
  VOICE_AUTHORIZATION_SERVICE_TOKEN: "release-artifact-smoke-token-00000001",
});
try {
  const health = await waitFor("http://127.0.0.1:3124/health/live", voice.child, voice.output);
  assert((await health.json()).status === "live", "voice-gateway liveness contract");
  const ready = await fetch("http://127.0.0.1:3124/health/ready");
  assert(ready.status === 503, "voice-gateway without media must fail readiness");
  assert(JSON.stringify(await ready.json()) === JSON.stringify({ status: "not_ready" }), "voice readiness must be provider-neutral");
  console.info("Verified voice-gateway: liveness and fail-closed readiness.");
} finally {
  await stop(voice.child);
}

const workerRoot = resolve(isolationRoot, "workers");
cpSync(resolve(root, "apps", "workers", "dist"), workerRoot, { recursive: true });
const workerManifest = manifest(workerRoot);
assert(evidence(workerRoot).sha256 === workerManifest.bundles.sha256, "worker bundle evidence mismatch");
const workerEnv = { ...process.env, NODE_ENV: "production" };
delete workerEnv.WORKER_DATABASE_URL;
const worker = spawn(process.execPath, ["index.js"], { cwd: workerRoot, env: workerEnv, stdio: ["ignore", "pipe", "pipe"] });
let workerOutput = "";
worker.stdout.on("data", (chunk) => { workerOutput += chunk; });
worker.stderr.on("data", (chunk) => { workerOutput += chunk; });
const workerExit = await new Promise((done) => worker.once("exit", done));
assert(workerExit !== 0, "worker accepted missing database authority");
assert(workerOutput.includes("WORKER_DATABASE_URL"), "worker did not report the missing authority field");
assert(!/postgres(?:ql)?:\/\//i.test(workerOutput), "worker startup output disclosed a database URL");
console.info("Verified workers: bundles present and missing database authority fails closed.");

rmSync(isolationRoot, { recursive: true, force: true });
console.info("All six production release artifacts passed packaging and runtime smoke acceptance.");
