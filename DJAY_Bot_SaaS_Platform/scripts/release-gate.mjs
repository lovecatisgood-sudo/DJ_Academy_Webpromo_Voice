#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const releaseGatePhases = Object.freeze([
  ["source", "verify"],
  ["database", "test:db"],
  ["accessibility", "test:a11y:release"],
  ["ui-foundation", "qa:ui-foundation"],
  ["merchant-ui", "qa:p3-ui"],
  ["flowbot", "qa:p4-flowbot"],
  ["ai-text", "qa:p5-ai-chat"],
  ["voice", "qa:p7-voice"],
  ["voice-evaluation", "qa:p8-voice-eval"],
  ["voice-load", "qa:p8-voice-load"],
  ["usage", "qa:p9-usage"],
  ["operations", "qa:p9-operations"],
  ["status", "qa:p9-status"],
  ["dependency-outage", "qa:p9-dependency-outage"],
  ["resilience", "qa:p9-resilience"],
  ["recovery", "qa:p9-recovery"],
  ["backup-restore", "qa:p9-restore"],
  ["merchant-package", "qa:merchant-first-sku"],
  ["negative-smoke", "qa:smoke-negatives"],
  ["abuse-floor", "qa:abuse-floor"],
  ["release-package", "package:release"],
  ["artifact-runtime", "qa:release-artifacts"],
  ["sellability-evidence", "gate:evidence-wave0"],
  ["staging-evidence", "gate:evidence-wave1"],
]);

function gitRevision() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "unavailable";
}

export function runReleaseGate() {
  const startedAt = new Date().toISOString();
  const results = [];
  for (const [id, script] of releaseGatePhases) {
    console.info(`\n[release:gate] ${id} -> pnpm run ${script}`);
    const started = Date.now();
    const result = spawnSync("pnpm", ["run", script], { cwd: root, stdio: "inherit", env: process.env });
    results.push({ id, script, exitCode: result.status ?? 1, durationMs: Date.now() - started });
  }
  const failed = results.filter((result) => result.exitCode !== 0);
  const report = {
    schema: "djay.release-gate.v1",
    revision: gitRevision(),
    startedAt,
    completedAt: new Date().toISOString(),
    passed: failed.length === 0,
    phases: results,
  };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  const digest = createHash("sha256").update(serialized).digest("hex");
  const evidenceRoot = resolve(root, "artifacts", "release-gate");
  mkdirSync(evidenceRoot, { recursive: true });
  writeFileSync(resolve(evidenceRoot, `${digest}.json`), serialized, { flag: "wx" });
  writeFileSync(resolve(evidenceRoot, "latest.json"), serialized);
  console.info(`\n[release:gate] evidence sha256:${digest}`);
  if (failed.length) {
    console.error(`[release:gate] FAIL: ${failed.map((item) => item.id).join(", ")}`);
    return 1;
  }
  console.info("[release:gate] PASS");
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runReleaseGate();
}
