import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const failures = [];
const read = (path) => readFileSync(resolve(root, path), "utf8");

const container = read("apps/api/lib/container.ts");
for (const marker of ["LEGAL_DOCUMENTS_FILE", "loadLegalDocuments(", "legalDocuments,", "registration: createRegistrationService(", "legalVersions: legalDocuments ?", "legalDocuments.terms.version", "legalDocuments.privacy.version"]) {
  if (!container.includes(marker)) failures.push(`API legal authority is missing ${marker}`);
}
if (/terms-20\d\d|privacy-20\d\d/.test(container)) failures.push("API registration retains a hard-coded legal version");

const authContract = read("packages/auth/src/contracts.ts");
const registration = read("packages/auth/src/registration.ts");
for (const marker of ["termsVersion: legalDocumentVersionSchema", "privacyVersion: legalDocumentVersionSchema"]) {
  if (!authContract.includes(marker)) failures.push(`registration input is missing ${marker}`);
}
for (const marker of ["!config.legalVersions", "parsed.termsVersion !== config.legalVersions.termsVersion", "parsed.privacyVersion !== config.legalVersions.privacyVersion", "legal_version_changed"]) {
  if (!registration.includes(marker)) failures.push(`registration version binding is missing ${marker}`);
}

const publicPage = read("apps/public-site/app/register/page.tsx");
for (const marker of ["/public/legal", 'href="/terms"', 'href="/privacy"', "legalStage !== \"ready\"", "termsVersion: legal.terms.version", "privacyVersion: legal.privacy.version"]) {
  if (!publicPage.includes(marker)) failures.push(`public registration is missing ${marker}`);
}

for (const path of [
  "apps/api/app/public/legal/route.ts",
  "apps/api/app/public/legal/[kind]/route.ts",
  "apps/public-site/app/terms/page.tsx",
  "apps/public-site/app/privacy/page.tsx",
  "apps/public-site/app/LegalDocumentClient.tsx",
]) {
  if (!existsSync(resolve(root, path))) failures.push(`legal route missing: ${path}`);
}

const legalClient = read("apps/public-site/app/LegalDocumentClient.tsx");
if (legalClient.includes("dangerouslySetInnerHTML")) failures.push("legal documents bypass React text escaping");
for (const marker of ["Registration remains paused", 'aria-busy={stage === "loading"}', "document.sections.map"]) {
  if (!legalClient.includes(marker)) failures.push(`legal document UI is missing ${marker}`);
}

const releaseReadiness = read("apps/api/app/platform/release-readiness/route.ts");
for (const marker of ["registrationAuthorityGate(", "registration.passing", "registration,"]) {
  if (!releaseReadiness.includes(marker)) failures.push(`release readiness is missing live legal authority marker ${marker}`);
}
const platformPage = read("apps/platform-master/app/page.tsx");
for (const marker of ["readiness.registration.passing", "Registration authority", "Approved bundle required"]) {
  if (!platformPage.includes(marker)) failures.push(`Platform release UI is missing ${marker}`);
}

if (!read(".env.example").includes("LEGAL_DOCUMENTS_FILE=/run/secrets/djay-legal-documents.json")) {
  failures.push("environment example is missing the approved legal bundle mount");
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.info("Approved-file legal documents, branded public review routes, and version-bound fail-closed registration policy passed.");
