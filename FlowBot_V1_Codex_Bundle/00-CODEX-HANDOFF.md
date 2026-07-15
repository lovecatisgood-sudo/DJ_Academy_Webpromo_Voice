# Codex Handoff — FlowBot V1.1

## Mission

Build a production-quality, single-tenant FlowBot for the owner's business. FlowBot is the deterministic Tier-1 product and the future shell for the combined Chatbot + Voice Sales Agent SaaS, but this implementation must remain small enough to ship and validate first.

Do not treat the future roadmap as current scope. Preserve contracts; do not pre-build dormant products.

## Mandatory reading order

Copy `AGENTS.md` to the repository root and place the remaining bundle files under `/docs`. Then read:

1. `INTEGRATION-CONTRACT.md`
2. `01-FLOWBOT-V1-PRD.md`
3. `05-ARCHITECTURE.md`
4. `06-DATABASE-SCHEMA.md`
5. `07-API-SPEC.md`
6. `08-SECURITY-PRIVACY.md`
7. `09-TESTING-QA-PLAN.md`
8. `04-FLOWBOT-V1-UI-DESIGN.md`
9. `11-ADR.md`
10. `02-SAAS-PLATFORM-PRD-ROADMAP.md` only to understand future compatibility and exclusions

## First response expected from Codex

Before writing application code, produce:

1. A concise repository plan and proposed file tree.
2. A dependency list with justification and widget bundle impact.
3. A migration plan matching `06-DATABASE-SCHEMA.md`.
4. A risk list focused on Hostinger Node hosting, SSE proxy behavior, Neon connections, and image storage.
5. A checklist mapping every M0 acceptance criterion to a test.

Do not begin M1 until M0 migrations, tenant scoping, auth, environment validation, CI, and test database setup are green.

## Build gates

### Gate A — contract and schema

The following must exist and be tested before any UI feature:

- `packages/shared` canonical enums and zod schemas.
- `packages/db` schema and reviewed SQL migrations.
- `tenantDb(tenantId, fn)` that always executes tenant work in a transaction and sets transaction-local tenant context.
- A two-tenant isolation test even though production has one tenant.
- Seed data: one tenant, one owner, one bot, one draft, one published version, demo flow, contact channels.
- No raw database client imports from app routes.

### Gate B — vertical conversation slice

Before building the full visual editor, prove this path with a seeded flow:

```text
open widget
→ create session pinned to published version
→ choose option
→ type unmatched question
→ fallback and notification outbox row
→ conversation appears Awaiting admin
→ admin takeover and reply
→ visitor receives reply by SSE
→ disconnect/reconnect replays missed reply from DB
→ admin release returns visitor to root of the same pinned version
→ submit lead form through /message
→ one lead and one set of events are committed atomically
→ retry the same inputId and verify no duplicates
```

### Gate C — flow authoring

Only after Gate B:

- Draft CRUD.
- Owned-child versus reference-link behavior.
- Incoming reference report before deletion.
- Publish validator.
- Immutable published version creation.
- New-session pinning and old-session continuity test.
- Draft simulator using the exact `packages/core` matcher and state transitions.

### Gate D — release

All tests and the release checklist in `09-TESTING-QA-PLAN.md` must pass. Do not waive cross-tenant, idempotency, version-pinning, SSE replay, erasure, or rollback tests.

## Recommended milestone order

| Milestone | Deliverable |
|---|---|
| M0 | Monorepo, supported runtime, env validation, schema, migrations, auth, tenant scoping, CI |
| M1 | Pure flow engine, matcher, validator, state machine, effects, unit tests |
| M2 | Seeded end-to-end widget/inbox vertical slice, durable SSE sync, outbox |
| M3 | Draft editor, graph references, publish/rollback, simulator |
| M4 | Production widget UI, theming, accessibility, session persistence |
| M5 | Full inbox, customers, leads, notes, identity suggestions, analytics |
| M6 | Responsive UI, privacy erasure/export, rate limiting, hardening, deployment |
| M7 | V1.5 scheduler only after V1 is live and stable |

## Implementation constraints

- Use Node.js 24 LTS and pin a tested Next.js 16.x version in the lockfile. Do not use `next@latest` or a broad `14+` requirement.
- Prefer the smallest dependency set. Ask before adding an app-level state framework, queue, Redis, WebSocket provider, component mega-library, or AI SDK.
- Widget: Preact or vanilla TypeScript, Shadow DOM, target under 60 KB gzip. Do not import dashboard React components into the widget.
- Admin and widget user-visible copy must support Thai and English.
- Use structured logging with request IDs, but never log message bodies, session tokens, stream tokens, phone numbers, email addresses, cookies, or form payloads.
- Published versions are immutable and cannot be deleted while referenced by a conversation.
- Previous interactive buttons are disabled after selection or when the conversation leaves `bot` status.
- Admin reply requests carry a UUID `idempotencyKey` so retries cannot duplicate staff messages.
- While `admin_active`, visitor Restart/Main Menu is disabled. While `awaiting_admin`, only the explicit `Return to bot menu` action can resume automation.

## Definition of a useful commit

A commit should implement one coherent acceptance criterion and include its tests and documentation updates. Avoid commits that mix schema, unrelated styling, and feature work.

## Stop conditions

Stop and report a contract conflict rather than guessing when:

- An implementation would require a second public lead endpoint.
- An active conversation would switch to the latest published version.
- A node target could cross flow versions.
- A raw session token would be placed in a URL.
- An email provider call would occur without an outbox record.
- A customer match would auto-merge based only on phone/email.
- A V1 task requires building AI, voice, billing, public tenant signup, or external messaging channels.
