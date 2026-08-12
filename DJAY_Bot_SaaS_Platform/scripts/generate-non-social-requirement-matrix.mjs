#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const registry = JSON.parse(readFileSync(resolve(root, "requirements/market-release-v1.yaml"), "utf8"));
const output = resolve(root, "docs/validation/non-social-requirement-matrix.md");

function fileEvidence(values = []) {
  const pathLike = values.filter((value) => typeof value === "string" && /[/.]/.test(value));
  const existing = pathLike.filter((value) => existsSync(resolve(root, value)));
  return { mapped: pathLike.length, existing: existing.length, missing: pathLike.filter((value) => !existing.includes(value)) };
}

const rows = registry.requirements.map((requirement) => {
  const implementation = fileEvidence(requirement.implementation_paths);
  const tests = fileEvidence(requirement.test_ids);
  const runbooks = fileEvidence(requirement.runbooks);
  const evidence = fileEvidence(requirement.evidence);
  const accepted = requirement.status === "accepted" && Boolean(requirement.accepted_by);
  const mapped = implementation.existing + tests.existing + runbooks.existing + evidence.existing;
  const missing = [...implementation.missing, ...tests.missing, ...runbooks.missing, ...evidence.missing];
  return { requirement, implementation, tests, runbooks, evidence, accepted, mapped, missing };
});

const summary = {
  total: rows.length,
  accepted: rows.filter((row) => row.accepted).length,
  mapped: rows.filter((row) => row.mapped > 0).length,
  missingReferences: rows.filter((row) => row.missing.length > 0).length,
};

const lines = [
  "# Non-social production-readiness requirement matrix",
  "",
  `Generated from \`requirements/market-release-v1.yaml\`. Registry count: **${summary.total}**; formally accepted: **${summary.accepted}**; requirements with at least one existing mapped artifact: **${summary.mapped}**; requirements containing stale or missing path references: **${summary.missingReferences}**.`,
  "",
  "> An existing file is mapping evidence, not acceptance evidence. A requirement remains unaccepted until its named tests, environment evidence, and authorized reviewer are recorded in the release registry. Social-channel implementation may exist in source but is outside the current release scope.",
  "",
  "## Current strict-audit gap register",
  "",
  "| Area | Current evidence | Remaining gate |",
  "|---|---|---|",
  "| Flow authoring | Editable canvas, bounded undo/redo, conflict handling, autosave, safe production-engine simulation, selected-node start, path highlighting | Browser keyboard/pointer/responsive acceptance after authorization |",
  "| Support and notifications | In-app guide/search, tenant-isolated ticket conversation, entitlement-derived Standard/Priority queue, internal response-target state, immutable closure feedback, quarantined one-time uploads, signature/size/malware scanning, clean-only downloads, and one tenant notification center spanning customer operations, support, billing, usage, team security, current-version bot tests, onboarding, all three deployment families, privacy jobs, ownership transfers, and temporary support access with dedupe, authoritative deep links, per-member read state, immutable history, and an explicitly proposed machine-readable channel policy | Unmocked transactional email delivery, product/legal approval of the proposed event-to-channel policy, and browser acceptance |",
  "| Merchant operations | Cross-bot customer journey, contacts/leads/inbox, appointment and overdue-first callback queues, guarded transitions, immutable status histories, provider-confirmed calendar create/repeat-reschedule/cancel authority with encrypted profiles, bounded retry, two-person reviewed dead-letter recovery, immutable generation-aware attempt evidence, merchant-confirmed closed-deal value attribution, privacy export, Thai-compatible formula-safe CSV exports, and one tenant-scoped aggregate Operations Report with exact period/product filters, operational trends, outcomes, completed work, and currency-separated confirmed value | Browser acceptance, unmocked calendar-provider acceptance, and approved outcome definitions |",
  "| Test Center | Product-aware server-authoritative checklist; Flow production-engine simulation; AI/Voice tests; immutable, replay-safe, tenant-isolated evidence bound to the current published Flow/AI/Voice version | Approved Thai/English scenario packs, quality thresholds, and staging acceptance |",
  "| Platform Master | Stable role-filtered routes load only their queue family; audited Tenant 360 exposes bounded non-PII operational references; and tenant-linked incidents provide category/severity/product scope, retry-safe creation, accountable reassignment, guarded lifecycle, immutable history/audit evidence, tenant/status filters, and finance narrative denial | Further component decomposition and per-route desktop/tablet/keyboard browser acceptance |",
  "| Release gate | One non-skipping orchestrator covers source, DB, accessibility, products, outage, recovery, restore, artifacts and evidence waves | Browser authorization plus staging/provider/commercial/legal/named-merchant evidence |",
  "",
  "## Registry matrix",
  "",
  "| ID | Owner | Packages | Registry state | Code | Tests | Evidence/runbooks | Missing mapped paths | Requirement |",
  "|---|---|---|---|---:|---:|---:|---|---|",
];

for (const row of rows) {
  const { requirement } = row;
  const state = row.accepted ? "accepted" : requirement.status ?? "planned";
  const missing = row.missing.length ? row.missing.map((value) => `\`${value}\``).join("<br>") : "—";
  const title = String(requirement.title).replaceAll("|", "\\|").replaceAll("\n", " ");
  lines.push(`| ${requirement.id} | ${requirement.owner_work_package ?? "—"} | ${(requirement.packages ?? []).join(", ")} | ${state} | ${row.implementation.existing}/${row.implementation.mapped} | ${row.tests.existing}/${row.tests.mapped} | ${row.evidence.existing + row.runbooks.existing}/${row.evidence.mapped + row.runbooks.mapped} | ${missing} | ${title} |`);
}

writeFileSync(output, `${lines.join("\n")}\n`);
console.info(`Generated ${output} with ${rows.length} requirements.`);
