import { readFileSync } from "node:fs";

export const requirementStatuses = Object.freeze([
  "planned",
  "in_progress",
  "implemented",
  "staging_verified",
  "accepted",
  "blocked",
  "not_applicable",
]);

export const marketReleasePlanKeys = Object.freeze([
  "flowbot_basic",
  "flowbot_premium",
  "ai_chat_basic",
  "ai_chat_premium",
  "voice_basic_gen1",
  "voice_advanced_gen2",
]);

const transitions = Object.freeze({
  planned: new Set(["planned", "in_progress", "blocked"]),
  in_progress: new Set(["in_progress", "implemented", "blocked"]),
  implemented: new Set(["implemented", "in_progress", "staging_verified", "blocked"]),
  staging_verified: new Set(["staging_verified", "implemented", "accepted", "blocked"]),
  accepted: new Set(["accepted"]),
  blocked: new Set(["blocked", "planned", "in_progress"]),
  not_applicable: new Set(["not_applicable"]),
});

export function isAllowedRequirementStatusTransition(from, to) {
  return transitions[from]?.has(to) ?? false;
}

export function extractPrdRequirements(markdown) {
  const requirements = [];
  const expression = /^- `([A-Z]{2,4}-[0-9]{3})` (.+)$/gm;
  for (const match of markdown.matchAll(expression)) {
    requirements.push({ id: match[1], title: match[2].trim() });
  }
  return requirements;
}

export function extractImplementationWorkPackages(markdown) {
  const workPackages = new Set();
  const expression = /^\| `([A-Z]+-[0-9]{2})` \|/gm;
  for (const match of markdown.matchAll(expression)) workPackages.add(match[1]);
  return workPackages;
}

export function parseRequirementRegistry(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`market_release_registry_invalid_json: ${error instanceof Error ? error.message : "unknown parse error"}`);
  }
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function addDuplicateErrors(values, label, errors) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) errors.push(`${label} contains duplicate ${value}`);
    seen.add(value);
  }
}

function addUnknownPropertyErrors(value, allowed, label, errors) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`${label} contains unknown property ${key}`);
  }
}

function packageRequirements(registry, planKey) {
  return registry.requirements.filter((requirement) =>
    Array.isArray(requirement?.packages)
    && (requirement.packages.includes("shared") || requirement.packages.includes(planKey)));
}

export function validateRequirementRegistry({ registry, prdRequirements, workPackages }) {
  const errors = [];
  if (!registry || typeof registry !== "object" || Array.isArray(registry)) {
    return ["registry must be an object"];
  }
  addUnknownPropertyErrors(registry, new Set(["$schema", "schema_version", "prd", "packages", "requirements"]), "registry", errors);
  if (registry.schema_version !== "1.0.0") errors.push("schema_version must be 1.0.0");
  if (registry.$schema !== "./market-release-v1.schema.json") errors.push("$schema must reference ./market-release-v1.schema.json");
  if (registry.prd?.path !== "docs/product/djay-bots-v1-market-release-prd.md") errors.push("prd.path is not authoritative");
  const packagesInvalid = !Array.isArray(registry.packages);
  const requirementsInvalid = !Array.isArray(registry.requirements);
  if (packagesInvalid) errors.push("packages must be an array");
  if (requirementsInvalid) errors.push("requirements must be an array");
  if (packagesInvalid || requirementsInvalid) return errors;

  addUnknownPropertyErrors(registry.prd, new Set(["path", "expected_requirement_count"]), "prd", errors);

  const packageKeys = registry.packages.map((item) => item?.plan_key);
  addDuplicateErrors(packageKeys, "packages", errors);
  for (const planKey of marketReleasePlanKeys) {
    if (!packageKeys.includes(planKey)) errors.push(`missing package ${planKey}`);
  }
  for (const plan of registry.packages) {
    if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
      errors.push("package record must be an object");
      continue;
    }
    addUnknownPropertyErrors(plan, new Set(["plan_key", "sellable"]), `package ${String(plan?.plan_key)}`, errors);
    if (!marketReleasePlanKeys.includes(plan.plan_key)) errors.push(`unknown package ${String(plan.plan_key)}`);
    if (typeof plan.sellable !== "boolean") errors.push(`${String(plan.plan_key)} sellable must be boolean`);
  }

  const expectedById = new Map(prdRequirements.map((item) => [item.id, item]));
  const actualIds = registry.requirements.map((item) => item?.id);
  addDuplicateErrors(actualIds, "requirements", errors);
  if (registry.prd?.expected_requirement_count !== prdRequirements.length) {
    errors.push(`expected_requirement_count is ${String(registry.prd?.expected_requirement_count)} but PRD has ${prdRequirements.length}`);
  }
  if (registry.requirements.length !== prdRequirements.length) {
    errors.push(`registry has ${registry.requirements.length} requirements but PRD has ${prdRequirements.length}`);
  }

  for (const expected of prdRequirements) {
    if (!actualIds.includes(expected.id)) errors.push(`missing requirement ${expected.id}`);
  }
  for (const requirement of registry.requirements) {
    if (!requirement || typeof requirement !== "object" || Array.isArray(requirement)) {
      errors.push("requirement record must be an object");
      continue;
    }
    addUnknownPropertyErrors(requirement, new Set([
      "id", "title", "packages", "owner_work_package", "supporting_work_packages", "implementation_paths",
      "migration_ids", "api_contracts", "ui_routes", "entitlement_keys", "meter_keys", "test_ids", "runbooks",
      "evidence", "status", "accepted_by",
    ]), `requirement ${String(requirement.id)}`, errors);
    const expected = expectedById.get(requirement.id);
    if (!expected) {
      errors.push(`unknown requirement ${String(requirement.id)}`);
      continue;
    }
    if (requirement.title !== expected.title) errors.push(`${requirement.id} title does not match PRD`);
    if (!isStringArray(requirement.packages) || requirement.packages.length === 0) {
      errors.push(`${requirement.id} packages must be a non-empty string array`);
    } else {
      addDuplicateErrors(requirement.packages, `${requirement.id} packages`, errors);
      for (const planKey of requirement.packages) {
        if (planKey !== "shared" && !marketReleasePlanKeys.includes(planKey)) {
          errors.push(`${requirement.id} references unknown package ${planKey}`);
        }
      }
    }
    if (typeof requirement.owner_work_package !== "string" || !workPackages.has(requirement.owner_work_package)) {
      errors.push(`${requirement.id} owner_work_package is missing or unknown`);
    }
    if (!isStringArray(requirement.supporting_work_packages)) {
      errors.push(`${requirement.id} supporting_work_packages must be a string array`);
    } else {
      addDuplicateErrors(requirement.supporting_work_packages, `${requirement.id} supporting_work_packages`, errors);
      for (const workPackage of requirement.supporting_work_packages) {
        if (!workPackages.has(workPackage)) errors.push(`${requirement.id} references unknown supporting work package ${workPackage}`);
        if (workPackage === requirement.owner_work_package) errors.push(`${requirement.id} repeats its owner as supporting work`);
      }
    }
    for (const field of [
      "implementation_paths", "migration_ids", "api_contracts", "ui_routes", "entitlement_keys",
      "meter_keys", "test_ids", "runbooks", "evidence",
    ]) {
      if (!isStringArray(requirement[field])) errors.push(`${requirement.id} ${field} must be a string array`);
    }
    if (!requirementStatuses.includes(requirement.status)) errors.push(`${requirement.id} has invalid status ${String(requirement.status)}`);
    if (requirement.status === "implemented") {
      if (!Array.isArray(requirement.implementation_paths) || requirement.implementation_paths.length === 0) errors.push(`${requirement.id} implemented without implementation_paths`);
      if (!Array.isArray(requirement.test_ids) || requirement.test_ids.length === 0) errors.push(`${requirement.id} implemented without test_ids`);
    }
    if (requirement.status === "staging_verified" && (!Array.isArray(requirement.evidence) || requirement.evidence.length === 0)) {
      errors.push(`${requirement.id} staging_verified without evidence`);
    }
    if (requirement.status === "accepted" && (!Array.isArray(requirement.evidence) || requirement.evidence.length === 0 || typeof requirement.accepted_by !== "string" || !requirement.accepted_by.trim())) {
      errors.push(`${requirement.id} accepted without evidence and accepted_by`);
    }
    if (requirement.status === "not_applicable" && (typeof requirement.accepted_by !== "string" || !requirement.accepted_by.trim())) {
      errors.push(`${requirement.id} not_applicable without product-owner approval`);
    }
    if (!["accepted", "not_applicable"].includes(requirement.status) && requirement.accepted_by !== null) {
      errors.push(`${requirement.id} accepted_by must be null before acceptance`);
    }
  }

  for (const plan of registry.packages) {
    if (!plan || typeof plan !== "object" || Array.isArray(plan) || typeof plan.plan_key !== "string") continue;
    const required = packageRequirements(registry, plan.plan_key);
    if (required.length === 0) errors.push(`${plan.plan_key} maps to no requirements`);
    const incomplete = required.filter((requirement) => requirement.status !== "accepted");
    if (plan.sellable && incomplete.length > 0) {
      errors.push(`${plan.plan_key} is sellable with ${incomplete.length} unaccepted requirements`);
    }
  }
  return errors;
}

export function loadAndValidateRequirementRegistry({ registryPath, prdPath, implementationPlanPath }) {
  const registry = parseRequirementRegistry(readFileSync(registryPath, "utf8"));
  const prdRequirements = extractPrdRequirements(readFileSync(prdPath, "utf8"));
  const workPackages = extractImplementationWorkPackages(readFileSync(implementationPlanPath, "utf8"));
  return { registry, prdRequirements, workPackages, errors: validateRequirementRegistry({ registry, prdRequirements, workPackages }) };
}

export function validateRequirementRegistrySchemaDocument(schema) {
  const errors = [];
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return ["requirement registry schema must be an object"];
  if (schema.$schema !== "https://json-schema.org/draft/2020-12/schema") errors.push("requirement registry schema must use JSON Schema 2020-12");
  if (schema.$id !== "https://djbot.djai.academy/schemas/market-release-v1.schema.json") errors.push("requirement registry schema has an unexpected $id");
  if (schema.type !== "object" || schema.additionalProperties !== false) errors.push("requirement registry schema must define a closed object");
  if (!schema.$defs?.requirement || !schema.properties?.requirements) errors.push("requirement registry schema is missing its requirement definition");
  return errors;
}
