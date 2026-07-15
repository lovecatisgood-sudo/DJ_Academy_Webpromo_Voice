import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const BOT_KEY = "flowbot_test_web";
const widgetBundlePath = path.resolve(process.cwd(), "apps/widget/dist/index.js");

async function mountWidget(page: Page) {
  await page.route("**/widget-dist/index.js", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/javascript; charset=utf-8",
      body: await readFile(widgetBundlePath, "utf8")
    });
  });

  await page.route("**/widget-host-fixture", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: `<!doctype html>
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>FlowBot Widget Fixture</title>
            <style>
              body {
                min-height: 140vh;
                margin: 0;
                font-family: system-ui, sans-serif;
                background: #f7faf9;
              }
            </style>
          </head>
          <body>
            <main aria-label="Host page"></main>
            <script type="module">
              import { mountFlowBotWidget } from "/widget-dist/index.js";
              mountFlowBotWidget({
                botKey: "${BOT_KEY}",
                apiBaseUrl: window.location.origin,
                initialLang: "en",
                openOnLoad: true
              });
              window.__flowbotMounted = true;
            </script>
          </body>
        </html>`
    });
  });

  await page.goto("/widget-host-fixture");
  await page.waitForFunction(() => Boolean((window as unknown as { __flowbotMounted?: boolean }).__flowbotMounted));
  await expect(page.locator(`[data-flowbot-widget="${BOT_KEY}"]`)).toBeAttached();
  await expect(page.getByText("Hi, welcome to FlowBot")).toBeVisible();
}

async function expectWidgetFitsViewport(page: Page) {
  const panel = page.locator(".panel");
  await expect(panel).toBeVisible();
  const box = await panel.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (!box || !viewport) return;
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
}

async function expectNoHorizontalOverflow(page: Page) {
  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  expect(hasOverflow).toBe(false);
}

test.describe("public widget", () => {
  test("mounts the production widget bundle and completes the service option flow", async ({ page }) => {
    await mountWidget(page);
    await page.getByRole("button", { name: "View services" }).click();
    await expect(page.getByText("FlowBot answers common questions")).toBeVisible();
    await expect(page.getByText("View services").last()).toBeVisible();
    await expectWidgetFitsViewport(page);
    await expectNoHorizontalOverflow(page);
  });

  test("captures a lead through the widget form", async ({ page }) => {
    await mountWidget(page);
    await page.getByRole("button", { name: "Leave contact details" }).click();
    await page.getByLabel("Name / ชื่อ").fill("Widget QA");
    await page.getByLabel("Phone / เบอร์โทร").fill("+66123456789");
    await page.getByLabel("Email").fill("widget-qa@example.com");
    await page.getByRole("button", { name: "Submit" }).click();
    await expect(page.getByText("Thank you. I have captured the details")).toBeVisible();
    await expectWidgetFitsViewport(page);
    await expectNoHorizontalOverflow(page);
  });

  test("moves free text to handoff state with visible recovery action", async ({ page }) => {
    await mountWidget(page);
    await page.getByPlaceholder("Type a message...").fill("I need help with a custom integration.");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("Waiting for an admin reply")).toBeVisible();
    await expect(page.getByText("I would like our team to look at this properly")).toBeVisible();
    await expect(page.getByRole("button", { name: "Return to bot menu" })).toBeVisible();
    await expectWidgetFitsViewport(page);
    await expectNoHorizontalOverflow(page);
  });
});
