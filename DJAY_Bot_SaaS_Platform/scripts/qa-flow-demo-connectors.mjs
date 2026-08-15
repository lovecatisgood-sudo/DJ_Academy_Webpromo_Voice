import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const demoUrl = process.env.FLOW_DEMO_URL
  ? new URL(process.env.FLOW_DEMO_URL)
  : pathToFileURL(resolve(rootDirectory, "docs/design/djay-bot-text-voice-configuration-flow.html"));
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
  await page.evaluate(() => localStorage.removeItem("djbot-flow-builder-v2"));
  await page.reload();
  await page.evaluate(() => openFlowStudio("map"));

  await page.locator('[data-flow-section="identity"]').click();
  await page.locator('input[type="color"][data-flow-bind="identity.brandColor"]').evaluate((control) => {
    control.value = "#e6c229";
    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
  });
  assert(await page.locator("#flowStudioContent .flow-color-value").textContent() === "#E6C229", "The brand color control did not show its selected hex value.");
  const brandPreview = await page.locator("#flowStudioContent .flow-widget-mini .flow-widget-head").evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    color: getComputedStyle(element).color,
  }));
  assert(brandPreview.background === "rgb(230, 194, 41)", `The widget preview did not use the selected brand color: ${JSON.stringify(brandPreview)}`);
  assert(brandPreview.color === "rgb(23, 26, 31)", `The widget preview did not choose readable text for a bright brand color: ${JSON.stringify(brandPreview)}`);
  await page.locator('[data-flow-section="map"]').click();

  const treeAudit = await page.evaluate(() => {
    const problems = [];
    let optionEdges = 0;
    let localizedChoices = 0;
    for (const template of ["faq", "lead", "appointment", "product", "support", "blank"]) {
      const draft = createFlowDraft(template);
      const entryPath = flowExecutionPath(draft, draft.entryId, "en");
      if (!entryPath.steps.length || entryPath.steps[0].id !== draft.entryId) problems.push(`${template}: entry path skipped ${draft.entryId}`);
      for (const node of draft.nodes) {
        for (let optionIndex = 0; optionIndex < flowActiveOptions(node).length; optionIndex += 1) {
          optionEdges += 1;
          const option = node.options[optionIndex];
          for (const language of ["en", "th"]) {
            localizedChoices += 1;
            const resolution = flowResolveChoice(draft, node.id, optionIndex, language);
            if (resolution.status !== "ready") problems.push(`${template}:${node.id}:${optionIndex}:${language} ${resolution.status}`);
            const path = flowExecutionPath(draft, resolution.targetId, language);
            if (path.steps[0]?.id !== option.target) problems.push(`${template}:${node.id}:${optionIndex}:${language} skipped ${option.target}`);
          }
        }
      }
      problems.push(...flowDraftErrors(draft).map((error) => `${template}: ${error}`));
    }
    return { problems, optionEdges, localizedChoices };
  });
  assert(treeAudit.problems.length === 0, `Built-in option tree audit failed: ${treeAudit.problems.join(" | ")}`);
  assert(treeAudit.optionEdges === 33, `Expected 33 configured option edges, received ${treeAudit.optionEdges}.`);
  assert(treeAudit.localizedChoices === 66, `Expected 66 localized option resolutions, received ${treeAudit.localizedChoices}.`);

  await page.locator('[data-flow-node="pricing"]').click();
  await page.locator("#flowClosePanel").click();

  await page.locator("#flowOpenFullTest").click();
  assert(await page.getByText("Testing the complete customer journey from its starting message").isVisible(), "Full customer testing did not start from the configured entry message.");
  const initialState = await page.evaluate(() => ({ selected: flowState.selectedNodeId, active: flowState.testNodeId }));
  assert(initialState.selected === "pricing" && initialState.active === "menu", `Editor/test state isolation failed: ${JSON.stringify(initialState)}`);
  assert(await page.locator("[data-flow-test-option-index]").count() === 4, "The Main menu customer replies were not rendered.");
  await page.locator("#flowTypedTestInput").fill("opening hour");
  await page.locator("#flowTypedTestSend").click();
  assert(await page.locator(".flow-test-message").filter({ hasText: "We are open Monday to Friday, 09:00 to 17:00." }).last().isVisible(), "Typed Opening hours intent did not follow its configured message path.");
  assert(await page.locator("[data-flow-test-option-index]").count() === 2, "Opening hours did not stop at the next customer decision layer.");
  assert(!await page.locator("#flowTestForm").isVisible(), "Opening hours opened a contact form without customer permission.");
  assert(await page.locator(".flow-test-message").filter({ hasText: "What would you like to do next?" }).count() === 0, "Opening hours added an unnecessary generic follow-up message.");
  await page.getByRole("button", { name: "Ask another question", exact: true }).click();
  assert(await page.locator("[data-flow-test-option-index]").count() === 4, "Ask another question did not return to the Main menu.");

  await page.locator("#flowRestartTest").click();
  await page.locator("#flowTypedTestInput").fill("how much does it cost");
  await page.locator("#flowTypedTestSend").click();
  assert(await page.locator(".flow-test-message").filter({ hasText: "Our team can explain the approved package prices and help identify the right starting point." }).last().isVisible(), "Pricing question did not follow the configured Pricing path.");
  assert(await page.locator("[data-flow-test-option-index]").count() === 2, "Pricing did not stop at the next customer decision layer.");
  assert(!await page.locator("#flowTestForm").isVisible(), "Pricing opened a contact form without customer permission.");
  assert(await page.locator(".flow-test-message").filter({ hasText: "What would you like to do next?" }).count() === 0, "Pricing added an unnecessary generic follow-up message.");

  await page.locator("#flowRestartTest").click();
  await page.getByRole("button", { name: "Services", exact: true }).click();
  assert(await page.locator("[data-flow-test-option-index]").count() === 2, "Services did not stop at the next customer decision layer.");
  assert(!await page.locator("#flowTestForm").isVisible(), "Services opened a contact form without customer permission.");
  assert(await page.locator(".flow-test-message").filter({ hasText: "What would you like to do next?" }).count() === 0, "Services added an unnecessary generic follow-up message.");
  const brandedCustomerBubble = await page.locator(".flow-test-message.customer").last().evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    color: getComputedStyle(element).color,
  }));
  assert(brandedCustomerBubble.background === "rgb(230, 194, 41)", `The test conversation did not use the selected brand color: ${JSON.stringify(brandedCustomerBubble)}`);
  assert(brandedCustomerBubble.color === "rgb(23, 26, 31)", `The test conversation brand color has unreadable text: ${JSON.stringify(brandedCustomerBubble)}`);
  for (let turn = 0; turn < 8; turn += 1) {
    await page.getByRole("button", { name: "Ask another question", exact: true }).click();
    await page.getByRole("button", { name: "Services", exact: true }).click();
  }
  const transcriptMetrics = await page.locator("#flowTestTranscript").evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    scrollTop: element.scrollTop,
  }));
  assert(transcriptMetrics.scrollHeight > transcriptMetrics.clientHeight, `The long test conversation did not create a bounded scroll region: ${JSON.stringify(transcriptMetrics)}`);
  assert(transcriptMetrics.scrollTop + transcriptMetrics.clientHeight >= transcriptMetrics.scrollHeight - 2, `The test conversation did not follow the latest turn: ${JSON.stringify(transcriptMetrics)}`);
  const composerBox = await page.locator("#flowTypedTestInput").boundingBox();
  assert(composerBox && composerBox.y + composerBox.height <= 900, `The test composer fell below the viewport: ${JSON.stringify(composerBox)}`);
  await page.getByRole("button", { name: "Contact the team", exact: true }).click();
  assert(await page.locator("#flowTestForm").isVisible(), "The explicit Contact the team choice did not open the contact form.");

  await page.locator("#flowRestartTest").click();
  await page.getByRole("button", { name: "Contact the team", exact: true }).click();
  assert(await page.locator("#flowTestForm").isVisible(), "The Contact the team reply did not follow its configured form path.");

  await page.locator("#flowTestLanguage").selectOption("th");
  assert(await page.getByRole("button", { name: "บริการ", exact: true }).isVisible(), "Thai testing did not render the translated customer replies.");
  await page.locator("#flowTypedTestInput").fill("เวลาเปิดทำการ");
  await page.locator("#flowTypedTestSend").click();
  assert(await page.locator(".flow-test-message").filter({ hasText: "เปิดวันจันทร์ถึงวันศุกร์ เวลา 09:00 ถึง 17:00 น." }).last().isVisible(), "Thai Opening hours question did not follow its configured path.");
  assert(await page.locator("[data-flow-test-option-index]").count() === 2, "Thai Opening hours did not stop at its translated customer decision layer.");
  assert(!await page.locator("#flowTestForm").isVisible(), "Thai Opening hours opened a contact form without customer permission.");
  assert(await page.getByRole("button", { name: "ถามคำถามอื่น", exact: true }).isVisible(), "Thai next-step choices were not translated.");
  await page.locator("#flowClosePanel").click();

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

  console.log(`PASS: audited ${treeAudit.optionEdges} option edges in both languages, exercised question routing, and verified connector repair with ${newId}.`);
} finally {
  await browser?.close().catch(() => undefined);
}
