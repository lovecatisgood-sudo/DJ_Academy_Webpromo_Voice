import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const source = readFileSync(resolve(root, "docs/design/djay-bot-text-voice-configuration-flow.html"), "utf8");

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Flow builder is missing ${name}`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === "'" || character === '"' || character === "`") { quote = character; continue; }
    if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Could not extract ${name}`);
}

const functionNames = [
  "upgradeFlowDraftJourney",
  "normalizeFlowDraftTranslations",
  "createFlowDraft",
  "flowOptionText",
  "flowActiveOptions",
  "flowExecutionPath",
  "flowResolveChoice",
  "flowNormalizeMatchText",
  "flowTextMatchesQuery",
  "flowResolveTypedReply",
  "flowSetDestination",
  "flowRemoveNodeFromDraft",
  "flowDraftErrors",
];
const body = `
const flowNode = (id,type,title,en,th,x,y,extra={}) => ({id,type,title,en,th,x,y,keywords:[],next:null,...extra});
const flowChoice = (en,th,target) => ({en,th,target});
${functionNames.map(extractFunction).join("\n")}
return { ${functionNames.join(",")} };`;
const engine = new Function("flowSchemaVersion", body)(5);

const node = (id, type, next = null, options = []) => ({
  id, type, title: id, en: `English ${id}`, th: `ไทย ${id}`, next, options, needsConnection: false,
});
const draft = {
  schemaVersion: 3,
  entryId: "welcome",
  identity: {},
  nodes: [
    node("welcome", "message", "menu"),
    node("menu", "options", null, [
      { en: "Sales", th: "ฝ่ายขาย", target: "sales" },
      { en: "Support", th: "ฝ่ายช่วยเหลือ", target: "support" },
      { en: "Opening hours", th: "เวลาเปิดทำการ", target: "hours" },
    ]),
    node("sales", "message", "done"),
    node("support", "message", "done"),
    { ...node("hours", "message", "done"), keywords: ["hours", "open", "เวลา"] },
    node("done", "end"),
  ],
};

const entryPath = engine.flowExecutionPath(draft, draft.entryId, "en");
assert.equal(entryPath.status, "waiting");
assert.deepEqual(entryPath.steps.map((step) => step.id), ["welcome", "menu"]);
assert.equal(entryPath.currentId, "menu");

const thaiChoice = engine.flowResolveChoice(draft, "menu", 1, "th");
assert.deepEqual(thaiChoice, { status: "ready", label: "ฝ่ายช่วยเหลือ", targetId: "support", error: "" });
const supportPath = engine.flowExecutionPath(draft, thaiChoice.targetId, "th");
assert.deepEqual(supportPath.steps.map((step) => step.id), ["support", "done"]);

for (const [customerText, language] of [["opening hour", "en"], ["what time do you open", "en"], ["เวลาเปิดทำการ", "th"]]) {
  const openingHours = engine.flowResolveTypedReply(draft, "menu", customerText, language);
  assert.equal(openingHours.status, "ready", `${customerText} should match the configured Opening hours route`);
  assert.equal(openingHours.targetId, "hours");
}
assert.equal(engine.flowResolveTypedReply(draft, "menu", "unrelated question", "en").status, "unmatched");

const expectedTemplateStops = { faq: "menu", lead: "need", appointment: "service", product: "category", support: "issue", blank: "welcome" };
for (const [template, expectedStop] of Object.entries(expectedTemplateStops)) {
  const templateDraft = engine.createFlowDraft(template);
  const path = engine.flowExecutionPath(templateDraft, templateDraft.entryId, "en");
  assert.equal(path.currentId, expectedStop, `${template} did not stop at its first designed customer action`);
  for (const templateNode of templateDraft.nodes) {
    for (const option of engine.flowActiveOptions(templateNode)) {
      assert.ok(templateDraft.nodes.some((item) => item.id === option.target), `${template}:${templateNode.id} points to missing ${option.target}`);
    }
  }
  assert.deepEqual(engine.flowDraftErrors(templateDraft), [], `${template} contains structural errors`);
}
const faqDraft = engine.createFlowDraft("faq");
const faqOpeningHours = engine.flowResolveTypedReply(faqDraft, "menu", "opening hour", "en");
assert.equal(faqOpeningHours.targetId, "hours");
for (const answerId of ["services", "pricing", "hours"]) {
  const answerPath = engine.flowExecutionPath(faqDraft, answerId, "en");
  assert.deepEqual(answerPath.steps.map((step) => step.id), [answerId]);
  assert.equal(answerPath.currentId, answerId, `${answerId} must show its own reply buttons without an extra message`);
  assert.equal(faqDraft.nodes.find((item) => item.id === answerId)?.type, "options");
}
const askAgain = engine.flowResolveChoice(faqDraft, "services", 0, "en");
assert.equal(askAgain.targetId, "menu");
const contactAfterAnswer = engine.flowResolveChoice(faqDraft, "services", 1, "en");
assert.equal(contactAfterAnswer.targetId, "lead");
assert.equal(faqDraft.nodes.find((item) => item.id === contactAfterAnswer.targetId)?.type, "form");

const leadDraft = engine.createFlowDraft("lead");
assert.deepEqual(engine.flowExecutionPath(leadDraft, "summary", "en").steps.map((step) => step.id), ["summary", "summary_next"]);
assert.equal(engine.flowResolveChoice(leadDraft, "summary_next", 0, "en").targetId, "need");
assert.equal(engine.flowResolveChoice(leadDraft, "summary_next", 1, "en").targetId, "lead");
assert.equal(engine.flowResolveChoice(leadDraft, "summary_next", 2, "en").targetId, "information_end");

const supportDraft = engine.createFlowDraft("support");
assert.deepEqual(engine.flowExecutionPath(supportDraft, "guidance", "en").steps.map((step) => step.id), ["guidance", "resolution"]);
assert.equal(engine.flowResolveChoice(supportDraft, "resolution", 0, "en").targetId, "thanks");
assert.equal(engine.flowResolveChoice(supportDraft, "resolution", 1, "en").targetId, "handover");

const looseMessage = node("loose", "message");
looseMessage.needsConnection = true;
assert.equal(engine.flowExecutionPath({ nodes: [looseMessage] }, "loose", "en").status, "unconnected");
assert.equal(engine.flowExecutionPath({ nodes: [node("empty", "options")] }, "empty", "en").status, "invalid");

const disconnectedDraft = structuredClone(draft);
assert.equal(engine.flowSetDestination(disconnectedDraft, "menu", "option", 0, ""), true);
const disconnected = engine.flowResolveChoice(disconnectedDraft, "menu", 0, "en");
assert.equal(disconnected.status, "unconnected");
assert.match(disconnected.error, /not connected/);
assert.ok(engine.flowDraftErrors(disconnectedDraft).some((error) => error.includes("needs a destination")));
assert.equal(engine.flowSetDestination(disconnectedDraft, "menu", "option", 0, "sales"), true);
assert.equal(engine.flowResolveChoice(disconnectedDraft, "menu", 0, "en").status, "ready");
assert.equal(engine.flowSetDestination(disconnectedDraft, "menu", "option", 0, "menu"), false);

const deletionDraft = structuredClone(draft);
const deletion = engine.flowRemoveNodeFromDraft(deletionDraft, "done");
assert.deepEqual(deletion, { removed: true, disconnected: 3 });
assert.equal(deletionDraft.nodes.find((item) => item.id === "sales").next, null);
assert.equal(deletionDraft.nodes.find((item) => item.id === "sales").needsConnection, true);
assert.ok(engine.flowDraftErrors(deletionDraft).some((error) => error.includes("needs a destination")));

const inactiveDeletionDraft = structuredClone(draft);
inactiveDeletionDraft.nodes[0].options = [{ en: "Stored", th: "เก็บไว้", target: "done" }];
assert.equal(engine.flowRemoveNodeFromDraft(inactiveDeletionDraft, "done").disconnected, 4);
assert.equal(inactiveDeletionDraft.nodes[0].options[0].target, "");

const legacy = {
  entryId: "legacy",
  identity: { defaultLanguage: "en" },
  nodes: [{ ...node("legacy", "message"), options: [{ label: "Continue", th: "ต่อ", target: "done" }] }, node("done", "end")],
};
engine.normalizeFlowDraftTranslations(legacy);
assert.equal(legacy.schemaVersion, 5);
assert.equal(legacy.nodes[0].type, "options");
assert.deepEqual(legacy.nodes[0].options[0], { en: "Continue", th: "ต่อ", target: "done" });
assert.equal(legacy.identity.languageMode, "customer-choice");

const current = {
  schemaVersion: 5,
  entryId: "current",
  identity: {},
  nodes: [{ ...node("current", "message", "done"), options: [{ en: "Stored", th: "เก็บไว้", target: "done" }] }, node("done", "end")],
};
engine.normalizeFlowDraftTranslations(current);
assert.equal(current.nodes[0].type, "message", "inactive stored replies must not change an explicitly selected current behavior");
assert.deepEqual(engine.flowDraftErrors(current), []);

const legacyFaq = engine.createFlowDraft("faq");
legacyFaq.schemaVersion = 3;
for (const answerId of ["services", "pricing", "hours"]) {
  const answer = legacyFaq.nodes.find((item) => item.id === answerId);
  answer.type = "message";
  answer.options = [];
}
legacyFaq.nodes.find((item) => item.id === "services").next = "lead";
legacyFaq.nodes.find((item) => item.id === "pricing").next = "lead";
legacyFaq.nodes.find((item) => item.id === "hours").next = "menu";
engine.normalizeFlowDraftTranslations(legacyFaq);
assert.equal(legacyFaq.schemaVersion, 5);
for (const answerId of ["services", "pricing", "hours"]) {
  const answer = legacyFaq.nodes.find((item) => item.id === answerId);
  assert.equal(answer.type, "options", "saved FAQ answers must show reply buttons directly");
  assert.equal(answer.next, null);
  assert.equal(answer.options.length, 2);
}

const versionFourFaq = engine.createFlowDraft("faq");
versionFourFaq.schemaVersion = 4;
for (const answerId of ["services", "pricing", "hours"]) {
  const answer = versionFourFaq.nodes.find((item) => item.id === answerId);
  answer.type = "message";
  answer.options = [];
  answer.next = "after_answer";
}
versionFourFaq.nodes.push(node("after_answer", "options", null, [
  { en: "Ask another question", th: "ถามคำถามอื่น", target: "menu" },
  { en: "Contact the team", th: "ติดต่อทีมงาน", target: "lead" },
]));
engine.normalizeFlowDraftTranslations(versionFourFaq);
assert.equal(versionFourFaq.schemaVersion, 5);
assert.ok(!versionFourFaq.nodes.some((item) => item.id === "after_answer"), "obsolete generic follow-up nodes must be removed");
for (const answerId of ["services", "pricing", "hours"]) assert.equal(versionFourFaq.nodes.find((item) => item.id === answerId).type, "options");

const loop = { ...structuredClone(draft), nodes: [node("a", "message", "b"), node("b", "message", "a")], entryId: "a" };
assert.equal(engine.flowExecutionPath(loop, "a", "en", 3).status, "loop");

assert.match(source, /flowChoice\('New reply','คำตอบใหม่',''\)/, "new customer replies must start unconnected");
assert.match(source, /openFlowDraftTest\(flowState\.testLanguage,flowDraft\.entryId,'entry'\)/, "normal customer testing must start at the entry message");
assert.match(source, /flowTestStart\(node\.id,'selected'\)/, "selected-message testing must remain explicit");
assert.match(source, /const node = flowState\.panel === 'test' \? flowDraft\.nodes\.find\(item => item\.id === flowState\.testNodeId\)/, "customer-test actions must bind to the active test message, not the selected editor message");
assert.match(source, /flowResolveTypedReply\(flowDraft,flowState\.testNodeId,value,flowState\.testLanguage\)/, "typed replies must resolve from the active customer-test message");
assert.doesNotMatch(source, /data-flow-test-option="\$\{escapeHtml\(option\.target\)\}"/, "tester must not use an unchecked destination as its button identity");

for (const match of source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
  new Function(match[1]);
}

console.info("Flow builder graph, choices, migration, deletion, validation, and customer traversal passed.");
