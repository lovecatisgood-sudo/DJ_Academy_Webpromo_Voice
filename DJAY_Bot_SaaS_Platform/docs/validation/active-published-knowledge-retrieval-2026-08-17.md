# Active published knowledge retrieval evidence — 2026-08-17

## Scope

- `KNO-004`: normalized, chunked, immutable versioned knowledge with production retrieval restricted to active published revisions.

## Implemented controls

- Ingestion and manual authoring create immutable source revisions and hashed, ordered chunks. Published knowledge authority is the immutable pin between a published AI playbook version and a ready source revision.
- Draft updates admit only tenant-owned ready revisions whose source remains active. Publication revalidates the same authority inside the transaction so an archived or changed source cannot pass through a stale draft.
- Migration `0128` adds a database trigger that rejects every pin unless the playbook is published, the revision is ready and its source is active. This protects all writers, not only the current API repository.
- Both live Text retrieval functions—website and deferred social—join the pinned revision and source and return chunks only while those states remain ready/active. Archiving a source immediately removes it from future live retrieval without mutating historical playbook evidence.
- Test Center may preview an unpublished draft, but it also excludes inactive or non-ready sources and has no authority over live deployment traffic.

## Executable evidence

- Database unit tests and migration invariants pass.
- Database, API and worker typechecks pass.
- `KNOWLEDGE_RETRIEVAL_ONLY=true TEST_DB_PORT=55563 pnpm test:db`: passes all 124 migrations and proves publish-time rejection, trigger rejection, active website retrieval, immediate exclusion after archive, Test Center exclusion and installed website/social runtime filters.
- `TEST_DB_PORT=55564 pnpm test:db`: passes all 124 migrations, every wired PostgreSQL integration suite, RLS/cross-tenant denials and guarded legacy rollback.
- `pnpm verify`: passes lint, typecheck, tests and production builds across all 35 packages.
- `pnpm run test:release-gate`: passes the executable release-gate contract.
- `pnpm package:release` and `pnpm qa:release-artifacts`: package and runtime-smoke all eight release artifacts, including fail-closed production configuration.

## Acceptance boundary

`KNO-004` is implemented but unaccepted. Live provider grounding quality, browser accessibility/responsive acceptance, penetration testing and named Thai merchant acceptance remain external gates.
