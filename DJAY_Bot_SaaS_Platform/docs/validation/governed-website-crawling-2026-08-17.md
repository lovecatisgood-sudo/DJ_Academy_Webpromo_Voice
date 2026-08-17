# Governed website crawling evidence — 2026-08-17

## Scope

- `KNO-003`: Starter explicit-page import and Advanced bounded multi-page crawling with authorization, access policy, scope, pacing, canonical URLs and visible status.

## Implemented controls

- `POST /tenant/knowledge/crawls` requires tenant write authority, trusted origin, an explicit merchant authorization confirmation and a clean HTTPS URL.
- PostgreSQL derives crawl authority from the active AI Text plan. Starter persists a one-page limit; Advanced persists a maximum of 25 pages. Browser input cannot raise this limit.
- Every worker claim revalidates current active AI Text access. An Advanced source is clamped to one page after downgrade, and a source without active access is not claimable.
- Discovery remains on the submitted origin and path subtree. Query/fragment variants canonicalize, canonical hints outside scope are excluded, and duplicate canonical pages are not indexed twice.
- Every outbound request resolves DNS first, rejects any private/link-local/metadata/non-public address and pins the admitted address into the TLS request. Redirects, credentials, custom ports, oversized bodies and non-text content fail closed. A crawl is additionally capped at depth three, 60 seconds and 1.8 MB of extracted text.
- The crawler reads `robots.txt`, honors the specific DJay Bots or wildcard group, longest allow/disallow rule and a bounded crawl delay. PostgreSQL serializes host reservations across worker replicas at 500–5,000 ms.
- Accessible pages survive later-page failures. Provenance records canonical page URL, ETag, Last-Modified and safe exclusions; normalized content and every chunk carry the source URL.
- Queued, processing, ready and safe failed states use the merchant-visible knowledge source lifecycle.

## Executable evidence

- `pnpm --filter @djay/workers test`: passed 12 tests, including canonicalization, robots precedence, Starter exact-page behavior, Advanced scope/exclusion, depth/content bounds and attributed output.
- Worker, database, API and tenant-web typechecks passed.
- `KNOWLEDGE_CRAWL_ONLY=true TEST_DB_PORT=55560 pnpm test:db`: passed all 123 migrations plus plan-derived 1/25-page authority, downgrade clamping and bounded distributed host pacing.
- `TEST_DB_PORT=55558 pnpm test:db`: passed all 123 migrations, every wired PostgreSQL integration suite, RLS/cross-tenant denials and guarded legacy rollback.
- `pnpm verify`: passed lint, typecheck, tests and production builds across all 35 packages.
- `pnpm run test:release-gate`: passed.
- `pnpm package:release`: packaged all eight production artifacts, including 123 worker migrations.
- `pnpm qa:release-artifacts`: passed liveness, security-header, asset, proxy, fail-closed authority and runtime smoke acceptance for all eight artifacts.

## Acceptance boundary

`KNO-003` is implemented but unaccepted. Live crawling across representative authorized Thai and English merchant sites, browser accessibility/responsive acceptance, penetration testing and named merchant usability acceptance remain external gates.
