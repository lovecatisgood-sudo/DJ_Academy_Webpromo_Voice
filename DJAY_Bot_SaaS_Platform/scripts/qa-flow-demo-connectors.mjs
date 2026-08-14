import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const demoUrl = pathToFileURL(resolve(rootDirectory, "docs/design/djay-bot-text-voice-configuration-flow.html"));
demoUrl.searchParams.set("connector-check", "1");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function dragBetween(page, source, target) {
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  assert(from && to, "Connector ports were not visible.");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  await page.mouse.up();
}

let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 800, height: 900 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto(demoUrl.toString());
  await page.evaluate(() => localStorage.removeItem("djbot-clickable-flow-demo-v1"));
  await page.reload();
  await page.evaluate(() => openFlowStudio("map"));
  await page.locator("#flowAddNode").click();

  const newNode = page.locator('[data-flow-node^="step_"]').last();
  await newNode.waitFor();
  const newId = await newNode.getAttribute("data-flow-node");
  assert(newId, "New message node was not created.");
  assert(await page.locator("#flowStudioDemo").evaluate((node) => node.classList.contains("flow-panel-open")), "The editor did not open after adding a message at responsive width.");
  await page.locator("[data-flow-node-next]").waitFor();
  await page.locator("#flowClosePanel").click();

  await newNode.scrollIntoViewIfNeeded();
  await page.locator("#flowCanvasShell").evaluate((element) => { element.scrollLeft += 90; });
  await dragBetween(page, newNode.locator("[data-flow-output-port]"), page.locator('[data-flow-node="thanks"] [data-flow-input-port]'));
  let destination = await page.evaluate((id) => flowDraft.nodes.find((node) => node.id === id)?.next, newId);
  assert(destination === "thanks", `Drag connection failed: ${destination}`);

  await page.locator(`[data-flow-node="${newId}"]`).scrollIntoViewIfNeeded();
  await page.locator("#flowCanvasShell").evaluate((element) => { element.scrollLeft += 90; });
  await dragBetween(
    page,
    page.locator(`[data-flow-node="${newId}"] [data-flow-output-port]`),
    page.locator('[data-flow-node="handover"] [data-flow-input-port]'),
  );
  destination = await page.evaluate((id) => flowDraft.nodes.find((node) => node.id === id)?.next, newId);
  assert(destination === "handover", `Reconnect failed: ${destination}`);

  await page.locator('[data-flow-node="handover"]').click();
  await page.locator("#flowClosePanel").click();
  await page.locator("#flowDeleteNode").click();
  const deletion = await page.evaluate((id) => ({
    targetExists: flowDraft.nodes.some((node) => node.id === "handover"),
    next: flowDraft.nodes.find((node) => node.id === id)?.next,
    needsConnection: flowDraft.nodes.find((node) => node.id === id)?.needsConnection,
  }), newId);
  assert(!deletion.targetExists && deletion.next === null && deletion.needsConnection === true, `Connected deletion did not leave a repairable loose end: ${JSON.stringify(deletion)}`);
  assert(pageErrors.length === 0, `Browser page errors: ${pageErrors.join(" | ")}`);

  console.log(`PASS: created ${newId}, connected it, rerouted it, and removed its connected target with a repairable loose end.`);
} finally {
  await browser?.close().catch(() => undefined);
}
