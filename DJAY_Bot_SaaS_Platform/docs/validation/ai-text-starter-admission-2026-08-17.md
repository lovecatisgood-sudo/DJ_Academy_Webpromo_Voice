# AI Text Starter admission evidence — 2026-08-17

## Scope

`ATS-001`: AI Text Starter admits one non-archived Text bot in one tenant workspace and one administrator seat. Advanced remains governed by its separately versioned higher limits.

## Implemented authority

- The immutable market catalogue and resolved entitlement snapshot define Starter limits as `active_bots: 1`, `workspaces: 1`, and `seats: 1`.
- A live product subscription belongs to exactly one tenant, and the database permits only one non-cancelled subscription for a tenant/product pair.
- `AiChatStore.createAgent` verifies active Text/Sales entitlements, serializes creation, counts tenant Text bots and returns `limit_reached` at capacity.
- Migration `0131_ai_text_starter_admission.sql` independently serializes restricted-runtime inserts and reactivations, derives the bot ceiling from the latest active contract snapshot, and rejects direct limit bypasses.
- A claimed anonymous Builder configuration may create its single non-live predeployment Text draft before provisioning only when the matching tenant claim is still unmaterialized.
- Builder materialization now uses the same tenant/family advisory lock, preventing duplicate drafts under concurrent onboarding completion.
- Administrator invitations and acceptance share `administrator_seat_capacity`, the tenant seat lock, active memberships, pending invitations, contract snapshots, and approved seat add-ons.

## Verification

- `TEST_DB_PORT=55584 pnpm test:db`: passed 127 ordered migrations, restricted-runtime direct-insert rejection, anonymous Text/Voice claim materialization, administrator seat admission, RLS/cross-tenant checks, every wired PostgreSQL integration suite, and guarded legacy rollback.
- `pnpm --filter @djay/db test -- migration-invariants.test.ts`: 175 tests passed; database-backed tests skipped as expected without integration URLs.

## Acceptance boundary

`ATS-001` is implemented but unaccepted. Browser accessibility/responsive acceptance, live provider journeys, penetration testing, named Thai merchant acceptance, and authorized Product Owner acceptance remain open. Package `sellable` flags remain false.
