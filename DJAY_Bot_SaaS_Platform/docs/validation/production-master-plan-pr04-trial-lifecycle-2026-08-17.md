# PR-04 trial warning and terminal lifecycle evidence — 2026-08-17

## Scope

This checkpoint implements local server authority for trial warnings, exhaustion and expiry. It does not make a package sellable or represent browser, provider, Product Owner, legal, security or production acceptance.

## Implemented authority

- Migration `0115_trial_warning_and_terminal_states.sql` emits one auditable AI Text warning at 400 settled replies (100 remaining). Existing notification triggers create the in-product record and deduplicated owner-email outbox request.
- Text activation creates the owner notification profile only after resolving a verified active Master Admin email and sealing the recipient with the dedicated envelope key.
- Reserving the final allowed unit atomically exhausts the grant, cancels the trialing subscription and emits terminal alert/outbox evidence with `view_paid_plans`; the final reservation can settle, while later reservations fail closed.
- The worker-only expiry reconciler marks fixed-period grants expired, cancels trial authority and emits the same merchant action without reopening repeat-trial eligibility.
- The AI Text widget returns bilingual, provider-neutral unavailable copy directing the customer to contact the business; it exposes no provider, model, token or quota identifier.
- `GET /tenant/usage` exposes only the safe trial lifecycle state. The Usage page renders an explicit expired/exhausted notice and `View paid plans` action, while preserving the catalogue's non-sellable truth and preventing checkout claims for unavailable SKUs.

## Verification

- `FLOW_TRIAL_ONLY=true TEST_DB_PORT=55485 pnpm test:db` — all 111 migrations and all three Flow/Text trial cases passed, including warning email/in-product deduplication, worker expiry, final reservation settlement, post-exhaustion denial and repeated-trial denial.
- `FLOW_TRIAL_ONLY=true TEST_DB_PORT=55487 pnpm test:db` — the focused suite additionally verified safe `trialStatus: exhausted` merchant API evidence and effective `accessMode: none` after cancellation.
- `TEST_DB_PORT=55486 pnpm test:db` — the complete migration, PostgreSQL integration, RLS, cross-tenant denial, recovery and guarded rollback suite passed.
- `TEST_DB_PORT=55488 pnpm test:db` — the complete suite passed again after adding merchant-safe terminal status to the Usage API and suppressing stale active access for cancelled subscriptions.
- `pnpm --filter @djay/db typecheck` passed.
- `pnpm --filter @djay/ai-chat-widget test` — 3/3 passed; widget typecheck passed.
- `pnpm verify` passed lint, boundaries, registry/decision checks, typechecks, unit tests and all 35 package builds.
- `pnpm run test:release-gate` and `git diff --check` passed.

## Gates intentionally open

- Live email delivery and merchant paid-plan browser acceptance.
- Browser accessibility/responsive acceptance; no browser was opened.
- Unmocked Stripe/SCA and production-provider journeys, staging soak, penetration testing and external approvals.
- Requirements `TRL-006` and `TRL-007` remain `in_progress`; all packages remain non-sellable.
