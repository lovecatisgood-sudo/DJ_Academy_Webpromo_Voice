# Production master plan PR-02 translation-lifecycle checkpoint

Date: 2026-08-17

Status: implemented and locally verified slice; PR-02 remains in progress

Acceptance effect: none; no requirement is formally accepted and all packages remain non-sellable

## Implemented

- Text and Voice expose a dedicated side-by-side English/Thai translation section.
- Greetings, AI disclosures, the Voice opening disclosure and every FAQ question/answer persist inside the server-saved Text/Voice configuration.
- Each record tracks its English source, Thai value, reviewed flag and derived `missing`, `stale`, `needs_review` or `current` status.
- Editing English invalidates the prior review and marks an existing Thai value stale. Generated or manually edited Thai copy requires merchant review.
- Translation generation remains signed-session and exact-saved-revision-bound. Bulk generation includes only missing or stale source strings from the saved draft.
- Missing or stale required customer copy blocks publication. Complete but unreviewed translation and optional tests remain advisory.

## Evidence

| Check | Result |
| --- | --- |
| Translation transition/static contract guard | Passed |
| Builder inline-script syntax | Passed |
| Onboarding and Flow behavior guards | Passed |
| `pnpm verify` | Passed lint, typecheck, all tests and production builds across all 35 packages |
| `git diff --check` | Passed |

No browser-backed check is claimed. Translation coverage for fallback, handover, booking/contact prompts and generated role messages, maintained component extraction, account claim and responsive/accessibility acceptance remain open.
