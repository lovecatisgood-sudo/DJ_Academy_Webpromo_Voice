import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".mjs"]);
const ignored = new Set(["node_modules", ".next", "dist", ".turbo", "coverage"]);
const failures = [];

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function sourceFiles(directory) {
  const files = [];
  const visit = (current) => {
    for (const name of readdirSync(current)) {
      if (ignored.has(name)) continue;
      const path = join(current, name);
      if (statSync(path).isDirectory()) visit(path);
      else if (sourceExtensions.has(extname(path))) files.push(path);
    }
  };
  visit(resolve(root, directory));
  return files;
}

const apiContainer = read("apps/api/lib/container.ts");
if (!apiContainer.includes("createHttpTextProviderGateway")) failures.push("API does not route AI Text through the internal HTTP gateway");
if (!apiContainer.includes('NODE_ENV === "production" && !env.AI_TEXT_GATEWAY_ENDPOINT')) failures.push("API production startup does not require the AI gateway endpoint");
if (!apiContainer.includes('NODE_ENV === "production" && !env.AI_TEXT_GATEWAY_SERVICE_TOKEN')) failures.push("API production startup does not require AI gateway service authority");
if (/createOpenAIResponsesGateway|createCompatibleChatTextGateway|OPENAI_API_KEY|XAI_API_KEY|GEMINI_API_KEY|AI_TEXT_API_KEY/.test(apiContainer)) {
  failures.push("API holds a direct provider adapter or credential field");
}

const gatewayServer = read("apps/ai-gateway/src/server.ts");
if (!gatewayServer.includes("createOpenAIResponsesGateway") || !gatewayServer.includes("createCompatibleChatTextGateway")) {
  failures.push("Restricted AI gateway does not own every direct Text adapter");
}
if (!gatewayServer.includes('request.headers.get("authorization") !== `Bearer ${config.serviceToken}`')) {
  failures.push("Restricted AI gateway generation route is not service-token protected");
}
const gatewayEntry = read("apps/ai-gateway/src/index.ts");
if (!/OPENAI_API_KEY/.test(gatewayEntry) || !/XAI_API_KEY/.test(gatewayEntry) || !/GEMINI_API_KEY/.test(gatewayEntry)) {
  failures.push("Restricted AI gateway is not the explicit provider-credential owner");
}

const directAdapters = /createOpenAIResponsesGateway|createCompatibleChatTextGateway/;
for (const path of [...sourceFiles("apps"), ...sourceFiles("packages")]) {
  const local = relative(root, path).replaceAll("\\", "/");
  if (local.startsWith("apps/ai-gateway/") || local.startsWith("packages/provider-gateway/")) continue;
  if (directAdapters.test(readFileSync(path, "utf8"))) failures.push(`${local} uses a direct AI Text provider adapter`);
}

const browserAreas = [
  "apps/public-site", "apps/tenant-web", "apps/platform-master",
  "packages/ai-chat-widget", "packages/flowbot-widget", "packages/voice-widget",
];
const restrictedBrowserText = /@djay\/provider-gateway|OPENAI_API_KEY|XAI_API_KEY|GEMINI_API_KEY|AI_TEXT_API_KEY|AI_TEXT_GATEWAY_SERVICE_TOKEN/;
for (const area of browserAreas) {
  for (const path of sourceFiles(area)) {
    if (restrictedBrowserText.test(readFileSync(path, "utf8"))) {
      failures.push(`${relative(root, path)} exposes restricted AI routing authority`);
    }
  }
}

const releaseQa = read("scripts/qa-release-artifacts.mjs");
if (!releaseQa.includes("ai-gateway exposed its restricted generation route")
  || !releaseQa.includes("ai-gateway accepted example production credentials")) {
  failures.push("Release artifacts do not verify AI gateway authorization and fail-closed credentials");
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.info("Restricted AI Text provider boundary passed: direct adapters and credentials remain gateway-owned and browser-inaccessible.");
