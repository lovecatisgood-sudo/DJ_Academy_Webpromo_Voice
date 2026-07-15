import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const bundlePaths = ["index.js", "djay-voice-widget.js"].map((name) => resolve(import.meta.dirname, `../packages/voice-widget/dist/${name}`));
const restricted = /\b(openai|anthropic|claude|gemini|gpt-[0-9]|provider[_ -]?(?:key|name|id)|model[_ -]?id|database_url|authorization_service_token)\b/i;

for (const bundlePath of bundlePaths) {
  const bundle = readFileSync(bundlePath, "utf8");
  if (restricted.test(bundle)) {
    console.error("Voice widget bundle contains a restricted routing or credential identifier.");
    process.exit(1);
  }
  if (!bundle.includes("djay.voice.v1") || !bundle.includes("First-Generation Voice Engine")) {
    console.error("Voice widget bundle is missing its controlled public protocol markers.");
    process.exit(1);
  }
}
console.log("Voice widget browser bundle confidentiality scan passed.");
