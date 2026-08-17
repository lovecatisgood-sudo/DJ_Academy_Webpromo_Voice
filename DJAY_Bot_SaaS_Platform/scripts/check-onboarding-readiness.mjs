import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const failures = [];

const builder = read("docs/design/djay-bot-text-voice-configuration-flow.html");
for (const marker of ["English and Thai translations", "flowTranslateMissing", "/public/builder/translate", "flowOptionText(option,flowState.testLanguage)", "Choose language / เลือกภาษา", "widgetPreviewLanguage", "flowTestReady", "data-flow-onboarding-test-language", "openFlowDraftTest", "flowExecutionPath", "flowResolveChoice", "flowSetDestination", "flowRemoveNodeFromDraft", "Test full journey"]) {
  if (!builder.includes(marker)) fail(`Flow translation experience is missing: ${marker}`);
}
if (builder.includes("data-flow-test-label=\"${escapeHtml(option.label)}\"")) fail("Thai Flow choices still use the legacy single-language label.");
for (const marker of [
  "Choose the bot first, then its package.",
  "Configure Flow Bot trial",
  "Configure Text Bot trial",
  "openSelectedCommerceIntent",
  "openDeploymentAccount",
  "Create account and continue deployment",
  "if (!state.accountCreated) { openDeploymentAccount('flow'); return; }",
  "if (!draft.install.live && !state.accountCreated) { openDeploymentAccount('configuration'); return; }",
  "Verify a card to deploy",
  "One Text trial is allowed per verified card",
  "data-flow-template=\"faq\"",
  "data-flow-template=\"lead\"",
  "data-flow-template=\"appointment\"",
  "data-flow-template=\"product\"",
  "data-flow-template=\"support\"",
  "data-flow-template=\"blank\"",
  "data-onboarding-role=\"support\"",
  "data-onboarding-role=\"sales\"",
  "data-onboarding-role=\"booking\"",
  "Message removed.",
  "incoming connection",
  "live Grok testing",
  "fetch('/public/builder/ai-test'",
  "fetch('/public/builder/website-profile'",
  "fetch('/public/builder/voice-test/session'",
  "navigator.mediaDevices.getUserMedia",
  "xai-client-secret.${result.session.token}",
  "type:'response.cancel'",
  "applyImportedWebsiteProfile",
  "websiteImportErrorCopy",
  "Website import is temporarily unavailable.",
]) {
  if (!builder.includes(marker)) failures.push(`approved anonymous builder is missing ${marker}`);
}
for (const forbidden of [
  "Continue to AI Text Bot onboarding",
  "Start 30-day Text Bot trial</button>",
  "Start 30-day Flow Bot trial</button>",
  "Harbor Studio",
  "harbor-example",
  "Continue with public pages found",
  "id=\"usePartial\"",
  "state.product = 'text'; state.role = 'sales'; state.publishedProduct = 'text'; state.publishedRole = 'sales';",
]) {
  if (builder.includes(forbidden)) failures.push(`approved anonymous builder still contains ${forbidden}`);
}
for (const marker of [
  "const resetProduct = state.product;",
  "const resetRole = state.role;",
  "product:resetProduct,role:resetRole,publishedProduct:resetProduct,publishedRole:resetRole",
  "testMessages:[],accountCreated:false,deployReturn:null",
]) {
  if (!builder.includes(marker)) failures.push(`product-preserving configuration reset is missing ${marker}`);
}

const buildRoute = read("apps/public-site/app/build/route.ts");
for (const marker of ["djay-bot-text-voice-configuration-flow.html", '"Content-Type": "text/html; charset=utf-8"', "publicBuilderContentSecurityPolicy", "publicBuilderPermissionsPolicy"]) {
  if (!buildRoute.includes(marker)) failures.push(`public builder route is missing ${marker}`);
}
const voiceRoute = read("apps/api/app/public/builder/voice-test/session/route.ts");
for (const marker of ["createXaiBuilderVoiceSession", "PUBLIC_BUILDER_TEST_RATE_LIMIT_SCOPE", "hasTrustedOrigin"]) {
  if (!voiceRoute.includes(marker)) failures.push(`anonymous Grok Voice test route is missing ${marker}`);
}
const builderDraftRoute = read("apps/api/app/public/builder/draft/route.ts");
for (const marker of ["anonymousBuilder.ensureDraft", "anonymousBuilder.updateDraft", "resolvePublicBuilderTestSession", "status === \"conflict\""]) {
  if (!builderDraftRoute.includes(marker)) failures.push(`durable anonymous Builder route is missing ${marker}`);
}
for (const marker of ["hydrateServerDraft", "saveServerDraft", "Draft saved securely"]) {
  if (!builder.includes(marker)) failures.push(`approved anonymous Builder is missing durable save behavior ${marker}`);
}
const turbo = read("turbo.json");
if (!turbo.includes('"globalDependencies": ["docs/design/djay-bot-text-voice-configuration-flow.html"]')) {
  failures.push("Turbo cache does not invalidate builds when the approved builder HTML changes");
}

for (const [path, marker] of [
  ["apps/public-site/app/page.tsx", 'redirect("/build")'],
  ["apps/public-site/app/pricing/page.tsx", 'redirect("/build?product=text")'],
  ["apps/tenant-web/app/workspace/start/page.tsx", "/build"],
  ["apps/tenant-web/app/workspace/setup/page.tsx", "/build"],
]) {
  if (!read(path).includes(marker)) failures.push(`${path} does not retire the old route into the approved builder`);
}

const login = read("apps/tenant-web/app/page.tsx");
if (login.includes('return "/workspace/start"')) failures.push("tenant login still forces the retired first-login wizard");
const workspace = read("apps/tenant-web/app/workspace/page.tsx");
if (workspace.includes('window.location.replace("/workspace/setup")')) failures.push("workspace still traps incomplete accounts in the retired setup wizard");

const aiTest = read("apps/api/app/public/builder/ai-test/route.ts");
for (const marker of ["runAiTextPreview", "public_builder_ai_test", "services.aiTextGateway", "hasTrustedOrigin"]) {
  if (!aiTest.includes(marker)) failures.push(`anonymous Grok test route is missing ${marker}`);
}

const websiteImport = read("apps/api/app/public/builder/website-profile/route.ts");
const websiteProfile = read("apps/api/lib/public-website-profile.ts");
for (const marker of ["crawlPublicWebsite", "extractPublicWebsiteProfile", "public_builder_website_profile", "hasTrustedOrigin"]) {
  if (!websiteImport.includes(marker)) failures.push(`public website import route is missing ${marker}`);
}
for (const marker of ["isPublicWebsiteAddress", "website_response_too_large", "website_timeout", "comparableHost", "application/ld+json"]) {
  if (!websiteProfile.includes(marker)) failures.push(`public website importer is missing ${marker}`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.info("Approved package-first anonymous builder is the only customer entry; account and Text-card gates occur at Deploy Bot.");
