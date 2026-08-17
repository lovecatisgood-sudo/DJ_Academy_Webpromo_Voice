# Production master plan PR-02 saved-context checkpoint

Date: 2026-08-17
Status: implemented and locally verified slice; PR-02 remains in progress
Acceptance effect: none; no requirement is formally accepted and all packages remain non-sellable

## Implemented

- AI Text and Voice anonymous tests accept the customer message/language and bounded recent conversation, but retrieve role, business knowledge, FAQ and behavior from the exact signed-session draft revision.
- Missing or changed revisions fail closed before provider quota is consumed. Browser-supplied role and business knowledge are no longer accepted by either provider-test contract.
- Text and Voice retain one shared maximum of 50 provider test requests per signed 30-day Builder session.
- Translation calls use signed-session rate limiting, require the exact saved draft revision and reject any source string not present in that revision.
- All Builder Text/Voice evidence and configuration copy now states the approved hard maximum of 200 locale-aware words.

## Evidence

| Check | Result |
| --- | --- |
| API typecheck | Passed |
| API unit suite | 93 passed, including saved draft/published context and exact-string indexing |
| Static onboarding and architecture-boundary guards | Passed |
| `pnpm verify` | Passed lint, typecheck, all tests and production builds across all 35 packages |
| `git diff --check` | Passed |

No browser-backed check is claimed. Complete EN/TH lifecycle state for every Text/Voice field, maintained component extraction and permission-gated responsive/accessibility acceptance remain open.
