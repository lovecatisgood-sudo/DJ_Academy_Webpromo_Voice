# Structured knowledge catalogue lifecycle evidence — 2026-08-17

## Scope and release truth

This checkpoint implements, but does not formally accept, `KNO-007` and completes the catalogue portion of `AIT-002`. It does not make either package sellable and does not claim browser, live-provider, Product Owner or named-merchant acceptance.

AI Text Starter continues to use approved business-profile product/service information. AI Text Advanced now has an explicitly entitled structured catalogue with stable item identity, immutable versions, Thai/English names and descriptions, category, exact or display-only price, availability, options, typed customer-action reference and bounded attributes.

Saving creates a draft version only. Publishing separately selects that immutable version and rebuilds the structured knowledge source from published items only. Editing a published item leaves its prior version live until republished. Archiving removes the item from future catalogue revisions without deleting history.

Collection-to-agent mapping is explicit. Catalogue publication replaces the mapped agents' draft pins with the new source revision; it never publishes an AI playbook, installs a widget or changes live traffic. Starter tenants and cross-tenant identities are denied server-side.

The authenticated Knowledge page exposes create/edit, lifecycle status, publish/archive, agent mapping and atomic CSV draft import (maximum 200 unique stable references). CSV and API contracts reject partial price/action authority, malformed typed fields and extra instruction-shaped properties.

## Automated evidence

- Migration `0125_structured_knowledge_catalogue_lifecycle.sql`: immutable item versions, publication pointers, agent bindings, composite tenant/item foreign keys, forced RLS and least-privilege grants.
- `packages/db/src/knowledge-catalogue-lifecycle.integration.test.ts`: Starter denial, Advanced authoring, version immutability, draft/published separation, mapped-agent pin replacement, archive removal and tenant isolation.
- `packages/ai-chat-runtime/src/index.test.ts`: query-relevant published catalogue JSON reaches provider policy as untrusted, cited evidence and supports the customer response.
- `apps/api/lib/structured-catalogue.test.ts`: strict bilingual item and price/action validation.
- `apps/tenant-web/lib/structured-catalogue-csv.test.ts`: quoted bilingual CSV parsing and rejection paths.

## Verification

- `TEST_DB_PORT=55550 pnpm test:db` passed all 121 migrations, every wired PostgreSQL integration suite, RLS/cross-tenant denial and guarded legacy rollback after the complete mapping implementation.
- `pnpm verify` passed policy checks, lint, typecheck, tests and production builds for all 35 packages.
- `pnpm package:release` and `pnpm qa:release-artifacts` packaged and runtime-smoked all eight production artifacts.
- `pnpm run test:release-gate` passed the non-skipping production-phase contract.
- The registry remains honest at 337 requirements, zero formally accepted and six non-sellable packages.
- No browser or GUI was used. Browser accessibility/responsive acceptance remains an external-authority gate.
