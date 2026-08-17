# PR-06 claimed Builder Flow materialization evidence — 2026-08-17

## Scope

This checkpoint preserves a valid anonymous Flow Builder graph as an editable tenant draft during the account's server-authoritative one-time onboarding. It does not publish, install, activate a trial or start traffic.

## Implemented authority

- Migration `0122_builder_flow_materialization.sql` records a tenant-scoped, one-time link from the claimed Builder draft to its materialized Flow bot.
- The deterministic converter preserves supported bilingual graph content and stable relationships while rejecting duplicate IDs, dangling paths and incomplete interactive nodes.
- Onboarding creates exactly one non-archived bot and one draft, remains idempotent on replay, and never overwrites an existing tenant Flow bot.
- Invalid graphs remain durably claimed and produce failed audit evidence instead of a false successful import.
- Builder cards become ordinary messages with the explicit `card_materialized_as_message` warning because the anonymous card schema has no production product-card payload.

## Verification

- `@djay/flowbot-migration`: 5 tests passed, including deterministic conversion and invalid-edge rejection.
- Database unit suite: 171 passed, 74 skipped without integration credentials; 136 migration invariants passed.
- `TEST_DB_PORT=55511 pnpm test:db`: all 118 migrations and every wired PostgreSQL integration, RLS, recovery and guarded rollback suite passed.
- Materialization integration proves one bot, one draft, zero published versions and one audit across repeated onboarding.
- No browser or GUI was opened.

## Gates intentionally open

- Text and Voice claim materialization.
- Existing-account trial subscription/entitlement provisioning.
- All six approved Flow templates, real website/browser acceptance and named-merchant acceptance.
- `ONB-004` remains `in_progress`; zero requirements are accepted and all six packages remain non-sellable.
