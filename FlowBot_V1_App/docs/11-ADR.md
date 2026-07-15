# 11 — Architecture Decision Records

All decisions are Accepted unless marked Future.

## ADR-01 — Single deployable Next.js application in V1

One Node deployment serves admin UI and APIs; widget is a separate static bundle. This minimizes operations for the owner-business pilot. Split gateway/services only when channel or scale triggers require it.

## ADR-02 — pnpm/Turborepo and package boundaries

Use a monorepo so core, database and shared contracts are isolated now and can later become platform modules. `packages/core` is IO-free and imports only shared types.

## ADR-03 — Supported pinned runtime

Use Node.js 24 LTS and a tested pinned Next.js 16.x release. Do not begin a new production app on Node 20 or use broad framework ranges. Host choice must support the runtime and long-lived SSE behavior.

## ADR-04 — Immutable published flow versions and conversation pinning

A publish creates a new immutable version. Every conversation stores `flow_version_id` at session creation. Bot pointer changes affect new sessions only. This prevents mid-conversation breakage and makes rollback honest.

## ADR-05 — Relational authoring plus runtime snapshot

Draft editing uses relational nodes/options/keywords for validation and UI. Runtime reads one zod-validated snapshot by pinned version. This avoids hot-path joins while retaining safe authoring.

## ADR-06 — Owned tree with same-version graph references

`parent_id` defines structural ownership; options/next may reference nodes in the same version. Reference targets are `RESTRICT`-protected. The editor renders references as links, preventing recursive cycle expansion and accidental cascade deletion.

## ADR-07 — Deterministic matcher, no AI

Exact keyword → input-contains-keyword → optional content match. No reverse substring, fuzzy search, embeddings or LLM. This preserves predictable behavior and product-tier separation.

## ADR-08 — Required input idempotency

Every visitor mutation has `inputId`, and the exact response is stored. Retries/concurrency create one result only. Lead submission is not a second public endpoint.

## ADR-09 — Domain effects from the pure engine

Core returns messages, state, events and domain effects. Application code applies all effects in one transaction. This preserves purity while supporting atomic lead/handoff behavior.

## ADR-10 — Hashed visitor capability plus short-lived SSE token

Raw session tokens are never stored or placed in URLs. SSE receives a short-lived purpose token. This removes the original accepted-risk session-key query-string design.

## ADR-11 — Durable SSE replay with in-memory live fan-out

Database message sequence is the replay source. The in-memory hub only pushes newly committed events. Process restart or disconnect therefore does not lose admin messages. Polling fallback uses authenticated POST sync.

## ADR-12 — Notification outbox instead of fire-and-forget

Request transactions create outbox rows; a worker sends/retries. Provider failure cannot roll back or corrupt conversation state, and throttling is enforced by dedupe keys.

## ADR-13 — Tenant-owned rows and transaction-local context

Every tenant-owned row has `tenant_id`. `tenantDb()` applies explicit scoping and transaction-local `app.tenant_id`. RLS is future defense in depth, not a substitute for application scoping.

## ADR-14 — Phone/email are match attributes, not unique identities

Families and organizations may share contact details. Index them for suggestions but do not enforce uniqueness or auto-merge. Exact confirmed channel IDs may be unique under explicit rules.

## ADR-15 — Soft delete and privacy erasure are different operations

Soft delete supports normal UI recovery/retention. PDPA erasure centrally removes or redacts PII from all related stores, including messages, events, outbox and exports.

## ADR-16 — Server-side admin sessions

Use revocable database-backed sessions instead of an unrevokeable long-lived auth JWT. Invite tokens are hashed, expiring and single-use.

## ADR-17 — SSE and jobs remain single-instance infrastructure in V1

One process/live hub and lightweight jobs are acceptable for the pilot because replay and outbox are durable. Multi-instance launch triggers external pub/sub and queue infrastructure.

## ADR-18 — V1.5 scheduler uses overlap exclusion

Pending and accepted booking ranges may not overlap for the same tenant/bot. A range exclusion constraint is safer than uniqueness on start time.

## ADR-19 — Multi-tenancy, AI, voice and governed learning remain future

V1 preserves contracts but does not build dormant services. Future learning is versioned, evaluated, human-approved and tenant-isolated; autonomous production drift is prohibited.
