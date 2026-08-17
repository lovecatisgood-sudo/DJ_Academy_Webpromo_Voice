# Knowledge source cleanup evidence — 2026-08-17

## Scope

- `KNO-008`: removal from future retrieval and governed object/vector cleanup within the stated retention maximum.

## Implemented controls

- Every database writer that transitions a source to `erased` triggers one tenant-scoped cleanup job. Missing retention authority aborts deletion.
- Cleanup is available immediately; `purge_by` is derived from `retention_policies.knowledge_days` and is a maximum deadline, not a waiting period.
- Restricted worker claims are concurrency-safe, stale-lock recoverable and bounded to ten attempts.
- Every private object key and distinct vector reference must be deleted before local chunks and revision content are purged.
- External retries are idempotent. Missing vector-gateway configuration fails closed whenever vector references exist.
- Completion replaces retained content with a non-sensitive tombstone and records immutable object/vector counts and completion time.
- The merchant receives immediate retrieval-removal confirmation and the cleanup deadline.

## Executable evidence

- Database, worker and tenant-web typechecks pass.
- `pnpm --filter @djay/workers exec vitest run src/knowledge-ingestion.test.ts` passes nine tests, including external-before-local ordering and retry preservation.
- `KNOWLEDGE_DOCUMENT_ONLY=true TEST_DB_PORT=55578 pnpm test:db` passes all 126 migrations and proves tenant isolation, immediate queueing, the 730-day maximum, object/vector claims, local purge, tombstones and immutable completion evidence.
- `TEST_DB_PORT=55582 pnpm test:db` passes the complete PostgreSQL suite against the final migration, including every integration workflow, RLS/cross-tenant denial and guarded legacy rollback.
- `pnpm verify` passes repository lint, boundaries, registry checks, typechecks, tests and all 35 package/application production builds.
- `pnpm run test:release-gate`, `pnpm package:release` and `pnpm qa:release-artifacts` pass; all eight production artifacts satisfy packaging, security-header, runtime-smoke and fail-closed configuration checks.

## Acceptance boundary

`KNO-008` is implemented but unaccepted. The selected production object/vector provider, encryption/deletion exercise, security review, browser accessibility/responsive acceptance and named Thai merchant acceptance remain open under `KNO-DEC-001`.
