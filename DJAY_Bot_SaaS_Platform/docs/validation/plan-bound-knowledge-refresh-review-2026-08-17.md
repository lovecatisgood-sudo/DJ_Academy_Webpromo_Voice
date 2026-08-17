# Plan-bound knowledge refresh and review evidence — 2026-08-17

## Scope

- `KNO-006`: weekly AI Text Starter website refresh and monthly AI Text Advanced knowledge review with visible status and actionable failures.

## Implemented controls

- Website refresh cadence is server-derived from current package authority. Starter is fixed at 168 hours; Advanced cannot silently inherit a Starter or merchant-selected automatic interval.
- The restricted worker reconciles existing active URL sources on every scheduler pass, queues due Starter refreshes idempotently and stops automatic refresh after an Advanced upgrade.
- Advanced receives one tenant-scoped review cycle per eligible calendar month after its first 30 days. Database uniqueness and worker authority prevent duplicate cycles.
- Owner/Admin assignment, due/in-progress/completed states, timestamps and the required completion note form durable review evidence. Completed cycles cannot be reopened or silently rewritten.
- The Knowledge workspace shows Starter next-refresh timing, Advanced review status, source/change/attention counts, safe source failures, review ownership and start/complete actions.
- Review-owner discovery uses the existing restricted team projection; tenant runtime receives no direct identity-schema access.

## Executable evidence

- Database, API, worker and tenant-web typechecks pass.
- `KNOWLEDGE_CRAWL_ONLY=true TEST_DB_PORT=55572 pnpm test:db` passes all 125 migrations and proves fixed weekly reconciliation, due-job idempotency, upgrade cancellation, monthly-cycle idempotency, owner assignment, audited completion, terminal completed state and database rejection of completed-evidence rewrites.
- `TEST_DB_PORT=55575 pnpm test:db` passes the complete PostgreSQL integration suite, including all 125 migrations, RLS and cross-tenant denial checks, KNO-006 scenarios, provider workflows and the restartable legacy migration/rollback rehearsal.
- `pnpm verify` passes repository lint, boundaries, registry checks, typechecks, tests and all 35 package/application production builds.
- `pnpm run test:release-gate`, `pnpm package:release` and `pnpm qa:release-artifacts` pass. All eight production artifacts satisfy packaging, security-header, runtime smoke and fail-closed configuration checks.

## Acceptance boundary

`KNO-006` is implemented but unaccepted. Browser accessibility/responsive acceptance, live scheduler/provider execution, penetration testing and named Thai merchant acceptance remain open.
