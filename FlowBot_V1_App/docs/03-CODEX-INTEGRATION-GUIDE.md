# Codex Integration Guide

## 1. Repository document system

```text
/docs
  00-CODEX-HANDOFF.md
  01-FLOWBOT-V1-PRD.md
  02-SAAS-PLATFORM-PRD-ROADMAP.md
  04-FLOWBOT-V1-UI-DESIGN.md
  05-ARCHITECTURE.md
  06-DATABASE-SCHEMA.md
  07-API-SPEC.md
  08-SECURITY-PRIVACY.md
  09-TESTING-QA-PLAN.md
  10-DEVOPS-DEPLOYMENT.md
  11-ADR.md
  INTEGRATION-CONTRACT.md
  /specs
AGENTS.md
```

- PRD: what and why.
- Integration contract: canonical cross-product law.
- Architecture/schema/API: implementation boundaries.
- Milestone spec: the currently approved slice of work.
- `AGENTS.md`: short repository operating rules Codex should load every session.

## 2. Suggested `AGENTS.md`

```md
# FlowBot V1

Read `/docs/00-CODEX-HANDOFF.md` first. `/docs/INTEGRATION-CONTRACT.md`
overrides other documents if wording conflicts.

## Product boundary
FlowBot is deterministic. Do not add LLMs, embeddings, fuzzy AI matching,
autonomous learning, external messaging channels, billing or public tenancy.

## Stack
- Node.js 24 LTS
- pinned/tested Next.js 16.x App Router
- pnpm + Turborepo
- Drizzle + Neon Postgres
- Preact/vanilla widget in Shadow DOM

## Hard rules
- Every conversation is pinned to an immutable published flow version.
- Every visitor mutation has an idempotency inputId.
- Form submission goes through `/message` and is atomic.
- Store only hashes of visitor session tokens; raw tokens never enter URLs/logs.
- SSE replay comes from durable message sequence numbers, not memory.
- Notifications are inserted into an outbox and retried by a worker.
- Every tenant query goes through tenantDb(); direct client imports are forbidden.
- packages/core has no HTTP, Next.js, database, filesystem or provider imports.
- Customer matching is suggest-and-confirm; no silent phone/email merge.
- All visitor/admin user-visible copy has TH and EN values.
- Do not edit a contract without updating docs and tests in the same commit.

## Validation after each task
Run format, lint, typecheck, unit tests and the narrowest relevant integration/E2E tests.
Core, schema, auth, session, SSE, outbox and privacy changes require tests.
```

## 3. Per-milestone working method

1. Create one file such as `/docs/specs/M2-vertical-slice.md`.
2. Include the goal, included requirements, exclusions, data changes, API changes, acceptance checklist, test checklist and rollback note.
3. Ask Codex to inspect the existing repository and produce a plan before editing.
4. Compare the plan to the integration contract and architecture. Resolve conflicts in the spec; do not let implementation silently decide.
5. Implement one acceptance criterion at a time.
6. Update tests and the spec checklist in the same commit.
7. Add decisions that affect later products to `11-ADR.md` and, when cross-product, bump the integration contract.

## 4. Initial Codex prompts

### Repository bootstrap

```text
Read all documents in the mandatory order from 00-CODEX-HANDOFF.md.
Do not write feature code yet. Propose the monorepo file tree, dependencies,
M0 migration plan, tenantDb design, auth/session design, CI jobs, and M0 test
matrix. Flag any conflict you find and cite the exact document sections.
```

### Schema implementation

```text
Implement M0 schema and migrations exactly from 06-DATABASE-SCHEMA.md.
Add migration-level tests or integration assertions for cross-version node
references, conversation flow-version pinning, session-token hashing,
input idempotency, notification outbox dedupe, customer non-unique phone/email
matching, and active booking overlap. Do not implement UI.
```

### Vertical slice

```text
Implement Gate B from 00-CODEX-HANDOFF.md using a seeded published flow.
Prioritize correctness over UI polish. Prove durable SSE replay after a forced
disconnect and prove duplicate inputId returns the original response without
creating duplicate rows.
```

### Flow builder

```text
Implement the authoring model from PRD section 9 and UI document section 3.5.1.
Owned children form the nested tree; references render as links. Deletion must
report and block external incoming references. Publishing creates an immutable
new version, and an existing conversation must continue on its pinned version.
```

## 5. Existing AI Chatbot and Voice Agent repositories

Add the same `INTEGRATION-CONTRACT.md` and a short repository note:

```md
This repository will later merge into the Conversational Suite. New CRM,
conversation, customer and message work must align with the contract. Isolate
the product brain from transport and duplicated CRM/auth code. Do not start
self-learning or shared training work until the governed future milestone.
```

Run an audit first, without code changes:

```text
Audit this repository against INTEGRATION-CONTRACT.md. Report deviations in
canonical enums, customer identity, conversation/message shapes, tenancy,
transport-coupled brain logic, hardcoded configuration, and production behavior
versioning. Sort by merge risk and propose small refactors. Do not edit yet.
```

## 6. Merge-day expectation

If the contract is respected, future integration is primarily:

- move the AI/voice brain into `core-ai` or `core-voice`;
- map existing records to shared customers/conversations/messages;
- delete duplicate CRM, auth and channel logic;
- route normalized inputs through the engine interface;
- preserve behavior versions and tenant isolation.

It should not require redesigning FlowBot V1's CRM, inbox or session model.
