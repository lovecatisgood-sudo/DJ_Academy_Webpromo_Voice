import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createServer } from "node:http";
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
  assert(value.runtime === "node24", `${value.app} runtime contract`);
  assert(typeof value.readinessPath === "string" || value.readinessPath === null, `${value.app} readiness contract`);
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

const proxyPort = 3119;
const proxyOrigin = `http://127.0.0.1:${proxyPort}`;
const proxyUpstream = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (request.url === "/api/health/ready") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ status: "ready", app: "api" }));
    return;
  }
  response.writeHead(207, {
    "Content-Type": "application/json",
    "Set-Cookie": [
      "djay_proxy_smoke=accepted; Path=/; HttpOnly; SameSite=Lax",
      "djay_proxy_rotation=accepted; Path=/public/auth/mfa/challenge; HttpOnly; SameSite=Lax",
    ],
    "X-Proxy-Upstream": "accepted",
  });
  response.end(JSON.stringify({
    method: request.method,
    url: request.url,
    body: Buffer.concat(chunks).toString("utf8"),
    cookie: request.headers.cookie,
    origin: request.headers.origin,
  }));
});
await new Promise((done) => proxyUpstream.listen(proxyPort, "127.0.0.1", done));

const proxyPaths = {
  "platform-master": ["/platform/release-proxy-smoke"],
  "public-site": ["/public/release-proxy-smoke"],
  "tenant-web": ["/public/release-proxy-smoke", "/tenant/release-proxy-smoke"],
};
const nextApps = ["api", "platform-master", "public-site", "tenant-web"];
for (const [index, app] of nextApps.entries()) {
  const runtimeRoot = resolve(root, "apps", app, ".next", "standalone", "apps", app);
  const value = manifest(runtimeRoot);
  const actual = evidence(resolve(runtimeRoot, ".next", "static"));
  assert(JSON.stringify(actual) === JSON.stringify(value.staticAssets), `${app} static evidence mismatch`);
  const port = 3120 + index;
  const running = start("server.js", runtimeRoot, {
    PORT: String(port), HOSTNAME: "127.0.0.1", API_APP_URL: proxyOrigin,
  });
  try {
    const origin = `http://127.0.0.1:${port}`;
    const health = await waitFor(`${origin}${value.healthPath}`, running.child, running.output);
    const healthBody = await health.json();
    assert(healthBody.status === "ok" && healthBody.app === app, `${app} liveness contract`);
    const readiness = await fetch(`${origin}${value.readinessPath}`, { signal: AbortSignal.timeout(2_500) });
    const readinessBody = await readiness.json();
    if (app === "api") {
      assert(readiness.status === 503 && readinessBody.status === "unavailable", "API without database authority must fail readiness");
      const legal = await fetch(`${origin}/public/legal`, { signal: AbortSignal.timeout(2_500) });
      assert(legal.status === 503, `API without approved legal authority returned ${legal.status}`);
      assert(JSON.stringify(await legal.json()) === JSON.stringify({ status: "unavailable" }), "API legal authority did not fail safely");
      assert(legal.headers.get("cache-control") === "no-store", "API unavailable legal authority was cacheable");
    } else {
      assert(readiness.ok && readinessBody.status === "ready" && readinessBody.app === app, `${app} API dependency readiness contract`);
    }
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
    for (const path of proxyPaths[app] ?? []) {
      const payload = JSON.stringify({ artifact: app, path });
      const response = await fetch(`${origin}${path}?runtime=configured`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cookie": "browser_session=opaque",
          "Origin": origin,
        },
        body: payload,
        signal: AbortSignal.timeout(2_000),
      });
      assert(response.status === 207, `${app} runtime proxy returned ${response.status}`);
      assert(response.headers.get("x-proxy-upstream") === "accepted", `${app} runtime proxy lost upstream headers`);
      const cookies = response.headers.getSetCookie();
      assert(cookies.length === 2, `${app} runtime proxy did not preserve both Set-Cookie values`);
      assert(cookies.some((value) => value.includes("djay_proxy_smoke=accepted")), `${app} runtime proxy lost session Set-Cookie`);
      assert(cookies.some((value) => value.includes("djay_proxy_rotation=accepted")), `${app} runtime proxy lost rotation Set-Cookie`);
      const echoed = await response.json();
      assert(echoed.method === "POST" && echoed.url === `${path}?runtime=configured`, `${app} runtime proxy path or method mismatch`);
      assert(echoed.body === payload, `${app} runtime proxy body mismatch`);
      assert(echoed.cookie === "browser_session=opaque" && echoed.origin === origin, `${app} runtime proxy lost browser authority headers`);
    }
    console.info(`Verified ${app}: liveness, root security headers, ${assets.length} referenced assets, and ${proxyPaths[app]?.length ?? 0} runtime proxy path(s).`);
  } finally {
    await stop(running.child);
  }
}

const failClosedRoot = resolve(root, "apps", "public-site", ".next", "standalone", "apps", "public-site");
const failClosed = start("server.js", failClosedRoot, {
  PORT: "3125", HOSTNAME: "127.0.0.1", API_APP_URL: "",
});
try {
  await waitFor("http://127.0.0.1:3125/api/health/live", failClosed.child, failClosed.output);
  const response = await fetch("http://127.0.0.1:3125/public/release-proxy-smoke");
  assert(response.status === 503, `missing production API authority returned ${response.status}`);
  assert(JSON.stringify(await response.json()) === JSON.stringify({ status: "api_route_unavailable" }), "missing production API authority did not fail safely");
  const readiness = await fetch("http://127.0.0.1:3125/api/health/ready");
  assert(readiness.status === 503, `missing production API authority readiness returned ${readiness.status}`);
  assert(JSON.stringify(await readiness.json()) === JSON.stringify({ status: "unavailable", app: "public-site" }), "missing production API authority readiness did not fail safely");
  console.info("Verified web runtime: missing production API authority fails closed without a localhost fallback.");
} finally {
  await stop(failClosed.child);
}
await new Promise((done) => proxyUpstream.close(done));

const isolationRoot = mkdtempSync(resolve(tmpdir(), "djay-release-artifact-"));
process.once("exit", () => rmSync(isolationRoot, { recursive: true, force: true }));
const widgetInstallContract = JSON.parse(
  readFileSync(resolve(root, "packages", "shared", "src", "widget-install-contract.json"), "utf8"),
);
const widgetRoot = resolve(isolationRoot, "widget-cdn");
cpSync(resolve(root, "apps", "widget-cdn", "dist"), widgetRoot, { recursive: true });
const widgetManifest = manifest(widgetRoot);
assert(JSON.stringify(evidence(widgetRoot)) === JSON.stringify(widgetManifest.publicAssets), "widget-cdn evidence mismatch");
assert(widgetManifest.cacheControl === "public, max-age=300, must-revalidate", "widget-cdn cache contract");
assert(widgetManifest.responseHeaders?.["Access-Control-Allow-Origin"] === "*", "widget-cdn cross-origin module contract");
assert(widgetManifest.responseHeaders?.["Cross-Origin-Resource-Policy"] === "cross-origin", "widget-cdn resource policy");
assert(widgetManifest.responseHeaders?.["X-Content-Type-Options"] === "nosniff", "widget-cdn nosniff policy");
assert(Array.isArray(widgetManifest.assets) && widgetManifest.assets.length === 3, "widget-cdn product asset manifest");
const widgetRestricted = /\b(openai|anthropic|claude|gemini|gpt-[0-9]|provider[_ -]?(?:key|name|id)|model[_ -]?id|database_url|authorization_service_token)\b/i;
const widgetSources = {
  flowbot: "packages/flowbot-widget/dist/index.js",
  "ai-chat": "packages/ai-chat-widget/dist/index.js",
  voice: "packages/voice-widget/dist/index.js",
};
for (const asset of widgetManifest.assets) {
  assert(["flowbot", "ai-chat", "voice"].includes(asset.product), `unknown widget product ${asset.product}`);
  assert(asset.publicPath === widgetInstallContract.products[asset.product]?.publicPath, `${asset.product} public path contract`);
  assert(asset.contentType === "text/javascript; charset=utf-8", `${asset.product} content type contract`);
  assert(/^sha384-[A-Za-z0-9+/]{64}$/.test(asset.integrity), `${asset.product} integrity contract`);
  const bundlePath = resolve(widgetRoot, asset.publicPath.slice(1));
  const bundleBytes = readFileSync(bundlePath);
  const bundle = bundleBytes.toString("utf8");
  const integrity = `sha384-${createHash("sha384").update(bundleBytes).digest("base64")}`;
  assert(asset.integrity === integrity, `${asset.product} integrity mismatch`);
  assert(bundleBytes.equals(readFileSync(resolve(root, widgetSources[asset.product]))), `${asset.product} artifact differs from built bundle`);
  assert(bundle.length > 5_000, `${asset.product} bundle is unexpectedly empty`);
  assert(bundle.includes("#126149") && bundle.includes("#f2c14e"), `${asset.product} bundle lost canonical DJAY tokens`);
  assert(!bundle.includes("#163c32") && !bundle.includes("#ca7b32"), `${asset.product} bundle retained legacy widget colors`);
  assert(bundle.includes("aria-expanded") && bundle.includes("dialog"), `${asset.product} bundle lost accessible shell semantics`);
  assert(!widgetRestricted.test(bundle), `${asset.product} bundle exposed restricted runtime identity`);
}
console.info("Verified widget-cdn: three versioned, integrity-recorded, cross-origin-safe, branded browser bundles.");

const widgetRuntime = start("index.js", widgetRoot, { PORT: "3126" });
try {
  const health = await waitFor("http://127.0.0.1:3126/health/live", widgetRuntime.child, widgetRuntime.output);
  assert((await health.json()).app === "widget-cdn", "widget-cdn liveness contract");
  for (const asset of widgetManifest.assets) {
    const response = await fetch(`http://127.0.0.1:3126${asset.publicPath}`);
    assert(response.ok, `${asset.product} CDN origin returned ${response.status}`);
    assert(response.headers.get("access-control-allow-origin") === "*", `${asset.product} CDN CORS`);
    assert(response.headers.get("cross-origin-resource-policy") === "cross-origin", `${asset.product} CDN CORP`);
    assert(response.headers.get("cache-control") === "public, max-age=300, must-revalidate", `${asset.product} CDN cache contract`);
  }
  assert((await fetch("http://127.0.0.1:3126/release-manifest.json")).status === 404, "widget CDN exposed release manifest");
  console.info("Verified widget-cdn runtime: health, admitted assets, cross-origin headers, and deny-by-default paths.");
} finally {
  await stop(widgetRuntime.child);
}

const aiRoot = resolve(isolationRoot, "ai-gateway");
cpSync(resolve(root, "apps", "ai-gateway", "dist"), aiRoot, { recursive: true });
const aiManifest = manifest(aiRoot);
assert(evidence(aiRoot).sha256 === aiManifest.bundles.sha256, "ai-gateway bundle evidence mismatch");
const ai = start("index.js", aiRoot, {
  PORT: "3127",
  AI_TEXT_GATEWAY_SERVICE_TOKEN: "release-artifact-ai-service-token-00000001",
  AI_TEXT_PROVIDER: "openai",
  OPENAI_API_KEY: "sk-release-artifact-runtime-key-00000001",
  OPENAI_RESPONSES_MODEL: "restricted-release-model",
});
try {
  const health = await waitFor("http://127.0.0.1:3127/health/live", ai.child, ai.output);
  assert((await health.json()).status === "live", "ai-gateway liveness contract");
  const ready = await fetch("http://127.0.0.1:3127/health/ready");
  assert(ready.ok && JSON.stringify(await ready.json()) === JSON.stringify({ status: "ready" }), "ai-gateway readiness contract");
  const unauthorized = await fetch("http://127.0.0.1:3127/v1/generate", { method: "POST", body: "{}" });
  assert(unauthorized.status === 404, "ai-gateway exposed its restricted generation route");
  console.info("Verified ai-gateway: liveness, readiness, and restricted route authorization.");
} finally {
  await stop(ai.child);
}

const rejectedAi = spawn(process.execPath, ["index.js"], {
  cwd: aiRoot,
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: "3128",
    AI_TEXT_GATEWAY_SERVICE_TOKEN: "replace-with-independent-ai-service-token",
    AI_TEXT_PROVIDER: "openai",
    OPENAI_API_KEY: "replace-with-openai-api-key",
    OPENAI_RESPONSES_MODEL: "restricted-release-model",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let rejectedAiOutput = "";
rejectedAi.stdout.on("data", (chunk) => { rejectedAiOutput += chunk; });
rejectedAi.stderr.on("data", (chunk) => { rejectedAiOutput += chunk; });
const rejectedAiExit = await new Promise((done) => rejectedAi.once("exit", done));
assert(rejectedAiExit !== 0, "ai-gateway accepted example production credentials");
assert(rejectedAiOutput.includes("contains an example value"), "ai-gateway did not identify rejected example authority");
assert(!rejectedAiOutput.includes("replace-with-openai-api-key"), "ai-gateway disclosed rejected credential material");
console.info("Verified ai-gateway: copied example production credentials fail startup without value disclosure.");

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

const rejectedVoice = spawn(process.execPath, ["index.js"], {
  cwd: voiceRoot,
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: "3126",
    VOICE_AUTHORIZATION_ENDPOINT: "http://127.0.0.1:9/authorize",
    VOICE_HEARTBEAT_ENDPOINT: "http://127.0.0.1:9/heartbeat",
    VOICE_DISCONNECT_ENDPOINT: "http://127.0.0.1:9/disconnect",
    VOICE_FINISH_ENDPOINT: "http://127.0.0.1:9/finish",
    VOICE_AUTHORIZATION_SERVICE_TOKEN: "replace-with-independent-voice-service-token",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let rejectedVoiceOutput = "";
rejectedVoice.stdout.on("data", (chunk) => { rejectedVoiceOutput += chunk; });
rejectedVoice.stderr.on("data", (chunk) => { rejectedVoiceOutput += chunk; });
const rejectedVoiceExit = await new Promise((done) => rejectedVoice.once("exit", done));
assert(rejectedVoiceExit !== 0, "voice-gateway accepted an example production credential");
assert(rejectedVoiceOutput.includes("VOICE_AUTHORIZATION_SERVICE_TOKEN contains an example value"), "voice-gateway did not identify rejected example authority");
assert(!rejectedVoiceOutput.includes("replace-with-independent-voice-service-token"), "voice-gateway disclosed rejected credential material");
console.info("Verified voice-gateway: copied example production credentials fail startup without value disclosure.");

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
console.info("All eight production release artifacts passed packaging and runtime smoke acceptance.");
