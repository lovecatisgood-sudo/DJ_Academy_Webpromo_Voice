# AI Text safe fallback evidence — 2026-08-17

## Scope

This evidence closes implementation of `AIT-004`; it does not record Product Owner acceptance or make any package sellable.

The deployed AI Text runtime now retries invalid `sales-core.v1` output and, when the result remains unusable, atomically commits the merchant-approved locale fallback. The committed turn has intent `safe_fallback.<failure-code>`, contains no facts, citations, quick replies, public actions, proposed actions, or handover claim, and exposes no provider/model detail.

The normal commit boundary makes the fallback a durable transcript message and idempotent replay, settles exactly one commercial `ai_response`, and records measurable native units from both malformed attempts. If fallback persistence fails, the reserved turn is released and the public API retains its generic failure behavior.

## Automated evidence

- `packages/ai-chat-runtime/src/index.test.ts`: schema/citation and provider-failure fallback, provider-neutral public response, retained native usage, and commit-failure release.
- `packages/db/src/ai-chat-runtime-store.integration.test.ts`: two malformed attempts, exact merchant fallback, replay without another provider call, completed structured turn, one commercial settlement, and aggregate native usage.
- `TEST_DB_PORT=55533 pnpm test:db`: all 120 migrations, RLS and every wired PostgreSQL integration suite passed.
- `pnpm verify`, `pnpm run test:release-gate`, registry validation, and diff checks are release gates for this evidence set.

No browser or GUI was used.
