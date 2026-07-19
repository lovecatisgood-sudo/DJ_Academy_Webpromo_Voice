import { resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { loadAndValidateRequirementRegistry, validateRequirementRegistrySchemaDocument } from "./market-release-requirements-lib.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const result = loadAndValidateRequirementRegistry({
  registryPath: resolve(root, "requirements/market-release-v1.yaml"),
  prdPath: resolve(root, "docs/product/djay-bots-v1-market-release-prd.md"),
  implementationPlanPath: resolve(root, "docs/implementation/djay-bots-v1-detailed-implementation-plan.md"),
});
const schemaErrors = validateRequirementRegistrySchemaDocument(
  JSON.parse(readFileSync(resolve(root, "requirements/market-release-v1.schema.json"), "utf8")),
);
result.errors.unshift(...schemaErrors);

if (result.errors.length > 0) {
  for (const error of result.errors) console.error(`market_release_requirement_error: ${error}`);
  process.exitCode = 1;
} else {
  const accepted = result.registry.requirements.filter((item) => item.status === "accepted").length;
  console.info(`Market-release requirement registry valid: ${result.prdRequirements.length} requirements, ${accepted} accepted, 6 packages non-sellable.`);
}
