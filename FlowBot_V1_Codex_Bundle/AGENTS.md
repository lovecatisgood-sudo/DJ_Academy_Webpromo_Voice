# AGENTS.md — FlowBot V1.1

## Mission
Build the single-tenant deterministic FlowBot described in `/docs`. Preserve future integration contracts without implementing dormant SaaS, AI, voice, billing, or external-channel features.

## Authority order
1. `/docs/INTEGRATION-CONTRACT.md`
2. `/docs/01-FLOWBOT-V1-PRD.md`
3. `/docs/05-ARCHITECTURE.md`
4. `/docs/06-DATABASE-SCHEMA.md`
5. `/docs/07-API-SPEC.md`
6. `/docs/08-SECURITY-PRIVACY.md`
7. `/docs/09-TESTING-QA-PLAN.md`
8. `/docs/11-ADR.md`

When documents conflict, stop and report the conflict. Do not silently invent a third contract.

## Stack
- Node.js 24 LTS.
- A tested, exact Next.js 16.x version pinned in the lockfile.
- TypeScript strict mode, pnpm, Turborepo, Drizzle, Postgres 16, Zod, Vitest, Playwright.
- Preact or vanilla TypeScript for the Shadow DOM widget.

## Hard rules
- A conversation stays pinned to its immutable `flowVersionId`.
- Every visitor mutation requires `inputId`; lock the conversation before checking idempotency. Admin replies require a UUID `idempotencyKey`.
- Form submission and lead creation are one atomic `/message` transaction.
- Raw session tokens never enter URLs or logs; store only SHA-256 hashes.
- SSE history comes from the database. Buffer live events before backlog replay to close the handoff race. Serialize bigint sequence cursors as decimal strings.
- In bot state, use 30-second/focus sync to discover staff-initiated takeover before opening SSE.
- Notifications use the outbox; provider calls never occur in the business transaction.
- Every tenant-owned query is explicitly tenant-scoped and runs through `tenantDb()`.
- Phone/email matches create suggestions, never automatic customer merges.
- `packages/core` is deterministic, transport-neutral, and has no database, HTTP, framework, or AI imports.
- No V1 implementation of multi-tenant signup, billing, LINE/Meta/WhatsApp delivery, AI, voice, self-learning, Google Calendar OAuth, or native mobile apps.

## Working method
- Implement one milestone acceptance criterion at a time.
- Update code, tests, migrations, and affected docs together.
- Do not build the full flow editor before the M2 vertical conversation slice passes.
- Prefer small dependencies; document bundle-size impact for anything added to the widget.

## Validation required before completion
Run the repository's format, lint, typecheck, unit, integration, migration, and relevant Playwright commands. Report exact commands and results. Never claim a check passed unless it was executed.
