# Knowledge source lifecycle evidence — 2026-08-17

## Scope

- `KNO-005`: source preview, exclusion, correction, reprocessing, deletion and full reindexing.

## Implemented controls

- Tenant readers can preview the latest immutable revision, attribution metadata, chunk count and bounded content through `GET /tenant/knowledge/:sourceId`.
- Tenant writers can exclude or reinclude a source. Exclusion changes source authority immediately, so KNO-004 runtime filters remove it from future answers without rewriting published history.
- Merchant corrections create a new ready revision and deterministic chunks. Drafts already using that source move to the new revision and must still be explicitly published before live traffic changes.
- File and website sources support idempotent queued reprocessing of the admitted original object or governed URL. Manual and processed sources support full deterministic reindexing into a new immutable revision.
- Logical deletion marks the source erased, removes it from every affected draft, terminates queued work and marks stored objects for governed deletion. Historical immutable revisions remain audit evidence pending the separate provider/vector cleanup and retention authority in `KNO-008`.
- Every read and mutation is tenant-scoped, role-authorized and mutation-origin protected. Entitlement is revalidated before inclusion, correction, reprocessing or reindexing.

## Executable evidence

- Database, API and tenant-web typechecks pass.
- `KNOWLEDGE_DOCUMENT_ONLY=true TEST_DB_PORT=55569 pnpm test:db` passes all 124 migrations and proves preview, serialized immutable correction without implicit reinclusion, exclusion/reinclusion, reindexing and reprocessing while safely excluded, deletion, retained revision audit and cross-tenant denial.
- `TEST_DB_PORT=55567 pnpm test:db` passes all 124 migrations, every wired PostgreSQL integration suite, RLS/cross-tenant denials and guarded legacy rollback.
- `pnpm verify` passes lint, typecheck, tests and production builds across all 35 packages; mutation-origin coverage includes all 142 handlers.
- `pnpm run test:release-gate`, `pnpm package:release` and `pnpm qa:release-artifacts` pass; all eight production artifacts satisfy packaging and runtime smoke acceptance, including fail-closed production configuration.

## Acceptance boundary

`KNO-005` is implemented but unaccepted. Browser accessibility/responsive acceptance, live object-storage deletion, provider/vector cleanup under `KNO-008`, penetration testing and named Thai merchant acceptance remain open.
