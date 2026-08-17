# Document knowledge ingestion lifecycle evidence — 2026-08-17

## Scope

- `KNO-002`: admitted TXT, PDF and DOCX uploads, validation, malware scanning, extraction, attribution and visible status.

## Implemented controls

- Authenticated tenant upload initiation fails before persistence when storage authority is absent, then enforces knowledge entitlement, collection ownership, safe filenames, exact admitted MIME types and a 10 MB limit.
- Signed object uploads are short-lived; completion verifies object size and content type before the job becomes claimable.
- The restricted worker rechecks size and file signature, calls the configured malware scanner before extraction, and fails closed for malware or mismatched files.
- PDF extraction preserves page attribution in normalized content and every retrieval chunk. TXT and DOCX extraction preserve document attribution. Revision provenance pins the tenant source ID, media type, attribution kind, section count and extractor version.
- Immutable source revisions and chunks are completed only by the restricted worker. Migration `0126` qualifies `public.digest` while retaining the hardened security-definer search path; focused PostgreSQL execution found and proves this correction.
- Queued sources are immediately visible as processing. Terminal safe failure codes show actionable merchant copy; processing views refresh while work remains active.
- Tenant RLS prevents another merchant from listing the source or its state.

## Executable evidence

- `pnpm --filter @djay/workers test`: passed, 8 tests including signature, attribution, empty extraction and chunk-boundary cases.
- `pnpm --filter @djay/workers typecheck`: passed.
- `pnpm --filter @djay/db typecheck`: passed.
- `pnpm --filter @djay/tenant-web typecheck`: passed.
- `KNOWLEDGE_DOCUMENT_ONLY=true TEST_DB_PORT=55553 pnpm test:db`: passed 122 migrations plus processing, attributed completion, safe malware failure and cross-tenant denial.
- `TEST_DB_PORT=55554 pnpm test:db`: passed all 122 migrations, every wired PostgreSQL integration suite, RLS/cross-tenant denial and guarded legacy rollback.
- `pnpm verify`: passed lint, typecheck, tests and production builds across all 35 packages.
- `pnpm package:release`: passed after serializing the API build; all eight production artifacts were packaged.
- `pnpm qa:release-artifacts`: passed packaging and runtime smoke acceptance for all eight artifacts.
- `pnpm run test:release-gate`: passed.
- `git diff --check`: passed.

## Acceptance boundary

`KNO-002` is implemented but unaccepted. Unmocked production object storage and malware-scanner journeys, browser accessibility/responsive acceptance and named Thai merchant usability acceptance remain external gates.
