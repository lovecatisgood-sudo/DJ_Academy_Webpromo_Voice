# PR-07/PR-08 claimed AI configuration materialization — 2026-08-17

## Scope

This checkpoint creates honest pre-deployment Text and Voice configuration resources from complete tenant-claimed Builder drafts. It does not publish, install, activate access or start traffic.

## Implemented authority

- Migration `0123_predeployment_ai_configurations.sql` labels every AI agent `text` or `voice`, backfills deployed Voice agents, and links each Builder claim to at most one same-tenant AI agent.
- One-time onboarding converts complete Text/Voice Builder state into exactly one draft agent and one unpublished playbook draft.
- Role, business profile, behavior, boundaries, FAQ, disclosure, Voice disclosure and bilingual greeting context are preserved.
- Required Thai copy may be complete but unreviewed; missing or stale copy fails with immutable audit evidence.
- Existing same-family agents are never overwritten. Voice materialization creates zero deployment rows, keys, origins or traffic state.

## Verification

- Sales Core: 8 tests passed, including complete bilingual Voice conversion and stale-copy rejection.
- Database unit suite: 172 passed, 75 skipped without integration credentials; 137 migration invariants passed.
- `TEST_DB_PORT=55515 pnpm test:db`: all 119 migrations and every wired PostgreSQL integration, RLS, recovery and guarded rollback suite passed.
- The materialization integration proves Text and Voice independently create one agent, one draft, zero versions, zero Voice deployments and one audit across repeated onboarding.
- No browser or GUI was opened.

## Gates intentionally open

- Authenticated Text/Voice Configuration UI continuation from the materialized draft.
- Publication, website deployment creation, verification and explicit activation.
- Real provider/media, browser, responsive/accessibility and named-merchant acceptance.
- `ONB-006` and `ONB-008` remain `in_progress`; zero requirements are accepted and all six packages remain non-sellable.
