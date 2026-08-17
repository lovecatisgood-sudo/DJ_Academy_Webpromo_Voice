# AI Text business knowledge-base evidence — 2026-08-17

## Scope

`ATS-003`: provide one Starter business knowledge base containing approved website content, FAQs, PDF, DOCX, TXT, and product/service information.

## Implemented authority

- The versioned Starter contract grants `knowledge.enabled` and limits the tenant to one active knowledge collection.
- `TenantKnowledgeIngestionStore` serializes collection creation, derives the limit from current AI Text/Voice entitlement snapshots, and returns safe entitlement/limit outcomes.
- Migration `0132_knowledge_collection_admission.sql` independently enforces restricted-runtime inserts and reactivations against the latest active contracts, including a shared unlimited boundary when an entitled plan expressly grants it.
- Pasted text supports FAQs, policies, and product/service facts. Governed HTTPS crawling enforces authorization, SSRF/DNS/robots/content-type/size/scope controls, with one-page weekly refresh for Starter.
- Upload admission accepts only PDF, DOCX, and UTF-8 TXT up to 10 MB. The worker validates signature, observed size, malware result, and exact parser path before creating attributed immutable revisions and chunks.
- Starter product/service details remain supported through the business profile and approved sources; the structured versioned catalogue is correctly restricted to Advanced.
- Only active, ready revisions pinned to the published playbook participate in runtime retrieval. Exclusion and deletion remove future-answer authority immediately.

## Verification

- `TEST_DB_PORT=55585 pnpm test:db`: passed 128 ordered migrations, restricted-role collection bypass rejection, document lifecycle, governed crawling, structured catalogue, active retrieval, cleanup, RLS/cross-tenant checks, and guarded rollback.
- `pnpm --filter @djay/db test -- migration-invariants.test.ts`: 176 tests passed; database tests skipped without integration URLs as expected.
- Existing repository verification and packaged artifact QA remain green from the preceding shipped checkpoint; the current change is database/test/documentation scoped.

## Acceptance boundary

`ATS-003` is implemented but unaccepted. Unmocked object storage, malware scanner, PDF/DOCX provider fixture journeys, live vector deletion/retrieval, browser accessibility/responsive acceptance, penetration testing, named Thai merchant acceptance, and Product Owner acceptance remain open. Packages remain non-sellable.
