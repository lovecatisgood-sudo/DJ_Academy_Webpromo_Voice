# Production master plan PR-02 server-draft checkpoint

Date: 2026-08-17
Status: implemented and locally verified first slice; PR-02 remains in progress
Acceptance effect: none; no requirement is formally accepted and all packages remain non-sellable

## Implemented

- A signed Builder session now binds its issue time and expires after one fixed 30-day lifetime.
- AI Text and AI Voice share one 50-request anonymous test budget. Invalid payloads and unavailable providers do not consume it.
- Migration `0107_anonymous_builder_drafts.sql` adds pre-account sessions, one current optimistic draft and immutable revision snapshots. It preserves Owner analytics reservations `0102`–`0106`.
- `GET/PATCH /public/builder/draft` resolves authority only from the verified cookie. No browser-supplied draft ID is accepted.
- The approved `/build` experience hydrates and autosaves Flow, Text and Voice state through that API. Browser storage remains interrupted-save recovery, not ownership authority.
- Tenant runtime receives no Builder schema/table access. Expired or altered sessions and stale revisions fail closed.

## Evidence

| Check | Result |
| --- | --- |
| API unit suite | 87 passed |
| API and database TypeScript checks | Passed |
| Migration invariant suite | 121 passed after the new Builder invariant |
| `ANONYMOUS_BUILDER_ONLY=true TEST_DB_PORT=55477 pnpm test:db` | 103 migrations applied; 2/2 Builder integration tests passed |
| Static onboarding and Flow behavior guards | Passed |
| `pnpm verify` | Passed lint, typecheck, tests and production builds across all 35 packages; API build includes `/public/builder/draft` |
| `TEST_DB_PORT=55478 pnpm test:db` | Passed all 103 migrations, all wired PostgreSQL integration suites, RLS denials and guarded legacy rollback |
| `git diff --check` | Passed |

The browser-backed Flow command was not used as acceptance evidence. It attempted to start Chromium unexpectedly and was terminated by the sandbox before a page opened; no browser rerun is authorized in this checkpoint.

## Remaining PR-02 gates

- Idempotent persisted import jobs are completed in the follow-on `production-master-plan-pr02-import-jobs-2026-08-17.md` checkpoint.
- Complete EN/TH translation lifecycle and server-retrieved test knowledge/context.
- Maintained application-component extraction from the approved HTML source.
- Action-specific permission and passing desktop/mobile/keyboard/reduced-motion browser evidence.
- Account-at-deploy atomic claim, which belongs to PR-03.
