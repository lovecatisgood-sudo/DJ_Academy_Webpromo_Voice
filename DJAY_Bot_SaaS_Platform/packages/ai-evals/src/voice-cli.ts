import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { evaluateVoiceProfileArtifact } from "./voice.js";

const inputPath = process.argv[2] ?? process.env.P8_VOICE_EVAL_ARTIFACT;
if (!inputPath) {
  console.error("Set P8_VOICE_EVAL_ARTIFACT or pass the restricted artifact JSON path.");
  process.exit(2);
}

let bytes: Buffer;
let value: unknown;
try {
  bytes = await readFile(resolve(inputPath));
  value = JSON.parse(bytes.toString("utf8"));
} catch {
  console.error("Unable to read a valid Voice evaluation artifact.");
  process.exit(2);
}

const result = evaluateVoiceProfileArtifact(value);
console.info(JSON.stringify({
  passed: result.passed,
  artifactEvidenceDigest: createHash("sha256").update(bytes).digest("hex"),
  report: result.report,
  findings: result.findings,
}, null, 2));
if (!result.passed) process.exit(1);
