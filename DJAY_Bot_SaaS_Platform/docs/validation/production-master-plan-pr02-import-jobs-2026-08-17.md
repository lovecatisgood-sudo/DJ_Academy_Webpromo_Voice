# Production master plan PR-02 website-import checkpoint

Date: 2026-08-17
Status: implemented and locally verified slice; PR-02 remains in progress
Acceptance effect: none; no requirement is formally accepted and all packages remain non-sellable

## Implemented

- Migration `0108_anonymous_builder_import_jobs.sql` persists revision-bound, idempotent website-import jobs and immutable attempt evidence.
- Create, inspect, run/retry and cancel APIs derive session and draft authority from the signed Builder cookie; callers cannot substitute another draft.
- Jobs retain normalized source provenance, page count, customer-safe warnings and a deterministic profile digest without storing raw crawled HTML.
- The existing HTTPS-only crawler retains DNS/address SSRF denial, same-host redirect policy, content-type and response-size allowlists, timeouts and a seven-page ceiling.
- A changed draft makes the job stale. Cancellation and generation checks prevent a late result from overwriting the current draft. Retries stop after three reviewed generations.
- The `/build` flow persists the job/idempotency identity, supports cancellation and retry, and discards a stale identity before retrying against the latest saved revision.

## Evidence

| Check | Result |
| --- | --- |
| Focused disposable PostgreSQL gate | 104 migrations; 5/5 Builder draft/import tests passed |
| API unit suite | 90 passed, including create schema and safe failure vocabulary |
| API/database TypeScript checks | Passed |
| Static onboarding guard | Passed |
| `pnpm verify` | Passed lint, boundaries, typecheck, tests and production builds across all 35 packages; the API build includes all four website-import lifecycle routes |
| `TEST_DB_PORT=55480 pnpm test:db` | Passed all 104 migrations, every wired PostgreSQL integration suite, RLS/cross-tenant denials, recovery/reconciliation and guarded legacy rollback |
| `git diff --check` | Passed |

No browser-backed check is claimed: browser/GUI work remains permission-gated.

## Remaining PR-02 gates

- Complete EN/TH translation lifecycle and server-retrieved test knowledge/context.
- Maintained application-component extraction from the approved HTML source.
- Action-specific permission and passing desktop/mobile/keyboard/reduced-motion browser evidence.
- Account-at-deploy atomic claim, sequenced in PR-03.
