import assert from "node:assert/strict";
import test from "node:test";
import {
  isAllowedRequirementStatusTransition,
  validateRequirementRegistrySchemaDocument,
  validateRequirementRegistry,
} from "./market-release-requirements-lib.mjs";

const workPackages = new Set(["CTRL-01"]);
const prdRequirements = [{ id: "COM-001", title: "Authoritative commercial requirement." }];

function validRegistry() {
  return {
    $schema: "./market-release-v1.schema.json",
    schema_version: "1.0.0",
    prd: { path: "docs/product/djay-bots-v1-market-release-prd.md", expected_requirement_count: 1 },
    packages: [
      "flowbot_basic", "flowbot_premium", "ai_chat_basic", "ai_chat_premium", "voice_basic_gen1", "voice_advanced_gen2",
    ].map((plan_key) => ({ plan_key, sellable: false })),
    requirements: [{
      id: "COM-001",
      title: "Authoritative commercial requirement.",
      packages: ["shared"],
      owner_work_package: "CTRL-01",
      supporting_work_packages: [],
      implementation_paths: [], migration_ids: [], api_contracts: [], ui_routes: [], entitlement_keys: [],
      meter_keys: [], test_ids: [], runbooks: [], evidence: [], status: "planned", accepted_by: null,
    }],
  };
}

function errorsFor(registry, expected = prdRequirements) {
  return validateRequirementRegistry({ registry, prdRequirements: expected, workPackages });
}

test("accepts the complete planned fail-closed registry", () => {
  assert.deepEqual(errorsFor(validRegistry()), []);
});

test("rejects a missing PRD requirement", () => {
  const registry = validRegistry();
  registry.requirements = [];
  const errors = errorsFor(registry);
  assert(errors.some((error) => error.includes("missing requirement COM-001")));
});

test("rejects duplicate and unknown requirement IDs", () => {
  const registry = validRegistry();
  registry.requirements.push({ ...registry.requirements[0] });
  registry.requirements.push({ ...registry.requirements[0], id: "COM-999" });
  const errors = errorsFor(registry);
  assert(errors.some((error) => error.includes("duplicate COM-001")));
  assert(errors.some((error) => error.includes("unknown requirement COM-999")));
});

test("rejects missing and unknown work-package ownership", () => {
  const registry = validRegistry();
  registry.requirements[0].owner_work_package = "COM-99";
  assert(errorsFor(registry).some((error) => error.includes("owner_work_package is missing or unknown")));
});

test("rejects unknown registry and requirement properties", () => {
  const registry = validRegistry();
  registry.unreviewed = true;
  registry.requirements[0].shortcut = "accepted";
  const errors = errorsFor(registry);
  assert(errors.some((error) => error.includes("registry contains unknown property unreviewed")));
  assert(errors.some((error) => error.includes("requirement COM-001 contains unknown property shortcut")));
});

test("requires implementation paths and tests at implemented", () => {
  const registry = validRegistry();
  registry.requirements[0].status = "implemented";
  const errors = errorsFor(registry);
  assert(errors.some((error) => error.includes("implemented without implementation_paths")));
  assert(errors.some((error) => error.includes("implemented without test_ids")));
});

test("requires staging evidence and acceptance authority", () => {
  const staging = validRegistry();
  staging.requirements[0].status = "staging_verified";
  assert(errorsFor(staging).some((error) => error.includes("staging_verified without evidence")));

  const accepted = validRegistry();
  accepted.requirements[0].status = "accepted";
  assert(errorsFor(accepted).some((error) => error.includes("accepted without evidence and accepted_by")));
});

test("denies package sellability while a requirement is unaccepted", () => {
  const registry = validRegistry();
  registry.packages[0].sellable = true;
  assert(errorsFor(registry).some((error) => error.includes("flowbot_basic is sellable with 1 unaccepted requirements")));
});

test("permits sellability only after evidence-backed acceptance", () => {
  const registry = validRegistry();
  registry.requirements[0].status = "accepted";
  registry.requirements[0].evidence = ["docs/validation/example.md"];
  registry.requirements[0].accepted_by = "product-owner";
  registry.packages[0].sellable = true;
  assert.deepEqual(errorsFor(registry), []);
});

test("enforces monotonic reviewed status transitions", () => {
  assert.equal(isAllowedRequirementStatusTransition("planned", "in_progress"), true);
  assert.equal(isAllowedRequirementStatusTransition("in_progress", "accepted"), false);
  assert.equal(isAllowedRequirementStatusTransition("staging_verified", "accepted"), true);
  assert.equal(isAllowedRequirementStatusTransition("accepted", "implemented"), false);
  assert.equal(isAllowedRequirementStatusTransition("blocked", "in_progress"), true);
  assert.equal(isAllowedRequirementStatusTransition("not_applicable", "accepted"), false);
});

test("validates the closed JSON Schema authority", () => {
  assert.deepEqual(validateRequirementRegistrySchemaDocument({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://djbot.djai.academy/schemas/market-release-v1.schema.json",
    type: "object",
    additionalProperties: false,
    properties: { requirements: {} },
    $defs: { requirement: {} },
  }), []);
  assert(validateRequirementRegistrySchemaDocument({}).length > 0);
});
