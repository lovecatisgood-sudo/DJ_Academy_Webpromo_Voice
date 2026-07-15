# FlowBot V1.1 Bundle Validation Report

**Validated:** July 13, 2026  
**Purpose:** record what was checked before this bundle was packaged for Codex.

## Passed checks

- All expected original planning areas are represented: product scope, SaaS roadmap, Codex handoff, UI, architecture, schema, API, security/privacy, QA, DevOps, ADRs, integration contract, and clickable mockup.
- Removed the duplicate outer/nested planning archives; this bundle has one source of truth.
- Markdown code fences are balanced in every Markdown file.
- The authoritative PostgreSQL DDL parses successfully with `pglast` as 49 SQL statements.
- Every tenant-owned table in the DDL includes `tenant_id`.
- The schema includes same-tenant and same-flow-version composite relationships for runtime-critical references.
- The HTML prototype parses with an HTML parser.
- The embedded prototype JavaScript passes `node --check` syntax validation.
- No active contract uses the removed public `/lead` endpoint.
- No active contract uses a raw visitor session token in a URL.
- API bigint message cursors are serialized as decimal strings rather than unsafe JSON numbers.
- The documents consistently include immutable conversation version pinning, lock-before-idempotency-check, atomic lead creation, idempotent admin replies, durable SSE replay, buffered backlog/live handoff, bot-state takeover discovery, notification outbox, suggest-and-confirm customer matching, and full PII erasure.
- The supported stack is consistently Node.js 24 LTS with an exact tested Next.js 16.x release to be pinned by the implementation lockfile.

## Deliberately not claimed

- The Markdown DDL is a design source, not an executed production migration. Codex must convert it to reviewed Drizzle migrations and run them against a disposable Postgres 16/Neon test database.
- The clickable HTML mockup is illustrative. Full browser behavioral, accessibility, and responsive E2E testing belongs to the implemented application.
- Hostinger reverse-proxy behavior for long-lived SSE must be tested in the target hosting environment before production release.
- The privacy document is an engineering checklist, not legal advice. The live business notice, lawful basis, retention, and incident procedures require business/legal review.

## Required Codex verification

Codex must not treat this report as a substitute for implementation tests. Follow `09-TESTING-QA-PLAN.md`, especially two-tenant isolation, concurrent idempotency, version continuity, backlog/live SSE boundary, erasure coverage, migration verification, and rollback.
