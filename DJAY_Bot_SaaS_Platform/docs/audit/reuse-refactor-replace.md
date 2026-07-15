# Reuse, Refactor, Replace Matrix

Status: Accepted P0 porting boundary.

## Decision meanings

- **Reuse**: port with minimal semantic change and parity tests.
- **Refactor**: preserve accepted behavior behind a new contract or data boundary.
- **Replace**: current mechanism violates target invariants; retain only migration adapters/evidence.
- **Retire**: do not move into the SaaS product.

## FlowBot source

| Source area | Decision | Required work before use |
|---|---|---|
| `packages/core` transition engine | Reuse | Rename to `@djay/flow-engine`; preserve purity; add golden parity corpus and entitlement-class validation outside engine |
| matcher normalization/ranking | Reuse | Preserve exact ordering; add Thai/Unicode fixtures where current behavior supports them |
| immutable version/snapshot model | Reuse | Move to canonical deployment/version tables with tenant RLS and behavior snapshot pin |
| input idempotency transaction | Refactor | Scoped repository, RLS, common idempotency result contract, concurrency integration tests |
| widget message/sync/SSE behavior | Refactor | Opaque deployment key, public DTO allow-list, tenant resolution, external fan-out readiness |
| authoring/publish/rollback/simulator | Refactor | Tenant RBAC, Basic/Premium node classification, entitlement checks at edit/publish/runtime |
| inbox/customers/leads/notes | Refactor | Canonical domain tables and statuses; tenant workspace permissions |
| outbox and job heartbeat concepts | Reuse | Shared outbox with tenant scope, lease/retry/DLQ, metrics and per-handler idempotency |
| privacy export/erase behavior | Refactor | Platform-wide PII registry, object/cache/search cleanup, retention/legal hold policy |
| `packages/db/src/auth.ts` | Replace | Global identity, memberships, verified signup, recovery, MFA, session families |
| `tenantDb()` implementation | Replace | Restricted role, transaction-local context, forced RLS, repository-only access |
| raw SQL service imports | Replace | Domain repositories; lint/import-boundary enforcement |
| owner/admin role enum | Replace | Canonical tenant roles/permissions and separate platform roles |
| single-instance in-memory SSE hub | Refactor | Keep durable DB replay; add tenant-scoped external pub/sub before horizontal scale |

## Voice/text source

| Source area | Decision | Required work before use |
|---|---|---|
| sales prompts and bilingual behavior | Refactor | Versioned Sales Core playbook, structured output, evaluations, tenant knowledge/offer inputs |
| lead extraction/tool schemas | Refactor | Action Gateway commands with tenant/entitlement/consent/idempotency/audit |
| post-conversation analysis | Refactor | Worker job, internal provider gateway, schema validation, pinned revision, redacted telemetry |
| calendar availability calculations | Refactor | Canonical tenant/user/calendar ownership, timezone/DST tests, overlap constraint |
| booking links and appointment UI concepts | Refactor | Entitled Action Gateway destination; request vs confirmation ADR enforcement |
| admin overview/inbox/leads UX workflows | Refactor | Shared tenant workspace and canonical domain repositories |
| CSV exports | Refactor | Scoped export service, safe cells, async large export, retention expiry |
| voice media lifecycle behavior | Refactor | DJAY voice gateway and provider-neutral browser protocol |
| OpenAI/Gemini browser code | Replace | Server/gateway adapters only; no vendor URL, token, protocol, model, or branch in public widget |
| singleton `settings` | Replace | Tenant settings, product deployments, immutable behavior revisions, restricted platform routing tables |
| global daily cap | Replace | Usage reservation/settlement ledger keyed by tenant/subscription/meter/idempotency |
| HMAC admin cookie | Replace | DB-backed, revocable, rotating tenant sessions; separate platform session audience/cookie |
| `master_admin`/`admin_users` | Replace | Global users + memberships; Tenant Master Admin is a membership role |
| tenant-visible model controls | Retire | Platform Master Dashboard restricted routing workflow only |
| stored provider/model on tenant conversation | Replace | Internal restricted routing/usage references; tenant conversation DTO exposes capability label only |

## New implementation required

- public catalog, signup intent, email verification, recovery, and legal acceptance;
- users, credentials, sessions, tenants, memberships, invitations, ownership transfer;
- platform identities, MFA, delegated AI Operations, reauthentication, immutable platform audit;
- RLS policies, restricted runtime/worker/migration roles, scoped repositories, isolation harness;
- six-plan catalog, immutable plan versions, subscriptions, entitlement snapshots, overrides;
- canonical contacts, conversations, messages, leads, actions, deployments, channels;
- provider registry and routing in restricted internal packages;
- usage reservations, settlements, billing ledger, invoices, payment webhook inbox;
- tenant-scoped cache, queue, object-storage, rate-limit, logging, tracing, and export conventions;
- operational dashboards, runbooks, incident controls, backup/restore and migration tooling.

## Copy policy

No directory is copied wholesale. A port change must identify source files, accepted tests, target contract, security delta, and parity evidence. Legacy code may be temporarily imported only into migration or characterization tests and cannot become a runtime dependency of the SaaS workspace.

