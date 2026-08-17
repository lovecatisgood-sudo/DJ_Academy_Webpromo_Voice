# AI Text runtime security and action-integrity evidence — 2026-08-17

## Scope

This evidence closes implementation of `AIT-006` and `AIT-008`; it does not record Product Owner acceptance, penetration-test acceptance, live-provider acceptance, or make a package sellable.

Active-session retrieval is resolved inside the database from the deployment, session, tenant, immutable playbook and pinned knowledge revisions. Every join carries tenant identity and runtime access is restricted. The application removes document chunks containing recognized English/Thai prompt-control patterns before policy construction, serializes remaining evidence as explicitly untrusted JSON data, and validates citations against only those admitted chunks.

Provider and runtime boundaries reject routing identity, private-key material, common API/token/JWT/credential assignments and database URLs anywhere in the structured result. Proposed tools are limited by a strict union, cross-field rules, current entitlement authority and a second database allowlist/entitlement check. No model output directly performs an effect.

Customer text that claims an appointment, order, payment, transfer, message or external update succeeded without a verified result receives one structure-preserving pending/request rewrite. A non-preserving or still-untruthful repair commits the merchant-approved action-free fallback. Database effects and their success records are created atomically before the corresponding committed response becomes visible; appointment requests remain explicitly `requested`, never `confirmed`.

## Automated evidence

- `packages/sales-core/src/index.test.ts`: malicious document instructions are excluded and approved evidence is encoded as untrusted data.
- `packages/provider-gateway/src/index.test.ts`: provider identity and secret-like structured output fail closed.
- `packages/ai-chat-runtime/src/index.test.ts`: false-success repair, secret fallback, entitlement denial and action deactivation.
- `packages/db/src/ai-chat-runtime-store.integration.test.ts`: cross-tenant knowledge canary exclusion, tenant-pinned retrieval, requested-not-confirmed appointment state and successful action-result records.
- `packages/db/tests/rls-isolation.sql`: forced tenant isolation denial.

## Release verification

- `TEST_DB_PORT=55538 pnpm test:db`: all 120 migrations, wired PostgreSQL integration suites, RLS checks, action-result assertions, and guarded legacy rollback passed.
- `pnpm verify`: repository lint, boundary policies, type checks, unit tests, and all 35 production builds passed.
- `pnpm package:release` and `pnpm qa:release-artifacts`: all eight production artifacts packaged and passed fail-closed runtime smoke acceptance.
- `pnpm run test:release-gate`: release-gate contract tests passed.
- `node scripts/check-market-release-requirements.mjs`: registry remains valid at 337 requirements, zero accepted and six non-sellable packages.
- `git diff --check`: patch whitespace validation passed.

No browser or GUI was used.
