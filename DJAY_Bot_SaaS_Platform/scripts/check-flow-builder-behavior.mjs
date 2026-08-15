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
  "normalizeFlowDraftTranslations",
  "flowOptionText",
  "flowActiveOptions",
  "flowExecutionPath",
  "flowResolveChoice",
  "flowSetDestination",
  "flowRemoveNodeFromDraft",
  "flowDraftErrors",
];
const body = `${functionNames.map(extractFunction).join("\n")}\nreturn { ${functionNames.join(",")} };`;
const engine = new Function("flowSchemaVersion", body)(3);

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
    ]),
    node("sales", "message", "done"),
    node("support", "message", "done"),
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
assert.deepEqual(deletion, { removed: true, disconnected: 2 });
assert.equal(deletionDraft.nodes.find((item) => item.id === "sales").next, null);
assert.equal(deletionDraft.nodes.find((item) => item.id === "sales").needsConnection, true);
assert.ok(engine.flowDraftErrors(deletionDraft).some((error) => error.includes("needs a destination")));

const inactiveDeletionDraft = structuredClone(draft);
inactiveDeletionDraft.nodes[0].options = [{ en: "Stored", th: "เก็บไว้", target: "done" }];
assert.equal(engine.flowRemoveNodeFromDraft(inactiveDeletionDraft, "done").disconnected, 3);
assert.equal(inactiveDeletionDraft.nodes[0].options[0].target, "");

const legacy = {
  entryId: "legacy",
  identity: { defaultLanguage: "en" },
  nodes: [{ ...node("legacy", "message"), options: [{ label: "Continue", th: "ต่อ", target: "done" }] }, node("done", "end")],
};
engine.normalizeFlowDraftTranslations(legacy);
assert.equal(legacy.schemaVersion, 3);
assert.equal(legacy.nodes[0].type, "options");
assert.deepEqual(legacy.nodes[0].options[0], { en: "Continue", th: "ต่อ", target: "done" });
assert.equal(legacy.identity.languageMode, "customer-choice");

const current = {
  schemaVersion: 3,
  entryId: "current",
  identity: {},
  nodes: [{ ...node("current", "message", "done"), options: [{ en: "Stored", th: "เก็บไว้", target: "done" }] }, node("done", "end")],
};
engine.normalizeFlowDraftTranslations(current);
assert.equal(current.nodes[0].type, "message", "inactive stored replies must not change an explicitly selected current behavior");
assert.deepEqual(engine.flowDraftErrors(current), []);

const loop = { ...structuredClone(draft), nodes: [node("a", "message", "b"), node("b", "message", "a")], entryId: "a" };
assert.equal(engine.flowExecutionPath(loop, "a", "en", 3).status, "loop");

assert.match(source, /flowChoice\('New reply','คำตอบใหม่',''\)/, "new customer replies must start unconnected");
assert.match(source, /openFlowDraftTest\(flowState\.testLanguage,flowDraft\.entryId,'entry'\)/, "normal customer testing must start at the entry message");
assert.match(source, /flowTestStart\(node\.id,'selected'\)/, "selected-message testing must remain explicit");
assert.doesNotMatch(source, /data-flow-test-option="\$\{escapeHtml\(option\.target\)\}"/, "tester must not use an unchecked destination as its button identity");

for (const match of source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
  new Function(match[1]);
}

console.info("Flow builder graph, choices, migration, deletion, validation, and customer traversal passed.");
