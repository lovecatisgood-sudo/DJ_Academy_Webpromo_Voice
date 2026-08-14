import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const failures = [];

const route = read("apps/api/app/tenant/onboarding/route.ts");
for (const marker of ['action: z.literal("review_conversations")', "markConversationExamplesReviewed(resolved.context)"]) {
  if (!route.includes(marker)) failures.push(`onboarding API is missing ${marker}`);
}
if (route.includes("stage: z.enum")) failures.push("onboarding API still trusts a browser-supplied stage");

const profileRoute = read("apps/api/app/tenant/profile/route.ts");
for (const marker of ["updateBusinessProfile", 'locale: z.enum(["en", "th"])']) {
  if (!profileRoute.includes(marker)) failures.push(`profile API is missing ${marker}`);
}

const store = read("packages/db/src/tenant-workspace-store.ts");
for (const marker of [
  "launchReadyProducts", "current_published_version_id = execution.flow_version_id",
  "current_published_playbook_version_id = session.playbook_version_id",
  "session.status = 'ended'", "activeProducts.has(product)",
  "buildOnboardingChecklist", "nextHref", "/workspace/setup", "/workspace/usage",
  "conversationExamplesReviewed", "tenant.onboarding_conversations_reviewed",
]) {
  if (!store.includes(marker)) failures.push(`onboarding evidence store is missing ${marker}`);
}

const setupPage = read("apps/tenant-web/app/workspace/setup/page.tsx");
for (const marker of [
  '["Goal", "Conversations", "Chatbot", "Test"]',
  'JSON.stringify({ action: "review_conversations" })',
  "/tenant/flowbot/bots", "leadCaptureTemplate", "FlowSimulator",
  "/workspace/support?from=/workspace/setup",
]) {
  if (!setupPage.includes(marker)) failures.push(`setup wizard UI is missing ${marker}`);
}
for (const forbidden of ["WebsiteDeploymentForm", "createWidgetInstallSnippet", "setup-stepper", "onboarding?.checklist"]) {
  if (setupPage.includes(forbidden)) failures.push(`setup wizard UI still contains ${forbidden}`);
}

const startPage = read("apps/tenant-web/app/workspace/start/page.tsx");
for (const marker of ["/tenant/setup", "conversationExamplesReviewed", '"/workspace/setup"', '"/workspace"']) {
  if (!startPage.includes(marker)) failures.push(`first-login setup router is missing ${marker}`);
}

const chrome = read("apps/tenant-web/lib/i18n/setup-chrome.ts");
for (const marker of ["navSetup", "checkoutReturn", "th:", "en:"]) {
  if (!chrome.includes(marker)) failures.push(`setup chrome i18n is missing ${marker}`);
}

const page = read("apps/tenant-web/app/workspace/page.tsx");
for (const marker of [
  "/tenant/setup", "conversationExamplesReviewed", 'window.location.replace("/workspace/setup")',
  "Recommended next step", "Recent customer conversations", ".slice(0, 3)",
]) {
  if (!page.includes(marker)) failures.push(`simple workspace home is missing ${marker}`);
}
for (const forbidden of ["Launch checklist", "onboarding?.checklist", "primaryAction", "nextHref", "subscriptions", "Action center"] ) {
  if (page.includes(forbidden)) failures.push(`simple workspace home still contains ${forbidden}`);
}

const settingsPage = read("apps/tenant-web/app/workspace/settings/page.tsx");
for (const marker of ["/tenant/profile", "Business profile", "Asia/Bangkok"]) {
  if (!settingsPage.includes(marker)) failures.push(`settings UI is missing ${marker}`);
}

const operationsPage = read("apps/tenant-web/app/workspace/operations/page.tsx");
if (operationsPage.includes("Mark reviewed")) {
  failures.push("operations UI still contains fake Mark reviewed guides");
}
if (!operationsPage.includes("View launch checklist")) {
  failures.push("operations UI should link into Overview evidence instead of fake completion");
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.info("First login is gated by a four-step, server-authoritative Flow Bot setup; the completed workspace home remains intentionally sparse.");
