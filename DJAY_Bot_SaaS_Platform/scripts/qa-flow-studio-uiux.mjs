import { chromium } from "playwright";

const demoUrl = process.env.FLOW_DEMO_URL || "http://127.0.0.1:3100/build?product=flow&intent=trial";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function createFlowPage(browser, viewport) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(demoUrl);
  await page.evaluate(() => localStorage.removeItem("djbot-flow-builder-v2"));
  await page.reload();
  return { page, errors };
}

async function setColor(page, selector, value) {
  await page.locator(selector).evaluate((control, color) => {
    control.value = color;
    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

let browser;
try {
  browser = await chromium.launch({ headless: true });

  const desktopRun = await createFlowPage(browser, { width: 1440, height: 900 });
  const desktop = desktopRun.page;
  await desktop.evaluate(() => {
    commerceState.product = "flow";
    renderCommercePricing();
    openSelectedCommerceIntent("trial");
  });

  assert(await desktop.locator('[data-flow-onboarding-page="template"].active').isVisible(), "Flow onboarding did not start on template selection.");
  for (const template of ["lead", "appointment", "product", "support", "blank", "faq"]) {
    await desktop.locator(`[data-flow-template="${template}"]`).click();
    assert(await desktop.locator(`[data-flow-template="${template}"].active`).isVisible(), `${template} did not show a selected state.`);
    assert((await desktop.locator("#flowTemplatePreviewPath > div").count()) > 0, `${template} did not render a path preview.`);
  }
  await desktop.locator("#flowContinueTemplate").click();
  assert(await desktop.locator('[data-flow-onboarding-page="identity"].active').isVisible(), "Template selection did not continue to identity.");

  await desktop.locator("#flowBotName").fill("Siam Service Bot");
  await desktop.locator("#flowGreetingEn").fill("Welcome to Siam Service.");
  await desktop.locator("#flowGreetingTh").fill("ยินดีต้อนรับสู่สยามเซอร์วิส");
  await setColor(desktop, "#flowBrandColor", "#e6c229");
  await desktop.locator("#flowWidgetPosition").selectOption({ label: "Bottom left" });
  await desktop.locator("#flowBusinessHours").fill("Monday-Friday, 09:00-17:00");
  await desktop.locator("#flowHandoverContact").fill("support@siam.example");
  await desktop.locator("#flowPrivacyUrl").fill("https://siam.example/privacy");
  assert(await desktop.locator("#flowBrandColorValue").textContent() === "#E6C229", "Onboarding did not display the selected brand color value.");
  const onboardingPreview = await desktop.locator("#flowIdentityWidgetHead").evaluate((element) => getComputedStyle(element).backgroundColor);
  assert(onboardingPreview === "rgb(230, 194, 41)", `Onboarding widget preview did not update its brand color: ${onboardingPreview}`);

  await desktop.getByRole("button", { name: "Test in English", exact: true }).click();
  assert(await desktop.locator("#flowStudioDemo:not(.hidden)").isVisible(), "Setup-time testing did not open the Flow tester.");
  assert(await desktop.getByRole("button", { name: "Return to setup", exact: true }).isVisible(), "Setup-time testing provided no route back to Identity.");
  await desktop.getByRole("button", { name: "Return to setup", exact: true }).click();
  assert(await desktop.locator('[data-flow-onboarding-page="identity"].active').isVisible(), "Returning from the tester did not restore Identity.");

  await desktop.locator("#flowContinueIdentity").click();
  assert(await desktop.locator('[data-flow-onboarding-page="ready"].active').isVisible(), "Identity did not continue to the ready page.");
  assert(await desktop.locator("#flowReadyBotName").textContent() === "Siam Service Bot", "The ready summary lost the configured Bot name.");
  await desktop.locator("#flowTestReady").click();
  assert(await desktop.getByRole("button", { name: "Return to setup", exact: true }).isVisible(), "Ready-page testing provided no route back.");
  await desktop.getByRole("button", { name: "Return to setup", exact: true }).click();
  assert(await desktop.locator('[data-flow-onboarding-page="ready"].active').isVisible(), "Returning from the tester did not restore Ready.");
  await desktop.locator("#flowOpenStudio").click();

  const sectionTitles = {
    identity: "Bot identity",
    map: "Build the customer journey",
    translations: "English and Thai translations",
    lead: "Lead capture",
    handover: "Fallback and human handover",
    widget: "Widget appearance",
    release: "Publish, install, and go live",
  };
  for (const [section, title] of Object.entries(sectionTitles)) {
    await desktop.locator(`[data-flow-section="${section}"]`).click();
    assert(await desktop.getByRole("heading", { name: title, exact: true }).isVisible(), `${section} did not render its expected page.`);
    assert(await desktop.locator("#flowStudioContent").evaluate((element) => element.scrollTop) === 0, `${section} retained a stale scroll position.`);
  }

  await desktop.locator('[data-flow-section="lead"]').click();
  const leadFieldsBefore = await desktop.locator("[data-flow-lead-field='label']").count();
  await desktop.locator("#flowAddLeadField").click();
  assert(await desktop.locator("[data-flow-lead-field='label']").count() === leadFieldsBefore + 1, "Add lead field did not update the form editor.");
  await desktop.locator("[data-flow-delete-lead]").last().click();
  assert(await desktop.locator("[data-flow-lead-field='label']").count() === leadFieldsBefore, "Remove lead field did not update the form editor.");

  await desktop.locator('[data-flow-section="widget"]').click();
  await desktop.locator('[data-flow-bind="widget.domain"]').fill("https://siam.example");
  await desktop.locator('[data-flow-bind="widget.domain"]').dispatchEvent("change");
  await desktop.locator('[data-flow-widget-language="th"]').click();
  assert(await desktop.locator("#flowStudioContent .flow-widget-head").getByText("ไทย", { exact: true }).isVisible(), "Thai widget preview did not switch language.");

  const stored = await desktop.evaluate(() => ({
    name: flowDraft.identity.botName,
    color: flowDraft.identity.brandColor,
    domain: flowDraft.widget.domain,
    language: flowState.widgetPreviewLanguage,
  }));
  assert(JSON.stringify(stored) === JSON.stringify({ name: "Siam Service Bot", color: "#e6c229", domain: "https://siam.example", language: "th" }), `Flow state did not contain the edited values: ${JSON.stringify(stored)}`);
  await desktop.reload();
  await desktop.evaluate(() => openFlowStudio("widget"));
  const restored = await desktop.evaluate(() => ({
    name: flowDraft.identity.botName,
    color: flowDraft.identity.brandColor,
    domain: flowDraft.widget.domain,
    language: flowState.widgetPreviewLanguage,
  }));
  assert(JSON.stringify(restored) === JSON.stringify(stored), `Reload did not restore Flow state: ${JSON.stringify(restored)}`);

  await desktop.locator('[data-flow-section="release"]').click();
  assert(await desktop.locator("#flowReviewPublish").isEnabled(), "A structurally valid Flow could not be reviewed for publication.");
  await desktop.locator("#flowReviewPublish").click();
  assert(await desktop.locator("#flowPublishDialog").isVisible(), "Publish review dialog did not open.");
  await desktop.locator("#flowConfirmPublish").click();
  assert(await desktop.locator("#flowVersionState").textContent() === "Published version 1", "Publishing did not create version 1.");
  await desktop.locator("#flowCopySnippet").click();
  await desktop.locator("#flowVerifyInstall").click();
  assert(await desktop.getByText("Installation verified.", { exact: true }).isVisible(), "Valid HTTPS installation did not verify.");
  assert(await desktop.locator("#flowGoLive").isEnabled(), "Verified Flow did not expose the explicit Deploy Bot action.");
  assert(desktopRun.errors.length === 0, `Desktop browser errors: ${desktopRun.errors.join(" | ")}`);

  const mobileRun = await createFlowPage(browser, { width: 390, height: 780 });
  const mobile = mobileRun.page;
  await mobile.evaluate(() => openFlowStudio("map"));
  assert(await mobile.locator("#flowStudioDemo").isVisible(), "Mobile Studio did not open.");
  assert(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Mobile Flow Studio caused page-level horizontal overflow.");
  await mobile.locator("#flowOpenFullTest").click();
  assert(await mobile.locator(".flow-right-panel").isVisible(), "Mobile tester panel did not open.");
  for (let turn = 0; turn < 7; turn += 1) {
    await mobile.getByRole("button", { name: turn ? "Ask another question" : "Services", exact: true }).click();
    if (turn) await mobile.getByRole("button", { name: "Services", exact: true }).click();
  }
  const mobileTranscript = await mobile.locator("#flowTestTranscript").evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    scrollTop: element.scrollTop,
  }));
  assert(mobileTranscript.scrollHeight > mobileTranscript.clientHeight, `Mobile transcript was not bounded: ${JSON.stringify(mobileTranscript)}`);
  assert(mobileTranscript.scrollTop + mobileTranscript.clientHeight >= mobileTranscript.scrollHeight - 2, `Mobile transcript did not follow the latest turn: ${JSON.stringify(mobileTranscript)}`);
  const mobileComposer = await mobile.locator("#flowTypedTestInput").boundingBox();
  assert(mobileComposer && mobileComposer.y + mobileComposer.height <= 780, `Mobile composer is outside the viewport: ${JSON.stringify(mobileComposer)}`);
  assert(mobileRun.errors.length === 0, `Mobile browser errors: ${mobileRun.errors.join(" | ")}`);

  console.log("PASS: Flow onboarding, setup-time testing, all Studio sections, brand state, lead fields, translations, persistence, publication, installation verification, and mobile long-conversation UX passed.");
} finally {
  await browser?.close().catch(() => undefined);
}
