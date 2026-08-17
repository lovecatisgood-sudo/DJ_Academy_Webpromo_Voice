# PR-02/PR-07/PR-08 operational-message fidelity — 2026-08-17

Status: implemented and locally verified slice; requirements remain `in_progress`

Acceptance effect: none; zero requirements are formally accepted and all six packages remain non-sellable

## Implemented

- The anonymous Text/Voice Builder exposes editable English fallback, pending handover, contact, appointment-request, role-opening and outside-hours messages.
- Every fixed message participates in the same durable English/Thai missing, stale, review and publication-blocking lifecycle as greetings, disclosures and FAQs.
- Account claim validates current Thai copy when Thai is enabled and materializes exact bilingual strings into typed production playbook authority without publishing, deploying or enabling traffic.
- The authenticated Text/Voice playbook editor exposes every materialized message without Advanced JSON.
- Runtime policy receives the approved locale strings and prohibits treating a pending handover or appointment request as success.
- Builder provider-format failure returns the configured merchant fallback. Existing immutable playbooks receive conservative schema defaults.

## Verification

- Sales Core: 9 tests passed.
- AI Text runtime: 14 tests passed, including exact configured fallback behavior.
- Builder translation and authenticated editor static contracts passed.
- Full typecheck passed across 35 packages.
- `TEST_DB_PORT=55531 pnpm test:db` passed all 120 migrations and every wired PostgreSQL integration, RLS, recovery and guarded rollback suite.
- Claim integration proved exact operational-message persistence for Text and Voice with one draft, zero versions and zero Voice deployments.
- No browser or GUI was opened.

## Open gates

- Production component extraction and permissioned responsive/accessibility browser acceptance.
- Unmocked AI/Voice provider and named-merchant human quality acceptance.
- Requirements stay `in_progress`; package sellability stays false.
