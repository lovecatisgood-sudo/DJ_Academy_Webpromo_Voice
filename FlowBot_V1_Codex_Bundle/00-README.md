# FlowBot V1.1 — Corrected Planning & Design Bundle

**Product family:** FlowBot (deterministic rule-based chatbot) → AI Chatbot → Voice Sales Agent → unified B2B SaaS  
**Current build mode:** single tenant for the owner's business  
**Purpose of this bundle:** give Codex one internally consistent source of truth for building FlowBot V1 without prematurely building multi-tenancy, AI, voice, billing, or channel integrations.

## Start here

1. Read `00-CODEX-HANDOFF.md` and follow its build order.
2. Read `INTEGRATION-CONTRACT.md`; it overrides every other document when wording conflicts.
3. Read `01-FLOWBOT-V1-PRD.md` for product behavior and scope.
4. Read `05-ARCHITECTURE.md`, `06-DATABASE-SCHEMA.md`, and `07-API-SPEC.md` before implementing M0 or any public API.
5. Use `04-FLOWBOT-V1-UI-DESIGN.md` with `flowbot-v1-mockup.html` as the visual reference.
6. Use `09-TESTING-QA-PLAN.md` as the definition of done, not as optional follow-up work.

## Document map

| File | Purpose |
|---|---|
| `AGENTS.md` | Ready-to-copy repository agent instructions for Codex |
| `00-CODEX-HANDOFF.md` | Exact instructions, build gates, milestone sequence, and first tasks for Codex |
| `01-FLOWBOT-V1-PRD.md` | V1 product requirements, state behavior, scope, success criteria |
| `02-SAAS-PLATFORM-PRD-ROADMAP.md` | Future destination; explicitly not V1 scope |
| `03-CODEX-INTEGRATION-GUIDE.md` | Repository instructions, AGENTS.md template, and Codex working method |
| `04-FLOWBOT-V1-UI-DESIGN.md` | Screen behavior, responsive rules, builder semantics, UI states |
| `05-ARCHITECTURE.md` | Runtime design, pinned flow versions, idempotency, SSE replay, outbox |
| `06-DATABASE-SCHEMA.md` | Authoritative SQL design and invariants |
| `07-API-SPEC.md` | Public widget and authenticated admin APIs |
| `08-SECURITY-PRIVACY.md` | Threat model, session capability design, PDPA operational requirements |
| `09-TESTING-QA-PLAN.md` | Unit, integration, E2E, security, performance, and release gates |
| `10-DEVOPS-DEPLOYMENT.md` | Environments, CI/CD, supported runtimes, rollback, operations |
| `11-ADR.md` | Accepted architectural decisions and consequences |
| `INTEGRATION-CONTRACT.md` | Cross-product canonical types, enums, and rules |
| `CHANGELOG-v1.1.md` | What was corrected from the original V1 bundle |
| `VALIDATION-REPORT.md` | Checks completed before packaging and implementation checks still required |
| `MANIFEST-SHA256.txt` | Per-file integrity checksums for the packaged source |
| `flowbot-v1-mockup.html` | Clickable design prototype; behavior is illustrative, not production code |

## Non-negotiable invariants

1. **Every conversation is pinned to one immutable published `flow_version_id`.** Publishing never changes a conversation already in progress.
2. **Every visitor input is idempotent.** One `inputId` may produce effects only once.
3. **Lead-form submission is one atomic `/message` transaction.** There is no separate public `/lead` workflow.
4. **Raw visitor session tokens never appear in URLs or logs.** Store only a hash; use a short-lived stream token for SSE.
5. **Realtime delivery cannot lose the backlog/live boundary.** Decimal-string message sequences drive database replay; a temporary live buffer closes the subscribe race, and bot-state sync discovers staff-initiated takeover before SSE opens.
6. **All email/notification delivery uses an outbox with retries.** No fire-and-forget provider call inside the request path.
7. **Tenant isolation is explicit now and RLS-compatible later.** Every tenant-owned row has `tenant_id`; all tenant operations use `tenantDb()` with transaction-scoped context.
8. **Customer identity is suggest-and-confirm.** Phone or email matches never silently merge profiles.
9. **The FlowBot engine stays deterministic, transport-neutral, and IO-free.** AI behavior is not allowed in this product tier.
10. **V1 scope wins.** Do not build multi-tenant signup, billing, LINE/Meta/WhatsApp delivery, AI, voice, self-learning, Google Calendar OAuth, or native apps.

## Source-of-truth policy

This ZIP is intentionally flat. Do not create another planning ZIP inside the repository. After import, `/docs` in the code repository becomes the source of truth. Any implementation change that alters a contract, state transition, API, or schema must update the relevant document in the same pull request.

## Version

Bundle **v1.1**, corrected July 13, 2026. External stack references were checked against official Node.js, Next.js, Neon, and Thailand PDPC/GPPC documentation on that date.
