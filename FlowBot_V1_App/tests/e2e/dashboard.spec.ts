import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  const email = process.env.OWNER_EMAIL;
  const password = process.env.OWNER_PASSWORD;
  if (!email || !password) throw new Error("OWNER_EMAIL and OWNER_PASSWORD are required for E2E tests.");
  await page.goto("/");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.locator("[data-client-ready='true']")).toBeVisible();
}

async function expectNoHorizontalOverflow(page: Page) {
  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  expect(hasOverflow).toBe(false);
}

test.describe("admin dashboard", () => {
  test("renders overview, inbox and conversation details", async ({ page }) => {
    await login(page);
    await expect(page.getByText("Awaiting admin")).toBeVisible();
    await expect(page.getByText("CRM funnel")).toBeVisible();

    await page.getByRole("button", { name: "Chat" }).click();
    await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();
    await expect(page.locator(".conversation-list")).toBeVisible();

    const viewport = page.viewportSize();
    if (viewport && viewport.width < 780) {
      await expect(page.locator(".thread-pane")).toBeHidden();
      await page.locator(".conversation-row").first().click();
      await expect(page.locator(".thread-pane")).toBeVisible();
      await expect(page.getByRole("button", { name: "Back" })).toBeVisible();
      await page.getByRole("button", { name: "Profile" }).click();
      await expect(page.locator(".detail-pane")).toBeVisible();
      await page.getByRole("button", { name: "Back to chat" }).click();
    } else {
      await expect(page.locator(".thread-pane")).toBeVisible();
    }

    await expect(page.getByPlaceholder("Reply as admin")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("settings tabs expose knowledge, widget, contacts, team and privacy", async ({ page }) => {
    await login(page);
    await page.getByRole("button", { name: "Settings" }).click();
    await expect(page.getByRole("button", { name: "Knowledge" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Widget" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Contact channels" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Team" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Data & privacy" })).toBeVisible();

    await page.getByRole("button", { name: "Widget" }).click();
    await expect(page.getByRole("heading", { name: "Widget" })).toBeVisible();
    await expect(page.getByText("Brand color")).toBeVisible();

    await page.getByRole("button", { name: "Contact channels" }).click();
    await expect(page.getByRole("heading", { name: "Contact channels" })).toBeVisible();

    await page.getByRole("button", { name: "Team" }).click();
    await expect(page.getByRole("heading", { name: "Team" })).toBeVisible();

    await page.getByRole("button", { name: "Data & privacy" }).click();
    await expect(page.getByRole("heading", { name: "Data & privacy" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("interactive controls are keyboard reachable and named", async ({ page }) => {
    await login(page);
    await page.keyboard.press("Tab");
    const focusedRole = await page.evaluate(() => document.activeElement?.tagName.toLowerCase());
    expect(["button", "input", "select", "textarea", "a"].includes(focusedRole ?? "")).toBe(true);

    const unnamedButtons = await page.locator("button:visible").evaluateAll((buttons) =>
      buttons
        .map((button, index) => ({
          index,
          text: button.textContent?.trim() ?? "",
          aria: button.getAttribute("aria-label") ?? ""
        }))
        .filter((button) => !button.text && !button.aria)
    );
    expect(unnamedButtons).toEqual([]);
  });
});
