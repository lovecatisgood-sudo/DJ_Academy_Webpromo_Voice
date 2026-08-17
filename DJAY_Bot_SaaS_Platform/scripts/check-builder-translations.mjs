import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = readFileSync(resolve(root, "docs/design/djay-bot-text-voice-configuration-flow.html"), "utf8");

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Builder is missing ${name}`);
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
    else if (character === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

const normalizeTranslationRecord = new Function(`${extractFunction("normalizeTranslationRecord")}; return normalizeTranslationRecord;`)();
assert.deepEqual(normalizeTranslationRecord(undefined, "Hello"), {
  en: "Hello", th: "", sourceEn: "", status: "missing", reviewed: false,
});
assert.equal(normalizeTranslationRecord({ en: "Hello", th: "สวัสดี", sourceEn: "Hello", reviewed: false }, "Hello").status, "needs_review");
assert.equal(normalizeTranslationRecord({ en: "Hello", th: "สวัสดี", sourceEn: "Hello", reviewed: true }, "Hello").status, "current");
const stale = normalizeTranslationRecord({ en: "Hello", th: "สวัสดี", sourceEn: "Hello", reviewed: true }, "Welcome");
assert.equal(stale.status, "stale");
assert.equal(stale.reviewed, false);

for (const marker of [
  "English & Thai translations", "Missing Thai", "Stale after English edit", "Needs merchant review",
  "Current and reviewed", "translateAllCustomerCopy", "data-customer-translation-en",
  "data-customer-translation-th", "data-review-customer-translation", "data-generate-customer-translation",
  "faq.translationKey", "voiceDisclosure", "function publicationBlockers()",
  "Missing or stale customer-facing translations are structural publication blockers",
  "Review and tests remain advisory",
]) assert.ok(source.includes(marker), `Builder translation lifecycle is missing ${marker}`);

assert.ok(source.includes("else if (state.section === 'translations') html = textVoiceTranslationsSection()"));
assert.ok(source.includes("channel,translations,{key:'test'"));
console.log("Flow, Text, and Voice translation missing/stale/review lifecycle passed.");
