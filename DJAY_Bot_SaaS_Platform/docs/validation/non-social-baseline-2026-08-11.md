# Non-social production baseline: 2026-08-11

## Scope

This checkpoint covers the existing SaaS implementation plus the website-first onboarding correction. Social implementations remain disabled and outside the release target. All six packages remain `sellable: false`.

## Worktree reconciliation

- The SaaS worktree contained 70 modified or untracked paths at the checkpoint.
- Existing changes were preserved. No reset, checkout, bulk revert, or deletion was used.
- Active paths group into onboarding and support, public information pages, tenant operations, Flow Bot, AI Text, Voice, Platform Master, database migrations, validation, and planning documents.
- Protected reference `../FlowBot_V1_App/` was not modified.

## Environment

- Node.js: `v24.18.1`
- pnpm: `11.12.0`
- Database integration image: `postgres:16-alpine`
- Database test port: `55434` because another workspace already owned the default `55432`

## Commands and results

| Command | Result |
| --- | --- |
| `pnpm verify` | Passed lint, boundaries, strict TypeScript, unit tests, market-release registry checks, and production builds for 35 packages |
| `TEST_DB_PORT=55434 pnpm test:db` | Passed all 90 migrations, forced RLS checks, same-tenant references, owner invariants, repository integrations, bot runtimes, billing, privacy, resilience, and migration rehearsal |
| Focused DB unit tests | 143 passed, 56 integration tests correctly skipped without database environment |
| Relevant DB, API, and tenant-web typechecks | Passed |
| `git diff --check` | Passed |

The ordinary unit command's skipped database tests are not used as release evidence. The separate `test:db` result is the non-skipping database authority.

## Onboarding correction proven

- The merchant selects `flowbot`, `ai_chat`, or `voice` as the first website bot.
- The browser cannot select a launch channel; the repository writes `website` under server authority.
- A preference does not create access. Product subscriptions and entitlement snapshots remain authoritative.
- Tenant A can save AI Text as its first bot while Tenant B remains unchanged.
- Current Test Center and support guidance no longer call or advertise social setup.

## Release status

The requirement registry currently contains 9 `implemented`, 11 `in_progress`, 276 `planned`, and 1 `blocked` requirement. Zero requirements are accepted. This checkpoint is engineering evidence only and does not authorize package sellability.

## External and policy boundaries

- Browser-based visual, responsive, keyboard, and axe verification was not run because the workspace requires explicit action-specific browser authorization.
- Live Stripe, provider, microphone, GCP, counsel, tax, penetration-test, and named-merchant evidence remains external to this local baseline.
