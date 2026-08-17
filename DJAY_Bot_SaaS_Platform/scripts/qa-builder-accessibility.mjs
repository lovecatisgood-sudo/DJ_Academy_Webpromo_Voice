import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reference = pathToFileURL(resolve(root, "docs/design/djay-bot-text-voice-configuration-flow.html"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function assertNoSeriousAxe(page, label) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const serious = result.violations.filter((violation) => ["serious", "critical"].includes(violation.impact || ""));
  assert(!serious.length, `${label} has serious accessibility violations: ${serious.map((item) => `${item.id} at ${item.nodes.flatMap((node) => node.target).join(", ")}`).join(" | ")}`);
}

let browser;
try {
  browser = await chromium.launch({ headless: true });
  for (const product of ["text", "voice"]) {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
      const page = await context.newPage();
      const url = new URL(reference);
      url.searchParams.set("product", product);
      url.searchParams.set("intent", product === "text" ? "trial" : "subscribe");
      await page.goto(url.toString());
      await page.locator("#onboardingDemo:not(.hidden)").waitFor();

      const isolation = await page.evaluate(() => {
        const onboarding = document.querySelector("#onboardingDemo");
        const visible = (element) => {
          if (!element) return false;
          const style = getComputedStyle(element);
          const box = element.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0;
        };
        const outsideFocusable = [...document.querySelectorAll("button,a[href],input,select,textarea,[tabindex]")]
          .filter((element) => visible(element) && !element.disabled && element.tabIndex >= 0 && !onboarding?.contains(element));
        return {
          outsideFocusable: outsideFocusable.map((element) => element.id || element.textContent?.trim().slice(0, 40)),
          studioHidden: document.querySelector("#configurationStudio")?.classList.contains("hidden"),
          studioInert: document.querySelector("#configurationStudio")?.inert,
          dashboardInert: document.querySelector("#merchantDashboard")?.inert,
        };
      });
      assert(isolation.outsideFocusable.length === 0, `${product} ${viewport.width}: onboarding exposes later controls: ${JSON.stringify(isolation)}`);
      assert(isolation.studioHidden && isolation.studioInert && isolation.dashboardInert, `${product} ${viewport.width}: inactive surfaces are not hidden and inert: ${JSON.stringify(isolation)}`);

      for (let index = 0; index < 10; index += 1) {
        await page.keyboard.press("Tab");
        const inside = await page.evaluate(() => document.querySelector("#onboardingDemo")?.contains(document.activeElement));
        assert(inside, `${product} ${viewport.width}: keyboard focus escaped onboarding at Tab ${index + 1}`);
      }
      await assertNoSeriousAxe(page, `${product} onboarding ${viewport.width}`);

      await page.evaluate(() => {
        draft.business.name = "DJAI Academy";
        draft.business.summary = "Practical AI education and business automation.";
        draft.business.offers = "AI courses, Business automation consulting";
        draft.business.hours = "Monday-Friday 09:00-17:00 ICT";
        draft.business.contact = "contact@djai.academy";
        draft.business.faqs = [{ question: "What services do you offer?", answer: "AI courses and business automation consulting." }];
        showOnboardingPage("review");
      });
      await page.locator("#openStudio").click();
      await page.locator("#configurationStudio:not(.hidden)").waitFor();
      assert(await page.locator("#onboardingDemo").evaluate((surface) => surface.inert && surface.classList.contains("hidden")), `${product} ${viewport.width}: onboarding remained interactive after opening Studio`);

      if (product === "text" && viewport.width > 900) {
        const bodies = [];
        await page.route("http://builder.test/public/builder/ai-test", async (route) => {
          bodies.push(route.request().postDataJSON());
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ preview: {
            text: bodies.length === 1 ? "We offer AI courses and business automation consulting." : "We are open Monday to Friday, 09:00 to 17:00 ICT.",
            citationCount: 1, proposedActionTypes: [],
          } }) });
        });
        await page.evaluate(() => {
          const base = document.createElement("base");
          base.href = "http://builder.test/";
          document.head.prepend(base);
          state.section = "test";
          render();
        });
        for (const message of ["What services do you offer?", "When are you open?"]) {
          await page.locator("#testInput").fill(message);
          await page.locator("#sendTest").click();
          await page.locator("#chatLog .typing").waitFor({ state: "detached" });
        }
        assert(bodies.length === 2, `Text tester sent ${bodies.length} requests instead of two`);
        assert(bodies[0].business.hours && bodies[0].business.contact && bodies[0].business.faqs.length === 1, `Text tester omitted configured knowledge: ${JSON.stringify(bodies[0])}`);
        assert(bodies[0].messages.length === 0 && bodies[1].messages.length === 2, `Text tester did not carry bounded conversation history: ${JSON.stringify(bodies.map((body) => body.messages))}`);
      }

      if (viewport.width <= 900) {
        await page.locator("#mobileTest").click();
        await page.waitForFunction(() => document.body.classList.contains("tester-mobile-open"));
        await page.waitForTimeout(250);
        const tester = await page.locator(".tester").boundingBox();
        const testerState = await page.locator(".tester").evaluate((element) => ({
          bodyClass: document.body.className,
          transform: getComputedStyle(element).transform,
        }));
        assert(tester && tester.x >= -1 && tester.y >= -1 && tester.x + tester.width <= viewport.width + 1 && tester.y + tester.height <= viewport.height + 1, `${product} mobile tester is outside the viewport: ${JSON.stringify({ tester, testerState })}`);
        const action = page.locator(product === "voice" ? "#voiceTest" : "#sendTest");
        const actionBox = await action.boundingBox();
        assert(actionBox && actionBox.y >= 0 && actionBox.y + actionBox.height <= viewport.height, `${product} mobile test action is not reachable: ${JSON.stringify(actionBox)}`);
      }
      await context.close();
    }
  }
} finally {
  await browser?.close();
}

console.info("PASS: Text and Voice onboarding isolate later surfaces, contain keyboard focus, pass serious Axe checks, expose reachable mobile tester actions, and Text tests carry configured knowledge plus bounded prior turns.");
