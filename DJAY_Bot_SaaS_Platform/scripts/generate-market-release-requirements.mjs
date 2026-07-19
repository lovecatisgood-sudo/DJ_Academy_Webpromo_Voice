import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractPrdRequirements, marketReleasePlanKeys } from "./market-release-requirements-lib.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const prdPath = resolve(root, "docs/product/djay-bots-v1-market-release-prd.md");
const outputPath = resolve(root, "requirements/market-release-v1.yaml");

const planAssignments = Object.freeze({
  ADD: ["COM-02", ["COM-01", "BILL-02"]],
  AIT: ["AI-02", ["AI-01", "AI-03"]],
  ANA: ["OPS-05", []],
  ATA: ["AI-04", ["AI-01", "AI-02", "AI-05", "AI-06"]],
  ATS: ["AI-03", ["AI-01", "AI-02"]],
  BIL: ["BILL-01", ["BILL-02", "FIN-01"]],
  BOT: ["COM-02", ["CORE-02", "CORE-03"]],
  CHN: ["CHAN-01", ["WEB-01", "OPS-01"]],
  COM: ["COM-01", ["COM-02", "BILL-01"]],
  EXP: ["BILL-01", ["CORE-02", "CORE-03"]],
  FIN: ["FIN-01", ["FIN-02", "PLAT-02"]],
  FLA: ["FLOW-05", ["FLOW-01", "FLOW-02", "FLOW-04"]],
  FLS: ["FLOW-01", ["FLOW-02", "FLOW-03"]],
  IDN: ["CORE-01", ["CORE-03"]],
  INT: ["INT-01", ["OPS-02"]],
  KNO: ["AI-01", ["AI-03", "AI-06"]],
  LEAD: ["OPS-02", ["OPS-01"]],
  MET: ["COM-03", ["PLAT-02"]],
  NOT: ["OPS-04", ["CORE-03"]],
  ONB: ["CORE-02", ["CORE-03"]],
  OPS: ["OPS-03", ["OPS-01", "OPS-02", "OPS-05"]],
  OVR: ["COM-03", ["BILL-02", "PLAT-02"]],
  PLT: ["PLAT-01", ["PLAT-02", "PLAT-03", "PLAT-04"]],
  PRO: ["OPS-04", ["PLAT-04"]],
  REL: ["CLOUD-04", ["CLOUD-03", "CLOUD-05", "GA-03"]],
  SEC: ["CORE-01", ["CLOUD-01", "GA-01"]],
  SOC: ["CHAN-01", ["FLOW-04", "AI-05", "OPS-01"]],
  SUP: ["OPS-04", ["PLAT-04"]],
  TEL: ["VOICE-03", ["VOICE-04", "VOICE-06"]],
  TEN: ["CORE-01", ["CORE-02"]],
  UX: ["CORE-03", ["GA-02"]],
  VOA: ["VOICE-04", ["VOICE-01", "VOICE-03", "VOICE-05", "VOICE-06"]],
  VOI: ["VOICE-01", ["VOICE-02", "VOICE-06"]],
  VOS: ["VOICE-02", ["VOICE-01", "VOICE-06"]],
  WEB: ["WEB-01", ["FLOW-03", "AI-03", "VOICE-02"]],
});

function packagesFor(id) {
  const prefix = id.split("-")[0];
  if (prefix === "FLS") return ["flowbot_basic", "flowbot_premium"];
  if (prefix === "FLA") return ["flowbot_premium"];
  if (["AIT", "KNO", "ATS"].includes(prefix)) return ["ai_chat_basic", "ai_chat_premium"];
  if (prefix === "ATA") return ["ai_chat_premium"];
  if (["VOI", "VOS"].includes(prefix)) return ["voice_basic_gen1", "voice_advanced_gen2"];
  if (["VOA", "TEL"].includes(prefix)) return ["voice_advanced_gen2"];
  if (prefix === "SOC") return ["flowbot_premium", "ai_chat_premium"];
  if (prefix === "WEB") return [...marketReleasePlanKeys];
  return ["shared"];
}

const prdRequirements = extractPrdRequirements(readFileSync(prdPath, "utf8"));
const existingRegistry = existsSync(outputPath) ? JSON.parse(readFileSync(outputPath, "utf8")) : null;
const existingById = new Map((existingRegistry?.requirements ?? []).map((requirement) => [requirement.id, requirement]));
const requirements = prdRequirements.map(({ id, title }) => {
  const prefix = id.split("-")[0];
  const assignment = planAssignments[prefix];
  if (!assignment) throw new Error(`missing work-package assignment for ${id}`);
  const existing = existingById.get(id);
  if (existing) return { ...existing, id, title };
  return {
    id,
    title,
    packages: packagesFor(id),
    owner_work_package: assignment[0],
    supporting_work_packages: assignment[1],
    implementation_paths: [],
    migration_ids: [],
    api_contracts: [],
    ui_routes: [],
    entitlement_keys: [],
    meter_keys: [],
    test_ids: [],
    runbooks: [],
    evidence: [],
    status: "planned",
    accepted_by: null,
  };
});

const registry = {
  $schema: "./market-release-v1.schema.json",
  schema_version: "1.0.0",
  prd: {
    path: "docs/product/djay-bots-v1-market-release-prd.md",
    expected_requirement_count: prdRequirements.length,
  },
  packages: marketReleasePlanKeys.map((plan_key) => ({ plan_key, sellable: false })),
  requirements,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(registry, null, 2)}\n`);
console.info(`Synchronized ${requirements.length} market-release requirement records at ${outputPath}.`);
