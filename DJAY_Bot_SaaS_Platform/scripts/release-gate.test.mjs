import assert from "node:assert/strict";
import test from "node:test";
import { releaseGatePhases } from "./release-gate.mjs";

test("release gate has unique, non-skipping production phases", () => {
  const ids = releaseGatePhases.map(([id]) => id);
  assert.equal(new Set(ids).size, ids.length);
  for (const required of [
    "source", "database", "accessibility", "flowbot", "ai-text", "voice", "voice-load",
    "dependency-outage", "resilience", "recovery", "backup-restore", "negative-smoke",
    "abuse-floor", "release-package", "artifact-runtime", "sellability-evidence", "staging-evidence",
  ]) assert.ok(ids.includes(required), `missing ${required}`);
  assert.ok(releaseGatePhases.every(([, script]) => !/[|&;]|true$/.test(script)), "phase may bypass failure");
});
