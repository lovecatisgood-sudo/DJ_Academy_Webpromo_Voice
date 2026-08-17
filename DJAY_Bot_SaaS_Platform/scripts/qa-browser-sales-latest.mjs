import { chromium } from "playwright";

const buildUrl = process.env.BUILDER_QA_URL || "http://localhost:3100/build?product=text&intent=trial";
const messages = [
  "Which service could help us handle website enquiries?",
  "That sounds too expensive.",
  "Even a smaller option may not be worth the money.",
  "I still do not see enough value to justify it.",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  const apiStatuses = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.url().includes("/public/builder/ai-test")) apiStatuses.push(response.status());
  });

  await page.goto(buildUrl, { waitUntil: "networkidle" });
  await page.locator("#onboardingDemo:not(.hidden)").waitFor();
  await page.evaluate(() => {
    state.product = "text";
    state.role = "sales";
    draft.business.name = "DJAI Browser QA";
    draft.business.type = "Small-business automation";
    draft.business.summary = "DJAI provides website customer-enquiry automation for small businesses.";
    draft.business.offers = "Approved services include guided setup, FAQ and service-answer configuration, lead qualification, appointment-request assistance, and ongoing support. Exact package prices are not confirmed.";
    draft.business.hours = "Monday to Friday, 09:00 to 17:00.";
    draft.business.contact = "Customers may contact the business through its website.";
    draft.business.faqs = [
      { question: "Which languages are supported?", answer: "English and Thai are supported." },
    ];
    draft.business.behaviorRole = "sales";
    draft.business.agentObjective = "Understand the customer's need and work through concerns consultatively.";
    draft.business.agentBehavior = "Treat every objection as new information. Do not end because of objection count. Change strategy and make one useful low-pressure move.";
    draft.business.agentBoundaries = "Never invent prices, discounts, urgency, guarantees, integrations, privacy claims, or completed actions.";
    showOnboardingPage("review");
  });
  await page.locator("#openStudio").click();
  await page.locator("#configurationStudio:not(.hidden)").waitFor();
  await page.evaluate(() => {
    state.section = "test";
    state.testMode = "draft";
    state.testMessages = [];
    state.chatInitialized = false;
    render();
  });
  await page.locator("#testInput").waitFor();

  const turns = [];
  for (const message of messages) {
    await page.locator("#testInput").fill(message);
    await page.locator("#sendTest").click();
    await page.locator("#chatLog .typing").waitFor({ state: "detached", timeout: 75_000 });
    await page.waitForTimeout(120);
    const lastBot = page.locator("#chatLog .bubble.bot").last();
    const reply = (await lastBot.innerText()).replace(/^Live DJBOT response\s*/iu, "").trim();
    const viewportState = await page.locator("#chatLog").evaluate((element) => ({
      scrollTop: element.scrollTop,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      latestVisible: element.scrollTop + element.clientHeight >= element.scrollHeight - 2,
    }));
    turns.push({ customer: message, reply, ...viewportState });
  }

  const objectionReplies = turns.slice(1).map((turn) => turn.reply);
  const prematureFarewell = /\b(?:no problem|if you need anything|if anything changes|let me know|maybe later|goodbye)\b/iu;
  assert(apiStatuses.length === messages.length && apiStatuses.every((status) => status === 200), `Unexpected AI-test statuses: ${apiStatuses.join(",")}`);
  assert(turns.every((turn) => turn.reply), "At least one visible response was empty.");
  assert(turns.every((turn) => turn.latestVisible), `The latest response was outside the visible chat area: ${JSON.stringify(turns)}`);
  assert(objectionReplies.every((reply) => !prematureFarewell.test(reply)), "An objection response gave up or used a farewell.");
  assert(new Set(objectionReplies).size === objectionReplies.length, "Consecutive objection replies repeated exactly.");
  assert(!pageErrors.length, `Page errors: ${pageErrors.join(" | ")}`);
  assert(!consoleErrors.length, `Console errors: ${consoleErrors.join(" | ")}`);

  console.info(JSON.stringify({
    status: "passed",
    url: page.url(),
    apiStatuses,
    pageErrors,
    consoleErrors,
    turns,
  }));
  await context.close();
} finally {
  await browser?.close();
}
