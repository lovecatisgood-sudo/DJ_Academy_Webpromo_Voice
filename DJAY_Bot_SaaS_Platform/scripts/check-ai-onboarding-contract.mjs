import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const failures = [];
const fail = (message) => failures.push(message);

const builder = read("docs/design/djay-bot-text-voice-configuration-flow.html");
for (const marker of [
  'data-onboarding-role="support"',
  'data-onboarding-role="sales"',
  'data-onboarding-role="booking"',
  "Customer Support",
  "Sales Associate",
  "Appointment Booking",
  "Discover needs, recommend products, handle objections, capture leads, and offer appointments.",
  "state.product = commerceState.product;",
  "showOnboardingPage('role');",
  "selectOnboardingRole(state.role);",
]) {
  if (!builder.includes(marker)) fail(`AI onboarding is missing ${marker}`);
}
const onboardingRoles = [...builder.matchAll(/data-onboarding-role="([^"]+)"/g)].map((match) => match[1]);
if (JSON.stringify(onboardingRoles) !== JSON.stringify(["support", "sales", "booking"])) {
  fail(`AI onboarding roles changed: ${onboardingRoles.join(",")}`);
}

const commerceStart = builder.indexOf("function openSelectedCommerceIntent(intent)");
const commerceEnd = builder.indexOf("async function openDeploymentAccount", commerceStart);
const commerce = builder.slice(commerceStart, commerceEnd);
if (commerceStart < 0 || commerceEnd < 0) fail("AI onboarding commerce transition is missing");
else {
  const product = commerce.indexOf("state.product = commerceState.product;");
  const role = commerce.indexOf("showOnboardingPage('role');");
  if (product < 0 || role < 0 || product > role) fail("AI role selection no longer follows the selected product/package intent");
}
if (!builder.includes("access: {product:state.product,plan:currentBuilderPlanKey(),intent:commerceState.intent}")) {
  fail("AI package and commerce intent are no longer persisted with the selected role in the server draft");
}

const salesCore = read("packages/sales-core/src/index.ts");
for (const marker of [
  'agentRole: z.enum(["support", "sales", "booking"])',
  "a Sales Associate may support the sale with an appointment.request",
  "request pending merchant confirmation",
  "For every active objection use stage S5_OBJECTION",
]) {
  if (!salesCore.includes(marker)) fail(`Sales Core role/appointment authority is missing ${marker}`);
}

const runtimeTest = read("packages/ai-chat-runtime/src/index.test.ts");
for (const marker of [
  "allows a Sales Associate to propose a pending appointment after discovery without changing roles",
  'confirmationClaim: "pending_merchant_confirmation"',
  'stage: "S8_APPOINTMENT"',
]) {
  if (!runtimeTest.includes(marker)) fail(`Sales appointment runtime coverage is missing ${marker}`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.info("AI Text package-first role onboarding and Sales appointment support match AIT-010.");
