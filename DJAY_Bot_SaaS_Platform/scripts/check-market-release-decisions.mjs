import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const register = JSON.parse(readFileSync(resolve("requirements/market-release-decisions.yaml"), "utf8"));
const requiredIds = [
  "TEL-DEC-001", "CRM-DEC-001", "FIN-DEC-001", "LANG-DEC-001", "STRIPE-DEC-001",
  "OVR-DEC-001", "KNO-DEC-001", "SEC-DEC-001", "GCP-DEC-001", "VENDOR-DEC-001",
];
const errors = [];
const ids = register.decisions?.map((decision) => decision.id) ?? [];
if (new Set(ids).size !== ids.length) errors.push("duplicate decision id");
for (const id of requiredIds) if (!ids.includes(id)) errors.push(`missing decision ${id}`);
for (const id of ids) if (!requiredIds.includes(id)) errors.push(`unknown decision ${id}`);
for (const decision of register.decisions ?? []) {
  if (!register.allowed_statuses?.includes(decision.status)) errors.push(`${decision.id}: invalid status`);
  for (const field of ["title", "owner", "deadline_gate", "fallback", "notes"]) {
    if (typeof decision[field] !== "string" || decision[field].trim().length < 3) errors.push(`${decision.id}: invalid ${field}`);
  }
  for (const field of ["supporting_owners", "required_evidence", "blocker_scope"]) {
    if (!Array.isArray(decision[field]) || decision[field].length === 0) errors.push(`${decision.id}: empty ${field}`);
  }
}
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log(`Market-release decision register valid: ${ids.length} decisions, ${register.decisions.filter((item) => item.status === "blocked").length} explicit blockers.`);
