# PR-07/PR-08 claimed AI configuration materialization — 2026-08-17

## Scope

This checkpoint creates honest pre-deployment Text and Voice configuration resources from complete tenant-claimed Builder drafts. It does not publish, install, activate access or start traffic.

## Implemented authority

- Migration `0123_predeployment_ai_configurations.sql` labels every AI agent `text` or `voice`, backfills deployed Voice agents, and links each Builder claim to at most one same-tenant AI agent.
- One-time onboarding converts complete Text/Voice Builder state into exactly one draft agent and one unpublished playbook draft.
- Role, business profile, behavior, boundaries, FAQ, disclosure, Voice disclosure and bilingual greeting context are preserved.
- Agent objective, conversation behavior, human-handover boundaries and bilingual FAQs are promoted into typed playbook authority and exposed in the shared authenticated Text/Voice guided editor.
- The shared Text/Voice AI turn runtime selects query-relevant approved FAQs in the active locale as grounding without inventing a knowledge citation or forcing an unnecessary low-confidence handover.
- Required Thai greeting, disclosure and FAQ copy may be complete but unreviewed; missing or stale copy fails with immutable audit evidence.
- Existing same-family agents are never overwritten. Voice materialization creates zero deployment rows, keys, origins or traffic state.
- Authenticated `/workspace/voice/configuration` lists and reopens the preserved agent draft before deployment, including for an inactive subscription in honest read-only mode.
- Active Voice authority permits optimistic draft saving and immutable publication. Exact-origin installation then reuses that published agent/version and creates traffic as inactive without duplicating configuration resources.
- Authenticated AI Text Configuration lists the claimed draft without active access, keeps every mutation control read-only, and provides Dashboard and package/usage continuations; server mutation authority still fails closed.

## Verification

- Sales Core: 9 tests passed, including complete bilingual Voice conversion, FAQ selection and stale-copy rejection.
- AI Text runtime: 14 tests passed, including operational behavior instructions, matched bilingual FAQ grounding and rejection of unrelated approved claims as confidence evidence.
- Database unit suite: 172 passed, 75 skipped without integration credentials; 137 migration invariants passed.
- `TEST_DB_PORT=55524 pnpm test:db`: all 119 migrations and every wired PostgreSQL integration, RLS, recovery and guarded rollback suite passed after enforcing bilingual FAQ materialization and operational behavior preservation.
- The materialization integration proves Text and Voice independently create one agent, one draft, zero versions, zero Voice deployments and one audit across repeated onboarding, with identical persisted behavior and bilingual FAQ authority.
- The Voice deployment integration proves claimed configuration discovery, cross-tenant denial, revision-safe editing, immutable publication and deployment reuse with one agent, one draft and one version.
- The claimed Text integration proves the pending subscription exposes one reviewable draft while authoring capabilities remain absent and a direct draft mutation is denied.
- Repository-wide `pnpm verify`, `pnpm run test:release-gate` and `git diff --check` passed after the final runtime and editor changes.
- No browser or GUI was opened.

## Gates intentionally open

- Permissioned browser and responsive/accessibility acceptance of the authenticated continuation, publication, website deployment, verification and explicit activation journeys.
- Real provider/media and named-merchant acceptance.
- `ONB-006` and `ONB-008` remain `in_progress`; zero requirements are accepted and all six packages remain non-sellable.
