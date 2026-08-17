# Manual bilingual FAQ authoring and import evidence — 2026-08-17

## Scope

- `KNO-001`: manual FAQ authoring and import for AI Text Starter and Advanced.
- Existing guided playbook editing remains the persistence boundary; import never publishes or deploys automatically.

## Implemented controls

- Merchants can add, edit and remove Thai/English question-and-answer pairs in Configuration.
- CSV import requires `question_th`, `question_en`, `answer_th` and `answer_en`.
- Quoted fields, UTF-8 BOM and CRLF are supported.
- Empty bilingual fields, oversized values, malformed quotes, duplicates and the 100-FAQ aggregate limit reject the complete import atomically.
- Successful rows are added only to the current draft and require the existing authenticated Save Draft action.
- Existing server-side playbook validation, entitlement authority, immutable publication and deployment separation remain unchanged.

## Verification

- `pnpm --filter @djay/tenant-web test`: passed, 35 tests.
- `pnpm --filter @djay/tenant-web typecheck`: passed.
- `pnpm verify`: passed lint, typecheck, tests and production builds across all 35 packages.
- `pnpm package:release`: passed; all eight production artifacts were packaged.
- `pnpm qa:release-artifacts`: passed packaging and runtime smoke acceptance for all eight artifacts.
- `pnpm run test:release-gate`: passed.
- `git diff --check`: passed.

## Acceptance boundary

`KNO-001` is implemented but unaccepted. Browser accessibility/responsive acceptance and named Thai merchant usability acceptance remain external gates.
