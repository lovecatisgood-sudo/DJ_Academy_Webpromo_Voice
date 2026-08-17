# DJay Bots V1 Market Release Architecture Plan

| Field | Value |
| --- | --- |
| Status | Target architecture for implementation and production release |
| Date | 2026-08-13 |
| Product authority | `docs/product/djay-bots-v1-market-release-prd.md` |
| Experience authority | `docs/design/djay-bots-approved-experience-contract.md` |
| Detailed UX | `docs/design/djay-bots-v1-ui-ux-and-user-flows.md` |
| Implementation plan | `docs/implementation/djay-bots-v1-detailed-implementation-plan.md` |
| Primary cloud | Google Cloud Platform |
| GCP project | `master-deck-476811-a8` |
| Primary region | `asia-southeast3` (Bangkok) |
| Recovery region | `asia-southeast1` (Singapore) |
| Public product domain | `djbot.djai.academy` |

## 1. Architecture objective

Build and operate the complete six-package DJay Bots SaaS without reducing the commercial offer. The target extends the repository's existing modular-monolith and gateway design. It does not introduce microservices for their own sake: independently scaling or security-sensitive workloads are separate deployables, while business transactions remain in a cohesive API and PostgreSQL system.

This document describes the intended production state, required changes from the current codebase, critical data flows, security and reliability controls, deployment topology, implementation order, and definition of done.

## 2. Current baseline and principal gaps

### 2.1 Reusable baseline

- TypeScript monorepo with public site, tenant web, platform-master UI, API, workers, widgets, AI gateway, and Voice gateway.
- PostgreSQL 16 with migrations, strict row-level security, tenant context, and least-privilege database roles.
- Versioned bot/domain foundations, Flow execution, web widgets, social ingress foundations, sales core, usage ledger foundations, provider interfaces, Stripe adapter, signed webhook inbox, and audit/runbook patterns.
- GCP Terraform foundation for Cloud Run, load balancing, Cloud SQL, storage/CDN, secrets/KMS, Artifact Registry, monitoring, and backups.
- Existing OpenAI Responses and Realtime adapter foundations behind DJAI-owned gateways.

### 2.2 Gaps this architecture must close

- Versioned sellable catalogue, exact prices, entitlements, add-ons, packs, renewals, and complete enforcement.
- Rich Flow content/actions, deterministic social execution, advanced customer state, Sheets/API integrations, and reports.
- Real knowledge crawling/file ingestion, catalogues, typed AI actions, additional languages, CRM/integrations, summaries/scoring, and reports.
- PSTN/SIP, number/carrier lifecycle, live and department transfer, integrated scheduling, sentiment indicators, and reconciled voice billing.
- End-to-end Stripe lifecycle, immutable invoices/credit notes, FlowAccount synchronization, forecasts, alerts, and safety caps.
- Actual GCP services, images, secrets, DNS, production provider credentials, quotas, dashboards, recovery drills, and release evidence.

## 3. Architectural principles

1. **Local authority with reconciled providers.** DJay Bots owns tenant, entitlement, usage, audit, and accounting truth. Provider IDs/states are evidence synchronized through adapters.
2. **Tenant context at every layer.** Authentication, authorization, database RLS, cache keys, object paths, queues, logs, and provider metadata carry a tenant boundary.
3. **Immutable commercial history.** Catalogue versions, subscriptions, meter events, invoices, credit notes, published bot revisions, and audit events are append-only or explicitly superseded.
4. **Idempotency by design.** External webhook, checkout, channel delivery, action, usage, invoice, synchronization, and provisioning flows tolerate retries and reordering.
5. **Asynchronous at unstable boundaries.** Provider events are durably accepted before work. Crawling, extraction, notifications, synchronization, reporting, and reconciliation use queues/outboxes.
6. **Synchronous only for the live turn.** Conversation runtime performs only latency-critical retrieval, model/flow execution, safe actions, and response delivery; secondary work is deferred.
7. **Provider-neutral contracts.** OpenAI, Stripe, telephony, social, email, storage, vector search, CRM, Sheets, and accounting implementations sit behind typed interfaces.
8. **Fail closed for money, access, and external actions.** Unknown entitlement, cap, signature, authorization, or action outcome cannot grant service or claim success.
9. **Observable state machines.** Subscription, import, publication, message, voice session, handover, invoice, sync, and job states are explicit and queryable.
10. **Incremental deployment.** Schema and protocol changes remain backward compatible across rolling Cloud Run revisions and worker queues.

## 4. System context

```text
Business admins/agents ──> Tenant Web ───────────────┐
DJAI operators ──────────> Platform Master ──────────┤
Website visitors ────────> Text/Voice Widgets ───────┤
LINE/Meta ───────────────> Signed Channel Webhooks ──┤
PSTN/SIP carrier ────────> Voice Gateway ────────────┤
                                                       v
                 Global HTTPS Load Balancer -> Cloud Run services
                                                       |
                         API / AI Gateway / Voice Gateway / Workers
                             |          |          |
                    PostgreSQL/GCS   OpenAI    Stripe/CRM/Sheets/
                                              FlowAccount/Email/Carrier
```

Trust boundaries are the public internet, tenant/browser clients, third-party providers, GCP project/network, application services, data stores, and operator plane. No browser or channel provider receives database, OpenAI, Stripe, accounting, or cross-tenant credentials.

## 5. Container architecture

| Container | Responsibility | Scaling and exposure |
| --- | --- | --- |
| `public-site` | Public catalogue, offer, legal pages, sign-in/checkout entry | Public Cloud Run; cacheable content |
| `tenant-web` | Tenant administration, builders, leads, analytics, billing, integrations | Public through ALB; authenticated |
| `platform-master` | DJAI operations, support, finance, reconciliation, feature/catalogue administration | Identity-restricted; never generally public |
| `api` | Identity/tenancy, bot configuration, Flow runtime, conversations, leads, billing, entitlements, integrations, reports | Public through ALB for approved routes; private/internal routes separated by auth |
| `ai-gateway` | Restricted OpenAI Responses calls, schema enforcement, model policy, cost/safety telemetry | Private Cloud Run; invoked by API/workers only |
| `voice-gateway` | WebSocket media/session control, realtime provider bridge, telephony media, concurrency, handoff | Public WSS/carrier paths through ALB with strict route/auth; horizontally scaled |
| `workers` | Outbox, imports, crawling, extraction, indexing, notifications, reports, reconciliation, provider sync, cleanup | Private Cloud Run jobs/services triggered by Cloud Tasks/Scheduler |
| `widget-cdn` | Immutable hashed text/voice widget bundles and assets | GCS + Cloud CDN |
| PostgreSQL | Transactional truth, RLS, ledgers, state machines, reporting projections | Private Cloud SQL HA PostgreSQL 16 |
| GCS buckets | Upload quarantine, normalized knowledge, exports, invoice artifacts, widget assets, backups where applicable | Private by default; signed URLs; separate lifecycle policies |

### 5.1 Why these boundaries

- AI and voice gateways protect provider credentials and independently control high-cost/realtime workloads (`AIT-001`, `VOI-001`).
- Workers isolate slow or retryable operations from request latency (`KNO-*`, `NOT-002`, `FIN-006`, `OVR-009`).
- A shared API/database retains atomic business transactions for tenant provisioning, entitlements, publication, handovers, and accounting.
- Static widgets on CDN minimize latency and allow immutable rollback while their runtime APIs remain controlled.

## 6. Domain/module boundaries

| Domain | Existing/target package ownership | Key responsibilities |
| --- | --- | --- |
| Identity and tenancy | API auth modules, `packages/db` | Accounts, sessions, memberships, roles, workspace provisioning, support access |
| Catalogue and entitlements | `packages/catalog`, `packages/entitlements` | Versioned plans/add-ons/packs, grants, effective intervals, checks |
| Usage and billing | `packages/usage-billing`, provider adapters | Meter event ledger, aggregation, forecast, cap reservation, Stripe linkage |
| Flow Bot | `packages/flowbot-domain`, engine, widget | Graph revisions, validation, deterministic execution, content/actions, publication |
| AI Text | `packages/sales-core`, AI runtime/widget, provider gateway | Knowledge retrieval, structured model result, safe actions, channel response |
| Voice | Voice runtime/widget/gateway | Session protocol, media, realtime provider, transcript/outcomes, telephony/transfer |
| Conversations/leads | shared domain/API | Cross-channel conversation, participants, messages, leads, handovers, outcomes |
| Knowledge | new/expanded package | Sources, ingestion jobs, revisions, documents, chunks, indexes, refresh/review |
| Channels | channel adapters | LINE/Meta/web ingress/egress, identity mapping, capability adaptation, delivery |
| Integrations/actions | `packages/action-gateway` plus connectors | Credentials, field maps, webhooks, Sheets, CRM, scheduling, external APIs |
| Finance/accounting | new finance module | Orders, immutable invoice/credit ledger, numbering, Stripe/FlowAccount reconciliation |
| Operations | workers/platform-master/notifications | Jobs, dead letters, audits, reports, support, incident/reconciliation workflows |

Domain packages MUST expose typed application contracts and must not import framework-specific HTTP objects or provider SDK types into core business logic.

### 6.1 Experience application architecture

The public, tenant, Platform, and widget applications are separate experience realms over the same authoritative domain services. They MUST NOT reconstruct lifecycle or entitlement state from scattered API calls in browser code.

```text
Public Site ───────> same-origin public BFF/proxy ──> Public application services
Tenant Web ───────> same-origin tenant BFF/proxy ──> Tenant application services
Platform Master ──> separate platform BFF/proxy ──> Platform application services
Widgets ──────────> deployment/session APIs ───────> Public runtime services
```

The existing runtime `proxyApiRequest`, realm-specific trusted-origin checks, cookie separation, safe mutation wrapper, error boundaries, and fail-closed data behavior remain mandatory. The frontend layer receives task-oriented read models, opaque action identifiers, and capability states; it never receives raw provider/model routing or uses hidden controls as authorization.

Required application services/read models:

- **Public catalogue view:** active package comparison, prices, promotion, terms and sellability from one catalogue version (`EXP-001`, `EXP-002`).
- **Deployment journey:** server-held package/trial and anonymous-draft intent, deployment-time registration/verification continuation, checkout intent and authoritative return state (`EXP-003` through `EXP-009`).
- **Workspace portfolio:** account/commerce state plus independent lifecycle projection for every subscribed product family (`ONB-010`, `OPS-001`).
- **Onboarding coordinator:** shared prerequisites, per-product steps, authoritative evidence, blockers and next allowed action (`ONB-001` through `ONB-012`).
- **Operational command views:** inbox/customer/lead/action, product health, usage/billing and attention queues (`OPS-*`).
- **Platform operations views:** cross-tenant queues and Tenant 360 with role-specific projections and masked sensitive fields (`PLT-*`).
- **Widget manifest:** product-neutral public configuration, theme, allowed modes, disclosure, fallback and session endpoints (`WEB-*`).
- **Trial offer and lifecycle:** eligibility, Starter capability snapshot, website-only channel scope, fixed start/expiry, allowance, threshold-delivery state and upgrade action (`TRL-*`).
- **Configuration Studio:** product-specific section definitions, draft/published version state, advisory findings, technical blockers, autosave/conflict state and test-session evidence.
- **Merchant operations:** product-aware conversations, contacts, leads, appointments, analytics and five-minute takeover capability derived from authoritative event/ownership state.

These are projections over domain truth, not new systems of record. Projection freshness and source state are returned explicitly so a failed secondary panel cannot become a false zero/healthy state.

### 6.2 Information architecture and route ownership

Implement the route inventory in `docs/design/djay-bots-v1-ui-ux-and-user-flows.md` incrementally. Public acquisition, checkout return, workspace Overview, Billing/Usage, product onboarding, Inbox, and Platform exception queues are P0. Large existing single-page Studios must be split behind stable product context without duplicating domain fetch/mutation code.

Route guards resolve session, selected workspace, role, entitlement and resource before rendering. Deep links preserve the intended task through same-origin validated continuation paths. Mobile stacked routes and desktop split panes share the same server action/read contracts.

The authorization model must add a billing-management job boundary. It may initially be a permission bundle on owner/admin, but purchase, tax, payment, overage/cap, plan-change and cancellation endpoints require explicit billing permissions and recent authentication independently of navigation visibility.

### 6.3 Approved experience composition

The route/application composition MUST implement the sequence defined by the approved experience contract:

```text
Public Landing
 -> Packages (all three families)
 -> choose family
 -> choose Starter/Advanced
 -> paid subscription or eligible trial
 -> Account/authoritative provisioning
 -> Flow template onboarding OR Text/Voice role onboarding
 -> full-page product Configuration Studio
 -> optional draft test/review
 -> immutable publish
 -> snippet installation
 -> origin verification
 -> explicit Go live
 -> Merchant Dashboard <-> Configuration Studio
```

The product selector owns `product_family` before a bot role exists. Flow drafts use `starting_template`; AI Text and Voice drafts use `agent_role` with `support`, `sales`, or `booking`. Role is bot configuration, not subscription or entitlement authority.

The server returns separate step schemas/read models for Flow, Text and Voice. A shared frontend shell may render navigation, save state, dialogs and right-panel testing, but it MUST NOT merge Flow template onboarding with the AI role/source/generation workflow or reuse Text modality controls for Voice.

Dashboard routing is independent of configuration completion. Lifecycle projections expose `not_configured`, `draft_changes`, `published_install_pending`, `verified_traffic_off`, and `live` labels; they do not redirect an authenticated merchant into forced onboarding. Configuration remains a dedicated product route reachable from every dashboard view.

## 7. Catalogue and entitlement architecture

### 7.1 Catalogue model

Create immutable catalogue versions rather than editing plan rows in place.

```text
catalog_versions
  id, code, status(draft|active|retired), effective_from, currency, timezone,
  terms_version, created_by, approved_by, checksum

catalog_products
  id, catalogue_version_id, family(flow|ai_text|voice), public_name,
  internal_plan_key, sellable, display_order

catalog_prices
  id, product_id, price_kind(first_term|renewal|overage|pack|addon|service),
  amount_minor, interval, external_price_id, tax_behavior, effective_term

catalog_entitlements
  product_id, entitlement_key, value_json, enforcement_mode

catalog_promotions
  id, version, eligibility, start_at, end_at nullable, fixed/percent terms,
  first_terms, external_coupon_id, status
```

The six existing internal keys remain stable. Public naming changes from Basic/Premium to Starter/Advanced at presentation boundaries. A `subscription_contract_snapshot` stores the exact catalogue, promotion, prices, limits, and terms accepted at checkout (`COM-001` through `COM-018`). A tenant may combine one Flow, one AI Text, and one AI Voice base package per workspace; same-family upgrades replace rather than accidentally stack the base entitlement.

### 7.2 Entitlement evaluation

Effective entitlement is computed from:

1. All compatible active subscription contract snapshots, evaluated by bot family and workspace rather than naively summing unrelated limits.
2. Effective add-on grants.
3. Purchased pack balances for meters only.
4. Time-bounded operator credit/override with reason and approval.
5. Suspension/termination restrictions.

Use a request-scoped entitlement snapshot with a short cache TTL and version token. High-value operations recheck transactionally. The database enforces hard resource counts where feasible; runtime allocation uses atomic reservations.

### 7.3 Downgrade behavior

A scheduled downgrade runs a preflight report: bots, admins, workspaces, channels, topics, knowledge, concurrency settings, branding, and integrations exceeding the target plan. Nothing is deleted automatically. At effective time, excess resources become read-only/disabled according to a deterministic selection confirmed by the owner. Export and remediation remain available.

## 8. Core data architecture

### 8.1 Transactional database

Cloud SQL PostgreSQL 16 remains the system of record. Use normalized transactional tables, JSONB only for typed provider payload references/configuration where schema flexibility is justified, and generated reporting projections/materialized views for dashboards.

Required table groups beyond the current schema:

| Group | Principal tables/entities |
| --- | --- |
| Commerce | catalogue versions/products/prices/entitlements/promotions, checkout intents, subscription contracts, provider customer/subscription mappings, scheduled changes, add-on subscriptions, pack purchases |
| Usage | meter definitions, immutable usage events, reservations, daily/monthly aggregates, pack lots/consumption, forecasts, thresholds, safety caps, reconciliation runs/items |
| Finance | orders, invoice sequences, immutable invoices/lines/tax totals/artifacts, credit notes/lines, payments/refunds/disputes, provider mappings, accounting sync outbox/results |
| Experience lifecycle | signed anonymous Builder sessions, current Builder drafts and immutable draft revisions, purchase intents, registration continuations, product lifecycle projections, onboarding definitions/evidence/blockers, install checks, customer notification/activity records |
| Knowledge | knowledge bases/collections, sources, source versions, ingest jobs/steps, extracted documents/pages, chunks, embeddings/index refs, published knowledge revisions, crawl schedules |
| Catalogue content | products, services, variants/options, categories, localized fields, price-display text, availability, CTA/action references |
| Customer operations | contacts, identities, tags, attributes, segment rules/memberships, lead score definitions/results, handovers, assignments, notes, appointment/callback records |
| Channels | channel connections, encrypted credential refs, external identities, inbound events, outbound deliveries, templates/capabilities, health checks |
| Voice | phone numbers, carrier connections, voice sessions/legs, media sessions, transfers, raw second/meter links, transcript/summary revisions, outcomes/tags/sentiment indicators |
| Integrations | connections, credentials refs, field mappings, action definitions/executions, webhook endpoints/secrets/deliveries, CRM/Sheets/scheduling sync links |
| Operations | outbox, inbox, task attempts, dead letters, audit events, support cases/access grants, notification deliveries/preferences, exports, retention/deletion jobs, release evidence |

### 8.2 RLS and database roles

- Tenant-owned tables include a non-null `tenant_id`; child tables inherit/prove ownership through constrained foreign keys and RLS-safe access paths.
- Separate roles: migration owner, API runtime, worker runtime, gateways where direct DB access is necessary, read-only reporting, and tightly controlled break-glass.
- Runtime connections set signed/validated tenant context per transaction and reset it on pool release.
- Platform-wide finance/support queries use dedicated functions/views with explicit operator authorization and audit, never generic RLS bypass in tenant APIs.
- Automated tests attempt cross-tenant reads/writes for every new table and indirect join path (`TEN-005`, `SEC-008`).

### 8.3 Data consistency patterns

- Use transactional outbox for work triggered by committed state.
- Use provider inbox tables keyed by provider/event ID and payload hash.
- Store state transition history rather than only current status for subscriptions, jobs, voice, handovers, invoices, and sync.
- Use optimistic version columns for user-edited drafts and explicit published revision pointers.
- Use advisory locks or sequence rows for finance numbering and reconciliation partitions.

## 9. Conversation and lead model

Normalize all channels into one envelope:

```text
ConversationEvent {
  eventId, tenantId, workspaceId, botId, botRevisionId,
  conversationId, participantId, channel, externalEventId,
  direction, eventType, content[], occurredAt, receivedAt,
  consentContext, locale, correlationId
}
```

Content is typed: text, image, video, buttons, link, call, LINE contact, checkout, booking, quotation, product/service card, carousel, menu/category, form, transfer, and system status. Channel adapters translate this canonical model to provider capabilities and record degradation/fallback.

Contacts may have multiple channel identities. Merging contacts requires an authorized, auditable workflow; automatic correlation by phone/email must not leak identity across tenants. Leads reference conversation/contact snapshots, qualification, score, outcome, consent, source, and assignments (`LEAD-*`).

### 9.1 Product lifecycle and onboarding evidence

Do not store one mutable onboarding stage for the entire tenant. Model shared prerequisite evidence and independent per-product lifecycle projections.

```text
tenant_onboarding_evidence
  tenant_id, evidence_key, subject_version, status, source_kind,
  source_id, observed_at, invalidated_at, safe_blocker_code

product_lifecycle_projection
  tenant_id, product_family, subscription_contract_id,
  access_state, configuration_state, published_version_id,
  tested_version_id, deployment_state, live_health,
  next_action_code, blockers[], calculated_at, projection_version
```

Additional approved experience records:

```text
trial_grants
  id, tenant_id, workspace_id, product_family, catalogue_version_id,
  starts_at, expires_at, allowance, consumed, channel_scope,
  card_requirement_satisfied, eligibility_decision_id, state

configuration_findings
  id, tenant_id, bot_draft_id, subject_version, finding_code,
  severity(advisory|blocking), section_key, details_json, observed_at, resolved_at

bot_test_sessions
  id, tenant_id, bot_draft_id, product_family, role_or_template,
  locale, started_from_step nullable, mode(text|voice|flow),
  billable=false, external_effects=false, evidence_digest, created_by, created_at
```

`configuration_findings` separates content/readiness advice from actual invariants. Unreviewed sections and unrun suggested tests are `advisory`; entitlement denial, malformed graphs, unsafe external actions, invalid deployment origin, and applicable legal/safety controls are `blocking`. Publication APIs accept advisory findings only with an explicit acknowledgement snapshot and audit record.

Evidence examples are verified profile, notification/handover destination, disclosure/retention policy, usage protection, current published revision, current-version test, deployment install/channel/two-way/telephone test, and live health. Evidence invalidates when its subject changes: a test against version 4 does not prove version 5; a revoked deployment does not remain launch evidence.

The onboarding coordinator returns plan- and product-specific step definitions with status, required permissions, allowed actions and deep links. The browser cannot mark a step complete. Shared evidence is referenced across products, while publication, test, deployment and live health remain family/bot specific (`ONB-*`).

Product lifecycle is a projection, not a single writable enum. It combines subscription access, configuration, tests, deployments and health into the experience labels specified by the UI/UX plan. A projection worker/outbox refresh handles asynchronous changes; high-value launch/admission actions calculate authoritative prerequisites transactionally instead of trusting projection freshness.

## 10. Flow Bot architecture

### 10.1 Authoring and publication

- Extend the graph schema with typed rich-content nodes, CTA nodes, form fields, customer tag/attribute mutations, qualification, quotation/booking/order request, department routing, Sheets/webhook/API action nodes, and advanced conditions.
- Validate graph reachability, missing targets, cycles requiring explicit bounded loops, field types, secret/action references, topic count, payload size, channel capability, and entitlements.
- Save immutable revisions. Draft changes use optimistic concurrency. Publication transactionally sets one active revision and emits cache-invalidation/CDN events.
- Templates are copied into a tenant draft with source/version attribution; later template changes do not mutate published tenant flows.
- The approved Starter template registry contains FAQ and contact, Capture leads, Appointment request, Product or service guide, Support routing, and Blank. Each registry version carries localized nodes, preview metadata and a checksum; copying always produces a fully editable tenant draft.
- The authoring API supports message, options, input, form, card, handover and end steps in the approved baseline; add/duplicate/remove, entry selection, localized copy, keywords, option targets, form fields and layout positions use optimistic draft mutations with undo/redo history.
- Publication MUST reject only invalid/coherence/security/entitlement conditions. Missing optional form/handover content, incomplete language coverage, unrun tests and other quality suggestions remain advisory and may be acknowledged at publish time.

### 10.2 Deterministic execution

```text
website/social event
 -> signature/origin validation + dedupe
 -> conversation/session resolution
 -> entitlement + quota reservation
 -> load pinned published Flow revision
 -> deterministic node interpreter
 -> safe action gateway when explicitly configured
 -> canonical response
 -> channel renderer/delivery
 -> commit state + usage event + analytics outbox
```

Execution state stores current node, typed variables, collected fields, tag/attribute references, awaiting-input schema, and bounded action results. A Flow session pins its revision to prevent mid-session graph changes. No LLM path is present in ordinary Flow execution (`FLS-015`, `FLA-005`).

Configured typed-message keywords resolve deterministically. Unmatched text invokes the versioned fallback/handover path. The interpreter enforces a bounded transition count and produces an explicit safe terminal error for missing/unbounded execution instead of invoking AI.

Draft Flow testing uses the same interpreter against an unpublished revision under `billable=false` and `external_effects=false`. It supports entry-node or selected-node start, localized paths, forms and typed fallback. Production publication, deployment verification and live traffic remain separate records and commands.

### 10.3 Rich media

Uploads use signed GCS URLs, quarantine, scan/metadata processing, then immutable media assets. Store width/height/duration/MIME/hash/alt text/caption. The renderer selects provider-supported forms and a text/link fallback. Assets are served by controlled CDN URLs with tenant origin/use policy.

## 11. Knowledge and retrieval architecture

### 11.1 Ingestion pipeline

```text
manual FAQ / upload / crawl request
 -> create source version + ingest job
 -> upload to private quarantine or queue crawl URLs
 -> validate type/size/URL scope
 -> malware scan and safe extraction sandbox
 -> normalize text + source/page metadata
 -> classify/exclude boilerplate and hostile instructions
 -> chunk deterministically
 -> generate embeddings through restricted gateway
 -> write chunks/index references
 -> quality checks and source preview
 -> publish immutable knowledge revision
```

Cloud Tasks invokes private worker endpoints with OIDC. Separate queues control crawl, extraction, embedding, indexing, deletion, and scheduled refresh rates. GCS lifecycle policies remove quarantine and temporary artifacts. Source hashes make retries idempotent.

### 11.2 Crawling

- Allowlist scheme/host/path; block private/link-local/metadata IPs to prevent SSRF.
- Respect access policy/robots and customer authorization, cap depth/pages/bytes/time, canonicalize URLs, and rate-limit hosts.
- Store fetch status, content hash, redirects, last modified/ETag, extraction result, and exclusions.
- Advanced scheduled crawl detects changed/deleted pages. Starter website import supports bounded explicit sources and weekly refresh.
- Onboarding website learning explicitly excludes authenticated/account, checkout, form-submission, private and unrelated pages. Crawl jobs emit customer-safe stage events for validation, accessible-page discovery, extraction, fact organization and draft generation. These events describe completed/running work and never expose hidden model reasoning.
- Partial success preserves accessible-page results and exclusion reasons. The coordinator supports retry, accept accessible public pages, or switch to manual business input without discarding already entered identity/role state.

### 11.3 Retrieval

Use PostgreSQL vector support initially if load tests satisfy latency/scale; preserve a `VectorIndex` interface for a managed alternative. Retrieval filters by tenant, knowledge revision, collection, bot policy, locale, document status, and optional catalogue category before ranking. Store retrieved chunk IDs and scores with the AI turn for quality audit, but never expose private source text beyond the tenant's configured customer answer policy.

## 12. AI Text architecture

### 12.1 Runtime flow

```text
canonical inbound message
 -> auth/channel verification + dedupe
 -> entitlement and AI-reply capacity reservation
 -> conversation policy, locale, customer and bot context
 -> retrieve active knowledge/catalogue evidence
 -> AI gateway Responses request
 -> strict JSON Schema Structured Output
 -> application validation and safety/action policy
 -> optionally invoke approved action, then confirm result
 -> canonical channel response + handover/lead mutations
 -> commit customer-facing reply and usage exactly once
 -> async summary, analytics, quality and notification work
```

Before commit/delivery, the application validates the customer-facing response to no more than 200 locale-aware words using `Intl.Segmenter` semantics for English and Thai. Prompt policy targets roughly 40–80 words for Text. Oversized output receives one bounded rewrite that must preserve grounded facts, citations, action proposals and handover state; a failed or non-preserving rewrite produces the approved concise fallback. The application never slices customer text or exposes the limit as a provider failure.

### 12.2 Structured output contract

Generate the provider JSON Schema from the same Sales Core Zod/domain schema used for application validation. Required fields include customer-facing localized content, evidence references, confidence, detected intent, qualification updates, typed CTA/action proposal, lead field proposals, handover reason/department, and safety/refusal state. Upgrade the current JSON-mode adapter to Responses Structured Outputs with `strict: true`. Explicitly handle provider refusal and incomplete responses (`AIT-003` through `AIT-005`).

### 12.3 Model routing and safety

- Model allowlist and temperature/token/tool policy are server configuration by capability and language; tenants configure business behavior, not arbitrary provider access.
- Production routes require authenticated service identity, tenant/bot policy, request size limits, pseudonymous safety identifier, budget reservation, and audit-safe telemetry.
- Separate user instruction, tenant configuration, retrieved evidence, and tool results. Documents are untrusted data, not system instructions.
- A moderation/policy layer covers unsafe content, regulated advice, personal data, abuse, and tenant-configured prohibited claims.
- Model/provider fallback is permitted only after language/quality/cost validation and must not duplicate billable replies.

### 12.4 Advanced customer intelligence

Tags and typed attributes are explicit data, not free-form model writes. Segments use versioned rules. Lead scores retain inputs, rule version, model contribution where used, explanation, and timestamp. Summaries are immutable revisions with a current pointer and human correction. Sentiment is not part of Text offer but the same provenance pattern applies when used operationally.

## 13. Voice architecture

### 13.1 Web voice session

```text
browser widget
 -> API issues short-lived, tenant/bot/origin-bound voice token
 -> WSS through global ALB to Voice gateway
 -> atomic entitlement/concurrency/minute-cap reservation
 -> gateway opens OpenAI Realtime server WebSocket
 -> bidirectional audio/events with bounded buffers
 -> safe tool/action calls through internal API
 -> periodic heartbeat/checkpoint and raw-second metering
 -> terminal finalize exactly once
 -> transcript/summary/outcome jobs + usage reconciliation
```

The Voice configuration service combines the same role/business/knowledge contracts used by AI Text with a distinct provider-neutral modality record for voice, speed, interruption, silence, readback, maximum duration, disclosure, low-confidence recovery, misunderstanding recovery, transfer fallback and recording consent. Written responses target roughly 20–50 words and pass the shared 200-word validation and controlled-rewrite policy before speech synthesis/realtime output.

Cloud Run supports WebSockets but requests remain subject to service timeout and instance termination. The widget must reconnect with a short-lived resume token; session coordination and concurrency live outside instance memory in PostgreSQL plus a low-latency shared lease mechanism if load tests require it. Session affinity is an optimization only.

### 13.2 Telephony and SIP

Introduce a `TelephonyProvider` adapter with:

- Number inventory/provisioning and tenant assignment.
- Signed inbound call webhook verification and dedupe.
- Media stream/SIP bridge into the same Voice session protocol.
- Call legs, caller/called identity minimization, carrier status callbacks, recording consent policy, and cost records.
- Blind/warm transfer primitives, DTMF when needed, department/agent destinations, transfer timeout/fallback, and terminal reconciliation.
- Provider call detail record import for duration and carrier-charge reconciliation.

The initial provider must demonstrate Thailand number availability or approved alternative routing, media streaming, live transfer, callback/webhook integrity, sandbox/test capability, itemized costs, quota escalation, and production support. Provider choice is recorded in an ADR.

### 13.3 Realtime protocol

Keep the DJAI opaque gateway protocol from ADR-006. Version client/gateway messages and support hello/authenticated, ready, audio append, speech state, transcript delta/final, response audio, interruption, action pending/result, handover, usage warning, reconnect, error, and terminal events. Unknown message versions fail explicitly. Audio codecs/sample rates are negotiated and validated.

### 13.4 Voice safety and completion

- Atomic per-tenant and global concurrency leases have expirations/heartbeats and are released by terminal finalization or reaper.
- Meter raw connected seconds continuously so abrupt disconnects do not lose usage; create final rounded usage once per session.
- Live transfer hands the human party a context summary while the customer is held/informed. Failure returns to configured callback or message behavior.
- Scheduling uses the common action gateway with availability confirmation and verified booking ID.
- Sentiment output stores model/rule, time segment, confidence, caveat, and human correction; UI labels it an indicator (`VOA-008`).

## 14. Channel architecture

### 14.1 Inbound pattern

1. ALB routes provider-specific webhook path to API.
2. Adapter verifies signature using encrypted connection secret and raw body.
3. Inbox stores provider ID, hash, received time, connection, and encrypted/raw evidence policy.
4. Respond quickly; worker normalizes the event.
5. Resolve tenant/bot/external identity and deduplicate.
6. Dispatch to Flow or AI runtime based on bot type; never route Flow through AI by default.
7. Deliver canonical response through adapter and store provider result.

### 14.2 Outbound/rich content

A channel capability registry declares supported content, size, button, carousel, reply-window, locale, and rate limits. Renderers select exact or documented fallback behavior. Deliveries have queued/sent/delivered/read/failed where provided, retry classification, and operator replay. Outbound broadcast remains outside included conversation usage and requires future/add-on policy.

The initial included social choices are LINE OA and Facebook Messenger. The add-on catalogue can expose WhatsApp or an additional website only after its adapter, third-party approval, commercial configuration, and complete release evidence are active (`ADD-004`).

### 14.3 Website widget manifest and multi-product entry

One host-site loader resolves an immutable, cacheable public manifest by opaque deployment key and exact origin. The manifest contains only safe business/bot identity, branding entitlement, theme, launcher placement, available product modes, disclosure/privacy URLs, localized opening state, capability flags and runtime endpoints. It never contains tenant UUIDs, provider/model IDs, secrets or trusted entitlement values.

The API remains authoritative for origin, deployment, entitlement, cap and runtime admission even when a manifest is cached. Manifest version and widget bundle compatibility are explicit. Installation checks record script reachability, manifest/origin validation, bundle version, page conflict, CSP/microphone constraints and a safe result code.

When multiple products are present, a `widget_entry_configuration` selects primary mode, allowed mode chooser, context-transfer policy and inline secondary entry points. Only one floating launcher renders by default. A cross-mode link carries an opaque server-issued conversation-context reference; each resulting product conversation retains its own meter, transcript and lifecycle (`WEB-001` through `WEB-008`).

The widget uses an isolated DOM/style boundary, durable server conversation sync for Flow/Text, short-lived tokens for Voice, stable responsive geometry and accessible state announcements. Host-page inspection is limited to origin and approved integration signals; arbitrary host DOM/content is not read.

### 14.4 Social reply-window and handover state

Channel adapters normalize provider reply-window deadline, allowed outbound message/template classes, customer opt-in state and delivery capability. These values are stored with the conversation/channel identity and projected into Inbox before an operator composes a reply. The server revalidates on send, because a visible enabled composer is not authority.

Human takeover is an explicit state machine: requested, queued, assigned, accepted, active, release_pending, resolved, expired/unavailable. While human-controlled, bot replies are suppressed. Resolution/release policy decides whether a new customer event resumes the bot or opens a new handover. Provider outage, reauthorization, rate limit, invalid content, closed window and rejected delivery use distinct error codes and recovery paths (`SOC-*`).

## 15. Integration and action gateway

### 15.1 Common action contract

```text
ActionRequest {
  actionId, tenantId, connectionId, definitionVersion,
  actor(conversation/user/system), idempotencyKey,
  validatedInput, timeout, confirmationPolicy
}
ActionResult {
  status(succeeded|pending|failed|unknown),
  safeOutput, externalReference, attempt, completedAt
}
```

Actions are defined with JSON Schema input/output, allowlisted endpoints/scopes, encrypted credential reference, rate policy, PII classification, retry semantics, and customer-confirmation template. Provider responses are reduced to allowed fields before returning to the model/runtime.

### 15.2 Connector implementations

- **Outbound webhooks:** HMAC signature, timestamp/replay defense, secret rotation, event subscriptions, retry/dead letter, delivery log, manual replay.
- **Google Sheets:** OAuth or approved service identity, spreadsheet/range selection, typed column mapping, append/update strategy, idempotency column, revocation and health.
- **Basic CRM:** contact/lead upsert, summary/outcome note, field mapping, external ID link, conflict/reconciliation queue. Select one provider through ADR/vendor validation.
- **Scheduling:** availability and booking API with Bangkok/customer timezone, hold/confirm behavior, idempotency, cancellation/reschedule when supported.
- **Basic external API:** HTTPS only, SSRF-resistant destination allowlist, schema, secret headers, no arbitrary tenant code, bounded body/time, safe retry.

## 16. Usage, forecast, and cap architecture

### 16.1 Event ledger

Every billable event is append-only and unique by meter plus source idempotency key. Event corrections use reversal/adjustment events. Monthly aggregates are projections, not source truth.

Meters:

- `flow_conversation_started`
- `ai_customer_reply_committed`
- `voice_connected_seconds` and derived `voice_connected_minute`
- resource gauges for bots, topics, admins, workspaces, channels, knowledge, concurrency
- separately tracked provider cost/units and carrier charges

### 16.2 Reservation protocol

For AI/voice allocation:

1. Lock/current-period counter and safety cap.
2. Apply included allowance, oldest eligible pack, then consented overage.
3. Reserve estimated unit/cost with expiry.
4. Allocate provider resource.
5. Finalize actual successful usage or release reservation.

This prevents concurrent requests from exceeding a hard cap (`OVR-006`, `OVR-007`). Flow conversation creation performs a lighter atomic allowance check and follows the approved limit-reached policy.

### 16.3 Forecast and alerts

A scheduled worker calculates simple pace early in a period and weighted recent/day-of-week pace when sufficient history exists. Store method, inputs, confidence band, projected units/cost, and generated time. Threshold state is edge-triggered and deduplicated; material forecast changes can re-alert after a cooldown. UI labels estimates and shows reset/mitigation.

The AI Text trial has an approved deterministic threshold at 100 remaining replies. The usage transaction/outbox creates one threshold event per grant/threshold crossing; notification policy routes it to the account owner's in-app feed and email. Retries use the same event/idempotency key. Flow trial usage remains visible but has no approved 20%-remaining email rule.

### 16.4 Reconciliation

Daily and on-demand jobs compare raw events, aggregates, reservations, pack lots, subscription entitlement, provider usage/cost, voice call records, and billed Stripe quantities. Differences create immutable reconciliation items assigned to an operator; fixes produce adjustments, never edits.

## 17. Stripe billing architecture

### 17.1 Checkout

```text
public or authenticated package selection
 -> server creates opaque purchase_intent with catalogue/promotion snapshot reference
 -> Deploy Bot creates the server-held deployment intent
 -> registration/verification/sign-in attaches the preserved draft to an eligible workspace without trusting browser state
 -> API validates sellable catalogue version, billing permission and tenant eligibility
 -> create/reuse checkout_intent + idempotency key
 -> select server-held annual Stripe Price
 -> apply server-held first-term coupon/discount
 -> create Stripe Checkout Session with opaque local references
 -> redirect
 -> signed webhook durably confirms outcome
 -> provision/reconcile subscription contract and entitlements
```

Use an amount-off coupon for Flow Starter so the charge is exactly THB 2,499; the other plans may use exact fixed or validated percentage terms. Promotion codes are not required from the customer. Return URLs are informational only and cannot provision access.

`purchase_intents` survive registration and checkout expiry but contain no payment authority. They store intended product family/plan, catalogue/promotion versions, originating anonymous correlation, attached user/workspace after verification, selected add-ons, status and expiry. Attaching or consuming an intent requires same-user/workspace eligibility and is audited. One open compatible Checkout Session is reused; unknown create/redirect results are resolved by idempotency key before creating another (`EXP-003` through `EXP-009`).

Before registration, `builder.anonymous_sessions` is keyed only by a 30-day HMAC-authenticated session identity and carries no account or tenant authority. `builder.drafts` exposes one current optimistic revision per session; `builder.draft_revisions` preserves its immutable snapshots. Browser requests never select a draft ID, and the pre-tenant auth runtime resolves the draft only from the verified session. Migration `0107` owns this independent foundation because the approved Owner analytics program reserves `0102`–`0106`. Migration `0108` adds revision-bound website-import jobs with idempotency keys, immutable generation attempts, a three-generation ceiling, cancellation, stale-result rejection, source provenance and a profile digest. Tenant runtime has no direct Builder access. Draft claim is a later atomic registration continuation and cannot be inferred from the cookie alone.

Migration `0123_predeployment_ai_configurations.sql` separates AI configuration identity from installation: `tenancy.ai_agents.product_family` distinguishes Text and Voice before either has a deployment. A complete claimed Builder configuration may create one family-labelled draft agent and one unpublished playbook draft, linked once from its tenant claim. It creates no immutable playbook version, deployment row, key, allowed origin or traffic state. Required bilingual customer copy must be current or complete-but-unreviewed; missing or stale copy fails materialization with audit evidence. Existing deployed Voice agents are backfilled as Voice while all other historical agents remain Text.

The public/tenant checkout review uses a server-calculated quotation read model with exact first-term, renewal, tax behavior, add-on cadence, allowance and exclusions. A quotation has a short expiry and checksum; Checkout creation recalculates and returns a price-changed state requiring renewed confirmation if the catalogue/promotion changed.

### 17.2 Webhook processing

- Verify Stripe signature against raw bytes and accepted secret versions.
- Store event ID, type, created time, API version, payload hash/ciphertext, livemode, account, receive status.
- Acknowledge after durable inbox commit.
- Worker obtains partition lock by customer/subscription/invoice, fetches current provider object when ordering is uncertain, applies transition idempotently, and records handler version/result.
- Required event families cover Checkout Session, Customer, Subscription/Schedule, Invoice, PaymentIntent/Charge, refund, dispute, credit note, and portal-originated changes (`BIL-003` through `BIL-009`).
- A scheduled reconciliation queries active/mutated provider objects and detects missing webhooks.

### 17.3 Subscription state

Maintain provider state and normalized local service state separately. Entitlement is determined by local service state after payment/grace policy, not a raw Stripe status string. Every transition records cause, effective time, source event, previous/new state, and policy version.

### 17.4 Customer Portal

Create short-lived portal sessions server-side for authorized billing managers. Stripe portal configuration allows only approved actions. Portal-return handling refreshes local state but still waits for/reconciles signed events. Plan eligibility, catalogue version, add-on rules, and downgrade preflight remain enforced locally.

### 17.5 Commerce and access experience state

Maintain an explicit customer-safe projection for no checkout, open, expired/abandoned, processing, active, past-due/grace, restricted, cancel-scheduled and ended states. It combines local checkout/subscription/service policy and exposes safe next actions without provider internals. Processing pages poll with bounded backoff and can be closed safely; email/in-app activation follows durable state change. Workspace access never derives from URL/sessionStorage state (`EXP-008`, `ONB-001`).

One Stripe Customer may have compatible Flow, AI Text and Voice contracts. Local subscription contracts remain family/workspace scoped so their entitlement, renewal, cancellation and lifecycle are independent. Same-family upgrades replace/schedule the base contract under the commercial policy rather than stacking duplicate limits.

### 17.6 Trial provisioning

Trials use a separate server-authoritative provisioning command rather than a zero-price paid subscription assumption:

```text
eligible Flow/Text trial selection
 -> opaque trial_intent
 -> account verification and legal acceptance
 -> eligibility + repeat/abuse policy decision
 -> Text card-requirement evidence when applicable
 -> atomic tenant/workspace + Starter trial grant
 -> starts_at and expires_at written in one transaction
 -> onboarding continuation for selected family
```

Flow grants `5,000 flow_conversation_started`; Text grants `500 ai_customer_reply_committed`. Both grant website deployment only for 30 fixed days. Voice rejects trial creation. No job may auto-charge or auto-convert a Text trial until a separately approved commercial/consent design exists.

### 17.7 Five-minute conversation takeover

Conversation ownership is an explicit state machine: `bot_active -> human_active -> bot_active|closed`. The takeover command locks the conversation/session row and verifies tenant permission, channel capability, latest committed bot-response time `< now - 5 minutes` is false, and current owner is still the bot. At exactly five minutes it fails with a customer-safe expired-window result.

While `human_active`, automated replies are suppressed. Merchant messages are stored with a human actor and audited assignment. Release to Flow creates a deterministic return-to-main-menu transition; release to AI creates a new safe continuation boundary with the published agent. Browser timers only display eligibility and never authorize it.

## 18. Invoice, credit-note, and FlowAccount architecture

### 18.1 Immutable finance ledger

At invoice finalization, write a complete local snapshot and cryptographic checksum inside one transaction. A finalized record and lines have no update/delete application permission. Payment state is a separate append-only timeline. Rendered PDF/artifact is content-addressed in a locked/lifecycle-controlled GCS bucket.

Credit notes receive their own sequence, link to the original invoice/lines, and record reason/amount/tax. Corrections create new facts. Database triggers/permissions defend immutability in addition to application rules (`FIN-001` through `FIN-004`).

### 18.2 FlowAccount adapter

Define a provider-neutral `AccountingAdapter` and implement FlowAccount only after its official API/sandbox contract is validated. The mapping layer converts the immutable local invoice/customer/tax model to provider fields without making provider fields the domain model.

```text
finalized local invoice/credit
 -> transactional accounting outbox
 -> FlowAccount adapter with immutable external reference
 -> response mapping + artifact/reference capture
 -> sync state
 -> scheduled remote/local comparison
 -> mismatch queue and reviewed resolution
```

Never regenerate a different financial document silently after provider rejection. Operator correction follows approved credit/replacement procedure. Store request/response metadata with sensitive fields encrypted/redacted and respect vendor rate limits (`FIN-005` through `FIN-008`).

## 19. GCP production topology

### 19.1 Environment/account model

Preferred mature topology is separate GCP projects for shared security/artifacts, staging, and production. Because the current start uses `master-deck-476811-a8`, Terraform MUST encode environment names and prevent staging resources/credentials from being reused as production. Before paid GA, decide whether to migrate production to a dedicated project; separate projects are strongly recommended for IAM, quota, blast radius, and billing controls.

State is stored in a versioned, locked Terraform GCS backend with separate prefixes/buckets and restricted deploy identities. The project guard script must reject the wrong project/account before any apply.

### 19.2 Network and ingress

```text
Cloud DNS djbot.djai.academy
 -> global external Application Load Balancer
    -> Google-managed certificates
    -> Cloud Armor policy/rate controls
    -> URL map:
       public/tenant/master/API/AI paths -> Cloud Run serverless NEGs
       WSS/voice/carrier paths -> Voice gateway NEG
       widget/assets -> backend bucket + Cloud CDN

Cloud Run ingress: internal-and-cloud-load-balancing where externally served
Private services access / VPC connectivity -> Cloud SQL private IP
Private Cloud Run services -> AI gateway/workers/internal API
```

Disable unintentional direct `run.app` access through ingress policy and application host/origin validation. Master UI additionally requires strong operator identity controls. Cloud Armor rules cover common abuse, provider webhook exceptions, and rate policy without breaking WebSockets.

### 19.3 Compute

- Pin images by digest from Artifact Registry.
- Configure per-service CPU/memory, min/max instances, concurrency, timeout, startup probes, health endpoints, service account, egress, and revision labels.
- API and gateways use minimum instances for launch latency according to budget; public/site UIs may scale to zero in staging.
- Voice gateway timeout/reconnect protocol accounts for Cloud Run maximum request duration. Load tests determine concurrency and minimum instances.
- Workers use Cloud Run services for push tasks and Cloud Run Jobs for finite batch/reconciliation/maintenance where appropriate.

### 19.4 Database

- Cloud SQL PostgreSQL 16, private IP, regional HA in production, automated backups, PITR, deletion protection, maintenance window, storage auto-growth/alerts, query insights with PII-safe settings.
- PgBouncer/application pool sizes respect Cloud Run max-instance connection budgets. Each service has a distinct DB role/user secret.
- Read replica is optional after measured reporting load; reporting first uses projections and bounded queries.
- Recovery region uses documented restore-from-backup/PITR procedure; cross-region replica or backup copy is adopted if required to meet RPO/RTO and available in selected tier/region.

### 19.5 Storage and CDN

Separate buckets for widget assets, media, upload quarantine, normalized knowledge, exports, invoice artifacts, and Terraform state. Apply uniform bucket-level access, public-access prevention except CDN backend as designed, CMEK where required, CORS allowlists, object versioning/retention/lifecycle, access logs, and signed URL expiry. Never make tenant uploads generally public.

### 19.6 Secrets and keys

- Secret Manager holds database credentials, session/signing keys, OpenAI, Stripe, channel, carrier, email, CRM, Google, and FlowAccount secrets.
- KMS keys are separated by environment and purpose where warranted; rotation and recovery procedures are tested.
- Cloud Run service accounts receive only required secret versions and services. Human users do not routinely read production secret values.
- Tenant integration secrets are envelope-encrypted with versioned KMS keys and tenant-associated authenticated data.

### 19.7 Queues and schedules

Cloud Tasks queues: outbox dispatch, channel delivery, email, crawl, extraction, embedding/indexing, CRM/Sheets/webhooks, accounting sync, exports, and dead-letter replay. Configure per-provider rate/concurrency/retry. Cloud Scheduler triggers reconciliation, forecasts, knowledge refresh/review reminders, cleanup, retention, health checks, and backup validation through authenticated endpoints/jobs.

### 19.8 Domains

Production target routing:

- `djbot.djai.academy` public product/entry
- `app.djbot.djai.academy` tenant web
- `api.djbot.djai.academy` HTTPS API and provider webhooks
- `voice.djbot.djai.academy` WSS and carrier endpoints
- `widgets.djbot.djai.academy` CDN bundles/assets
- `master.djbot.djai.academy` restricted operator UI

Staging uses matching `*.staging.djbot.djai.academy` names. Exact names remain Terraform variables, but TLS, cookie scope, CORS, CSP, OAuth callbacks, Stripe URLs, social callbacks, and widget origins must be consistent.

## 20. IAM and security architecture

### 20.1 Workload identities

Each Cloud Run service has a separate service account. Invocation relationships are explicit: API can invoke AI gateway; Cloud Tasks can invoke intended worker routes; Scheduler can invoke named jobs; Voice gateway can invoke restricted action/session APIs. Public `allUsers` applies only to required load-balanced entry services, never private services.

CI/CD uses Workload Identity Federation from GitHub, not static service-account keys. Separate plan, deploy-staging, and production-promote permissions. Production requires protected environment approval.

### 20.2 Application controls

- Secure HttpOnly SameSite cookies, CSRF tokens, session rotation/revocation, password hashing, optional/required MFA policy.
- Central authorization policy with tenant role, resource ownership, entitlement, and action context.
- Per-user/tenant/IP/channel rate limiting and abuse controls, with distributed state where necessary.
- Strict CSP, trusted origins, output encoding/sanitization, URL-scheme allowlists, file controls, and webhook signature verification.
- Egress policy/SSRF protection for crawlers/actions; GCP metadata and internal ranges blocked.
- Pseudonymous provider safety identifiers and redacted structured logs.

### 20.3 Threat model priorities

| Threat | Primary mitigations |
| --- | --- |
| Cross-tenant data access | RLS, tenant-scoped object keys/cache, authorization, isolation tests |
| Entitlement/usage bypass | Server checks, atomic reservations, immutable ledger, reconciliation |
| Forged/replayed provider event | Raw signature verification, timestamps, inbox dedupe, secret rotation |
| Prompt/document injection | Trust separation, retrieval filters, strict outputs, action policy, no secret/tool exposure |
| Arbitrary external request/SSRF | Destination allowlist, DNS/IP validation, private range block, schemas/timeouts |
| Account/operator takeover | MFA, least privilege, session controls, audited support/break-glass |
| Invoice/credit tampering | Append-only model, DB permissions/triggers, hashes, sequences, audit |
| Voice abuse/cost exhaustion | Short-lived tokens, origin checks, concurrency/cap reservation, duration limits, anomaly alerts |
| Supply-chain compromise | Lockfiles, provenance/SBOM, secret/dependency/container scanning, signed/pinned images |

## 21. Observability and operations

### 21.1 Telemetry

Use structured JSON logs with environment, service, revision, severity, request/correlation ID, pseudonymous tenant/bot/conversation IDs, route/event, latency, state, and error code. Exclude message bodies, documents, tokens, payment data, and unrestricted PII.

Metrics include traffic/errors/latency/saturation; DB pools/locks/slow queries; queue age/dead letters; provider latency/errors/rate limit/cost; conversation outcomes; WebSocket sessions/reconnects/audio buffer/turn latency; usage reservations/reconciliation; Stripe/FlowAccount sync; ingestion quality; emails; and SLO burn.

Distributed traces propagate W3C trace context through ALB, services, tasks, outboxes, and supported provider calls, sampled with higher retention for errors but redacted.

### 21.2 Dashboards and alerts

- Executive/product: activation, conversations, leads, usage, package health.
- Service SLO: availability, latency, errors, saturation, error-budget burn.
- Voice realtime: connected sessions, concurrency, reconnect, turn latency, disconnect reasons, provider/carrier health.
- Billing/finance: webhook age/failures, subscription mismatches, payment failures, invoice/credit sequence, FlowAccount sync.
- Data/workers: queue age, retry/dead-letter, ingestion/crawl/index, export/retention.
- Security: authentication anomalies, blocked traffic, signature failures, privilege/support access, secret/KMS errors.
- Cost: GCP budget/burn, Cloud Run/SQL/storage/egress, OpenAI usage, carrier cost, margin by plan/meter.

Alerts must be actionable, severity-classified, routed to an owner, deduplicated, and linked to a runbook. Customer-impacting provider failures distinguish DJay Bots fault from external dependency impairment.

### 21.3 Platform Master operational architecture

Platform Master is an operations control plane, not a tenant application with RLS disabled. Its route-based queues call explicitly authorized platform application services that return minimum necessary cross-tenant projections and record sensitive reads/actions.

Required queues/read models:

- Command center customer-impact summary.
- Tenant search and Tenant 360.
- Checkout, provisioning, subscription and entitlement mismatch.
- Usage reservation, pack, overage, cap anomaly and provider-cost/margin attention.
- Invoice/credit/payment/refund/dispute and FlowAccount reconciliation.
- Knowledge/import, channel delivery/reauthorization, Voice/carrier and external integration health.
- Outbox/inbox/task/dead-letter reviewed recovery.
- Support cases/access grants and audit.
- Catalogue/promotion draft review and package/environment release readiness.

Each queue item has stable kind/id, severity, tenant/product/channel scope, safe summary, detected/updated time, owner, state, evidence references, permitted commands and required review/recent-auth policy. Commands dispatch domain operations with idempotency and audit; no screen exposes arbitrary SQL or generic state editing (`PLT-001` through `PLT-010`).

Tenant 360 list/detail projections mask contact/transcript/document/payment data. An authorized sensitive-content read requires purpose and applicable support grant/break-glass authority, creates a separate audit event, and is not cached into broad list/search indexes.

### 21.3A SaaS Owner analytics and merchant-intelligence architecture

`docs/design/djay-bots-saas-owner-analytics-contract.md` is normative for the Platform Master owner-analytics scope (`PLT-011` through `PLT-025`). The architecture realizes that contract through explicitly authorized cross-tenant read models; it does not reuse a tenant repository with RLS disabled and does not turn an analytics table into mutation authority.

The Platform Master route families are:

```text
/operations/overview
/merchants                     /merchants/:tenantId
/users                         /users/:userId
/subscriptions                 /subscriptions/:subscriptionId
/revenue
/usage                         /usage/text  /usage/voice
/models
/trials
/reports                       /alerts
/exports                       /exports/:exportId
```

Operational release, recovery, finance reconciliation, provider control, support and governance routes remain separate. Navigation may group them, but an operational queue cannot silently substitute for an approved analytics route.

#### Source authority and analytical projections

| Subject | Write authority | Owner-analytics projection |
| --- | --- | --- |
| Merchant and memberships | Identity/tenancy domain | Merchant directory, user directory and Tenant 360 identity projection |
| Subscription and entitlement | Commerce domain plus reconciled billing-provider events | Subscription lifecycle fact and current-state projection |
| Invoice/payment/refund | Immutable finance evidence plus billing-provider reconciliation | Revenue movement and collection facts |
| Text entitlement usage | Committed DJBOT reply ledger | Customer meter facts |
| Text native usage/cost | AI gateway result plus provider reconciliation | Token/request/model/cost facts |
| Voice entitlement usage | Finalized voice-session settlement | Exact-second and billable-minute facts |
| Voice native usage/cost | Voice gateway/carrier results plus reconciliation | Audio/text/model/carrier/cost facts |
| Deployment and activity | Product deployment/runtime domains | Activation, funnel and health facts |
| Support/incidents | Support and incident domains | Masked risk and attention projections |

Analytics facts use immutable event IDs, tenant scope, occurred time in UTC, source kind/reference, ingestion time and reconciliation status. Correction appends a reversal/adjustment or superseding fact; it does not destructively rewrite financial or usage history.

Each cost-bearing provider fact also pins capability, provider, model, route-policy version, native unit dimensions, currency, unit-price snapshot and estimated/reconciled status. A later model or price change affects only later facts. Native token categories that the provider does not report remain null/`not_reported` rather than being estimated as observed facts.

#### Commercial and internal meters

Customer entitlements and provider economics are deliberately different ledgers:

```text
Text:  committed AI replies  != provider input/output/cached/reasoning tokens
Voice: customer billable minutes != exact connected seconds/audio units/provider cost
```

Quota enforcement and customer billing read the immutable commercial meter version. Cost and margin analytics read native provider/carrier facts. Reconciliation relates the two by tenant, deployment, conversation/session, reservation and settlement identifiers without changing either definition.

#### Revenue movement model

Recurring analytics use an immutable daily subscription-contract snapshot plus explicit MRR movements: `new`, `expansion`, `contraction`, `reactivation` and `churn`. Trials, one-time setup fees, tax and uninvoiced variable usage do not enter MRR. ARR is derived from MRR and is not presented as statutory recognized revenue.

Invoice, collection, refund, credit and chargeback facts remain separate. Money is stored in integer minor units with ISO currency. Cross-currency totals require an approved exchange-rate source, rate timestamp and visible conversion basis; otherwise results remain grouped by currency.

Owner Overview derives its `Net revenue` chart from the `net_collected` metric key. The read model supplies immutable daily buckets by reporting date and monthly buckets by reporting month, currency, definition version and reporting timezone. Daily and monthly responses carry comparison basis, source watermark and reconciliation state. The API never accepts a browser-computed aggregate and never combines currencies without an approved conversion fact.

#### Query, filter and pagination contract

Merchant, user, subscription and export queries use one validated server-side filter language with an allowlisted field/operator map, stable cursor pagination and deterministic tie-breaking. User Detail membership pagination accepts an allowlisted page size including 100 and returns merchant name, company role, membership state, membership first-join date, merchant subscription start and expiry/access-end dates, subscribed products and effective access from identity/tenancy plus subscription projections. The DTO keeps membership facts separate from merchant-owned subscription facts. A separate Owner-only User Detail contact projection reads the complete lawfully stored full name, primary email and verification state, telephone and personal contact or mailing address directly from identity authority. It requires recent assurance, purpose and immutable audit and is never materialized into general analytics facts. Search indexes contain only approved directory fields and masked/pseudonymous operational dimensions. Filters are serialized into canonical URL state and the exact canonical filter snapshot is stored with saved views, reports and exports.

The browser never receives an unbounded cross-tenant collection. Aggregates use incremental/rebuildable read models or bounded warehouse-style tables inside the approved data boundary. Source-to-projection lag, last successful refresh and reconciliation state accompany every response.

#### Export execution

Cross-tenant exports are jobs, not direct browser dumps. The API validates role, recent assurance, purpose, filters, column allowlist, expected scope and idempotency key; the worker reads through a dedicated least-privilege export service, neutralizes spreadsheet formulas, writes encrypted UTF-8 CSV or JSON, and issues a single-purpose short-lived download grant. Export request, generation, download, expiry, revocation and deletion are audited.

Passwords, password hashes, sessions, one-time tokens, MFA seeds, payment credentials, API/provider secrets and encryption material are structurally absent from export DTOs. End-customer contacts/content are absent from ordinary owner analytics exports. Privacy-rights exports remain a separate identity-verified workflow.

#### Authorization and privacy

Platform Owner, Finance, AI Operations and Support receive different projections rather than one response hidden by client-side controls. Finance receives commercial identity and finance/aggregated usage data; AI Operations receives provider/model quality and economics with pseudonymous tenant identity by default; Support receives the merchant directory and masked Tenant 360. Sensitive tenant access requires the approved support/break-glass grant, purpose, recent assurance and an audit event.

Provider/model identities remain forbidden in tenant/public DTOs, merchant exports, invoices, notifications and customer errors. SaaS users and merchant end customers remain different data subjects and indexes (`PLT-019`, `PLT-022`).

#### Data quality, retention and failure behavior

Every metric response includes period, reporting timezone, currency basis, denominator where applicable, source freshness and reconciliation status. `zero`, `empty`, `delayed`, `unavailable` and `reconciliation_required` are different states. A projection failure does not fall back to stale unlabelled data or a fabricated zero.

Read models are rebuildable and retain personal detail no longer than source policy permits. Legal hold and source erasure propagate through rebuild/tombstone rules. Scheduled reconciliation detects orphan facts, duplicate source IDs, local/provider mismatch, missing price snapshots, negative impossible totals and late-arriving events before a metric is marked complete.

### 21.4 Customer notification and activity architecture

Domain events feed a tenant-scoped notification policy service. It creates a durable in-app activity/notification record and optional email delivery through the transactional outbox. Deduplication keys include tenant, recipient, event kind, subject and threshold/version; resolution events close obsolete notifications.

Notifications carry severity, category, safe localized title/body arguments, affected object deep link, action deadline, authoritative source state and delivery preferences. Templates never receive raw provider/model identifiers. Mandatory legal/security/billing communications bypass optional marketing preferences but still follow approved channel/retention rules (`NOT-*`, `PLT-010`).

Checkout, subscription, onboarding, deployment/channel/integration, handover/action, usage/cap, finance, privacy, support access and incident events must all have defined notification policies and tests. Email delivery failure does not roll back the business event; it remains visible for operator/customer recovery.

### 21.5 Professional services and support operations

Model professional setup independently from recurring product entitlements:

```text
service_requests -> quotations/SOW versions -> service_orders
  -> milestones/customer_inputs -> access_grants -> deliverables
  -> customer_acceptance -> handoff/closed
```

The service order snapshots selected offering/starting price, negotiated scope, exclusions, commercial terms, target dates, acceptance criteria and linked payment/order. Milestones and secure customer-input requests have named owners and status history. Deliverables reference tenant bot/knowledge/integration/deployment revisions rather than copying configuration into an unaudited project record.

Professional-services access uses the same scoped, time-limited, visible and audited grant infrastructure as support, with a distinct purpose and permissions. Publication or production activation remains a tenant-owner/admin action unless the accepted SOW grants a specific reviewed command. Completion records evidence, customer acceptance, unresolved items and ownership handoff (`PRO-001` through `PRO-003`, `PLT-008`, `PLT-009`).

Standard/Priority support entitlement feeds routing priority and internal service policy. Because the offer contains no numerical response SLA, no customer UI/API/email may generate a guaranteed time until an approved catalogue/service-policy version supplies one.

## 22. Reliability, backup, and disaster recovery

### 22.1 Failure handling

- Circuit breakers and bounded retries for OpenAI, Stripe reads, social send, CRM, Sheets, email, carrier, and FlowAccount.
- Retry only idempotent/safely keyed actions; unknown external outcomes enter reconciliation instead of blind retry.
- Dead letters require reviewed recovery with payload reference, cause, attempts, operator action, and resulting audit.
- Graceful degradation: Flow remains available during AI outage; existing bots remain published during builder/ingestion failure; billing inbox preserves events during worker failure; voice offers configured fallback during provider/carrier failure.

### 22.2 Backups

- Automated Cloud SQL backups and PITR with retention matching approved policy.
- Scheduled logical/schema verification and restoration into isolated recovery environment.
- GCS versioning/retention for critical immutable artifacts; lifecycle for temporary/PII exports.
- Terraform state versioning and infrastructure configuration in Git.
- Provider configuration/mappings stored locally enough to reconstruct integrations without storing prohibited credentials in backups.

### 22.3 Recovery

Document and drill:

1. Accidental row/data corruption via PITR.
2. Primary database instance/zone failure.
3. Region-level recovery to Singapore, including Cloud SQL restore, secret/key access, images, buckets, service deployment, DNS/traffic switch, and provider callback changes.
4. Stripe webhook backlog replay and reconciliation after recovery.
5. Voice/social degradation while callback endpoints change.
6. Return to primary and prevent split-brain writes.

Quarterly production-like restore tests must record achieved RPO/RTO and corrective work. Backups are not considered valid without successful restoration.

## 23. CI/CD and release engineering

### 23.1 Pull request pipeline

1. Format/lint/typecheck/unit tests.
2. Database migration static checks and RLS/role tests.
3. Integration/contract tests with PostgreSQL and provider test doubles.
4. Build all apps/widgets/images; generate SBOM; dependency, license, secret, SAST and container scans.
5. Terraform fmt/validate/lint/security scan and plan for staging.
6. Package/requirement traceability check and release-artifact verification.

### 23.2 Deployment pipeline

- Merge produces immutable, signed/versioned images and widget bundle with commit/build metadata.
- Apply backward-compatible migrations with dedicated migration identity and advisory lock.
- Deploy staging by digest, run smoke/E2E/provider-sandbox tests, then promote the same digest to production after approval.
- Cloud Run traffic shifts gradually for API/gateways where feasible; monitor SLOs and business events.
- Widget manifests support current and prior immutable versions; rollback changes manifest/API compatibility without overwriting assets.
- Production database rollback uses forward corrective migration. Destructive migrations require expand/migrate/contract across releases.

### 23.3 Configuration

Non-secret configuration is versioned and validated per environment. Secret presence is checked without printing values. Feature/package sellability flags are operational rollout controls, not substitutes for entitlements. All provider live/test modes must be environment-locked.

## 24. Testing strategy

### 24.1 Test layers

- **Unit/property:** entitlement algebra, catalogue prices, graph validation/execution, meter rounding/dedupe, forecasts, invoice totals/sequences, state transitions, schema validation.
- **Database:** migrations, constraints, immutability, RLS isolation, role permissions, concurrency reservations, outbox/inbox idempotency.
- **Contract:** OpenAI structured/realtime events, Stripe API/webhooks, LINE/Meta, carrier, Sheets, CRM, FlowAccount, email, GCS/Tasks payloads using pinned fixtures and sandboxes.
- **Integration:** API plus PostgreSQL/workers/gateways; checkout-to-provision; ingestion-to-answer; channel-to-runtime-to-delivery; voice finalize-to-usage; invoice-to-accounting.
- **E2E:** all personas and six package journeys on desktop/mobile, including denied limits, upgrades/downgrades, failure and recovery.
- **Lifecycle E2E:** anonymous selection through verification/checkout, unsubscribed workspace, checkout processing/expiry/recovery, active onboarding, independent multi-product lifecycle, past due/grace/restriction/cancellation/end and resubscription.
- **Channel experience:** installed host-site widgets including multi-product launcher, real social reply-window/handover behavior, and real inbound telephone disclosure/action/transfer/fallback.
- **Operator E2E:** Platform queue/Tenant 360 recovery for provisioning, subscription, usage/cap, invoice/credit, FlowAccount, provider/channel, dead letter, support access and release evidence without direct data editing.
- **Quality:** Thai/English/additional-language golden conversation sets, knowledge grounding, CTA/action truthfulness, speech recognition/pronunciation, latency, refusal/escalation.
- **Non-functional:** load, spike, soak, WebSocket reconnect, queue backlog, dependency outage, restore, regional recovery, accessibility, security/penetration.

### 24.2 Executable offer matrix

Create `requirements/market-release-v1.yaml` as the machine-readable derivative of the PRD. Each feature entry contains PRD ID, package, value/limit, enforcement point, UI surface, test IDs, telemetry, and release evidence link. CI fails if a sellable package has a missing required test/evidence status. The YAML derives from this PRD and cannot override it.

### 24.3 Required negative tests

- Starter cannot create Advanced resources or remove branding without add-on.
- Limits remain correct under concurrent creates/turns/sessions.
- Tenant A cannot infer/read/mutate Tenant B via IDs, exports, search, objects, queues, caches, or provider callbacks.
- Browser cannot choose arbitrary Stripe Price, promotion, tenant, usage, provider, or external action.
- Duplicate/reordered webhooks/messages/tasks do not duplicate service, usage, invoices, rows, transfers, or actions.
- Model/document content cannot invoke unapproved actions or claim false success.
- Cap reached cannot allocate billable AI/voice capacity.
- Finalized invoices/credits cannot be updated/deleted by application or operator UI.

## 25. Implementation roadmap

The order is dependency-driven. Packages become sellable independently only after their complete gate passes; scope remains committed.

### Phase 0: requirement and architecture control

Deliverables:

- Approve PRD and this architecture.
- Approve `docs/design/djay-bots-v1-ui-ux-and-user-flows.md`, route inventory, lifecycle vocabulary and role/task matrix.
- Add executable offer manifest and PRD traceability in tests.
- Record ADRs for catalogue versioning, meters/overages, vector store, telephony provider, CRM, accounting integration, additional languages, and environment/project isolation.
- Establish release evidence index and risk register.

Exit: every offer item has a PRD ID, component owner, acceptance case, dependency, and release status.

### Phase 1: commercial and entitlement foundation

Implement catalogue/promotions/prices, purchase/checkout intents, contract snapshots, resource entitlements, anniversary monthly periods, add-ons, packs, subscriptions, downgrade preflight, usage reservations, forecasts/alerts/caps, billing permission, lifecycle projections, and public/tenant/Platform commerce UI. Seed exact values from PRD Section 6.

Exit: anonymous selection through active/unsubscribed/processing workspace states works; all six plans can be provisioned in test mode with exact allowed/denied behavior and meter concurrency tests.

### Phase 2: Flow completion

Implement the shared onboarding coordinator and Flow route structure, then rich content/CTAs/cards/carousels/menus/video, advanced conditions, tags/attributes, qualification/quotation/appointment/booking/order nodes, department handover, deterministic LINE/Meta dispatch, Sheets/webhooks/external API, templates, website manifest/install verification, exports and analytics.

Exit: `FLS-*` and `FLA-*` acceptance on web and real provider sandboxes/dev accounts, including no AI-meter usage.

### Phase 3: AI Text and knowledge completion

Implement AI onboarding/route structure, quarantine/extraction/crawl/index/revision pipeline, structured product/service catalogues, strict Responses Structured Outputs, typed CTAs/actions, configurable confidence, language validation, tags/segments/scores, summaries, routing, Sheets/webhooks/CRM, website/social experience, exports/reports, and refresh/review schedules.

Exit: `AIT-*`, `KNO-*`, `ATS-*`, and `ATA-*` acceptance with grounded quality suites and live restricted provider route.

### Phase 4: Voice and telephony completion

Implement Voice onboarding/route structure, productionize Realtime adapter and gateway, reconnect/concurrency/metering, website Voice states, transcripts/summaries/outcomes, Thai/English quality, then add selected carrier, inbound numbers, CDR reconciliation, live/department transfer, scheduling, callback, additional languages, sentiment indicators, Sheets/webhooks/CRM, and reports.

Exit: `VOI-*`, `VOS-*`, and `VOA-*` acceptance through web and real telephone calls, failover/fallback, carrier cost itemization, and load/soak tests.

### Phase 5: billing, finance, and accounting

Complete authenticated Checkout/Portal and billing lifecycle surfaces, exact first-term discounts, webhook state application, durable mappings/reconciliation, invoices/credits, Thai tax data, FlowAccount adapter/outbox/reconciliation, refunds/disputes, add-on/pack billing, overage invoicing, dunning, notifications, Platform exception queues and finance UI.

Exit: complete test-mode lifecycle plus FlowAccount sandbox/approved validation, immutable-ledger tests, accountant/legal sign-off, and reconciliation drills.

### Phase 6: GCP staging productionization

Provision service accounts, network/private Cloud SQL, buckets/CDN, tasks/schedules, secrets/KMS, Cloud Run/ALB/Armor, DNS/TLS, monitoring, budget/cost, backups, deploy workflow, and all staging provider callbacks. Seed no production secrets into Terraform state.

Exit: all packages pass E2E and non-functional gates on `*.staging.djbot.djai.academy`.

### Phase 7: production and controlled GA

Provision isolated production environment/project decision, live providers, merchant/email/social/carrier/accounting approvals, quotas, DNS, restore/recovery, security tests, support/on-call, status/incident process, design partners, real low-value payments and conversations, then package-by-package sign-off.

Exit: PRD Gate D evidence and product-owner sellability approval for each released package.

## 26. Workstreams and ownership

| Workstream | Accountable role | Required collaborators |
| --- | --- | --- |
| Catalogue/product rules | Product owner | Engineering, finance, support, legal/accounting |
| Tenant/security/data | Backend/security lead | Frontend, operations, privacy |
| Flow experience | Flow product/engineering | Design, channel/integration QA |
| AI/knowledge | AI engineering | Product, security, Thai-language QA |
| Voice/telephony | Voice engineering | Carrier, product, security, Thai-language QA |
| Billing/finance | Billing engineering | Finance, accountant/legal, Stripe/FlowAccount |
| GCP/SRE | Platform engineering | Security, all service owners |
| Release quality | QA/release owner | Every workstream and product owner |

One person may hold multiple roles initially, but every release gate needs a named accountable owner and evidence reviewer.

## 27. Capacity and cost plan

- Derive worst-case monthly requests from published allowances and model realistic peak concurrency, not uniform averages.
- Benchmark Flow at tenant hotspots up to the 100,000-conversation plan and AI at 10,000 replies, including social bursts.
- Benchmark voice at two sessions per Advanced tenant plus platform concurrency; measure CPU, memory, egress, provider limits, and reconnect behavior.
- Put maximum Cloud Run instances and queue rates below unapproved cost/quota ceilings while preserving documented overload behavior.
- Track gross margin by plan using OpenAI tokens/audio, carrier minutes, Cloud Run, SQL, storage, CDN/egress, email, and support allocations.
- Alert when forecast provider cost, GCP budget, or plan-level unit economics exceed approved thresholds. The initial GCP project budget alert remains approximately USD 20/THB 670 during foundation work, but production needs workload-based budgets and cannot rely on that cap alone.
- Load tests determine Cloud SQL tier, pool sizes, minimum instances, queue rates, CDN policy, and vector-index choice before GA.

## 28. Architecture decisions still required

Create/approve ADRs before their implementation becomes production-critical:

1. Immutable catalogue/contract and promotion representation.
2. Meter period, voice rounding, pack expiry/ordering, overage consent, cap minimum, and downgrade policy.
3. PostgreSQL vector versus managed vector service after measured load.
4. File scanning/extraction stack and supported file limits.
5. Initial Thai telephony/SIP carrier and transfer topology.
6. First basic CRM connector.
7. Additional Text/Voice language launch list and quality threshold.
8. FlowAccount API contract, local numbering authority, and tax document workflow.
9. Separate GCP production project and recovery data topology.
10. MFA rollout, audio retention default, transcript/lead/document retention, and support access policy.
11. Stripe proration, add-on cadence, refunds, dunning/grace, and dispute suspension.

## 29. Definition of done

A requirement or phase is not complete until all applicable items are true:

- Domain behavior and error/failure behavior implemented.
- Database migration, constraints, RLS, roles, retention, and backfill complete.
- Tenant, customer, operator, billing/finance, and support UI complete.
- Entitlement, usage, audit, notification, and analytics hooks complete.
- Provider sandbox/live contract validated where applicable.
- Unit, integration, contract, E2E, negative, accessibility, security, and load tests pass at risk-appropriate depth.
- Dashboards, alerts, runbook, dead-letter/reconciliation and recovery procedure exist and are exercised.
- PRD requirement and release evidence index updated.
- Product owner accepts the advertised behavior; finance/legal/security/operations accept their gates.
- No secrets or tenant data in source, build artifacts, logs, Terraform state, or test fixtures.

## 30. Requirement-to-component traceability

| PRD area | Primary components | Production evidence |
| --- | --- | --- |
| `COM-*`, `MET-*`, `ADD-*` | Catalogue, entitlements, usage billing, tenant/billing UI | Exact-price tests, entitlement matrix, concurrency/reconciliation tests |
| `IDN-*`, `TEN-*`, `SEC-*` | API auth, PostgreSQL RLS/roles, audit, Secret Manager/KMS | Isolation/security tests, IAM review, audit evidence |
| `BOT-*`, `LEAD-*`, `NOT-*`, `SUP-*` | API/domain, tenant web, workers, notifications, master UI | Cross-persona E2E, delivery/dead-letter/support tests |
| `FLS-*`, `FLA-*` | Flow domain/engine/widget, channel adapters, action gateway | Web/social package suites and deterministic meter proof |
| `AIT-*`, `KNO-*`, `ATS-*`, `ATA-*` | Knowledge pipeline, sales core, AI gateway/widget, integrations | Ingestion, grounding/language, schema/action, social/report suites |
| `VOI-*`, `VOS-*`, `VOA-*` | Voice widget/gateway/runtime, telephony adapter, integrations | Real web/phone, transfer/scheduling, meter/load/failure suites |
| `CHN-*`, `INT-*` | Channel adapters, action gateway, connector workers | Signature/dedupe, capability fallback, provider sandbox/reconciliation |
| `BIL-*` | Stripe adapter, checkout/portal API/UI, webhook inbox/workers | Full lifecycle, reorder/replay, subscription reconciliation |
| `FIN-*` | Finance domain, GCS artifacts, FlowAccount adapter, master UI | Immutability, numbering, sandbox sync/mismatch, accountant acceptance |
| `OVR-*`, `ANA-*` | Usage ledger/reservations/forecast, reports/notifications | Cap race, alert/forecast, aggregate/raw/provider reconciliation |
| `PRO-*` | Professional-services orders/SOWs, support access, audit, tenant handoff | Scope/consent/acceptance workflow and audited delivery record |
| `REL-*`, `UX-*` | All services, GCP/SRE, frontend/widgets | SLO/load/DR/accessibility evidence |
| `EXP-*` | Public catalogue, purchase/checkout intents, registration continuation, commerce projection | Anonymous-to-active, abandoned/processing/failure and unsubscribed-workspace journeys |
| `ONB-*`, `OPS-*` | Onboarding coordinator/evidence, lifecycle projections, tenant application read models | Per-product and multi-product activation plus daily-operation E2E |
| `WEB-*` | Widget loader/manifest, install checks, Flow/Text/Voice widget runtimes | Host integration, multi-product entry, accessibility, recovery and provider-confidential failure tests |
| `SOC-*`, `TEL-*` | Channel adapters, Inbox/handover, Voice/telephony gateways | Real social reply-window and telephone disclosure/action/transfer/fallback evidence |
| `PLT-*` | Platform application services, queues, Tenant 360, notification/recovery workers | Role-restricted exception recovery, sensitive-read audit and no-direct-edit evidence |

## 31. Channel Connection Framework (merchant onboarding)

Full design: `docs/superpowers/specs/2026-07-26-omnichannel-onboarding-design.md`.

Connecting a merchant-owned external account (Facebook Page, Instagram, WhatsApp number, LINE Official Account) to a bot is **one problem with three acquisition modes**. Only the acquisition layer varies; the connection store, webhook routing, runtime, delivery, inbox, usage, and billing are indifferent to how a credential was obtained.

| Mode | Channels | Merchant experience | Availability gate |
| --- | --- | --- | --- |
| `oauth_provider` | Messenger, Instagram, WhatsApp | Consent dialog → asset picker | Meta App Review (open rail; queue) |
| `partner_attach` | LINE | Consent → OA picker | LINE module channel (closed rail; corporate application) |
| `assisted_handoff` | any | Copy two values the merchant already has; platform does the rest | none — available today |

`assisted_handoff` is a permanent component, not a stopgap: it is the fallback for agency-controlled accounts, merchants unable to complete a consent flow, and any channel whose rail is unavailable or revoked.

**LINE credential model (decisive).** The merchant supplies **Channel ID + Channel Secret only** — both visible in LINE OA Manager, the interface they already use. The platform mints channel access tokens server-side via `POST /oauth2/v3/token` (`client_credentials`, 15-minute stateless, unlimited issuance; `POST /v2/oauth/accessToken` as a 30-day fallback), then sets the webhook with `PUT /v2/bot/channel/webhook/endpoint` and proves reachability with `POST /v2/bot/channel/webhook/test`. **The merchant never opens the LINE Developers Console** and never needs a Developers Console Admin role (`CHN-012`). Minted tokens are never persisted; only the Channel Secret — already required for `x-line-signature` verification — is sealed at rest.

### 31.0 Product × channel matrix (normative)

Voice is **not** a social-messaging channel: LINE, Messenger, Instagram, and WhatsApp Messaging APIs carry text and media, not real-time voice (`CHN-014`).

| | Website | LINE | Messenger | Instagram | WhatsApp | Telephony |
| --- | --- | --- | --- | --- | --- | --- |
| Flow Bot | yes | yes | yes | planned | planned | n/a |
| AI Text Bot | yes | yes | yes | planned | yes | n/a |
| AI Voice Bot | yes | n/a | n/a | n/a | n/a | planned |

### 31.1 Component boundaries

- `packages/meta-connect` — Meta OAuth, signed state, token exchange, asset enumeration (Pages, Instagram, WhatsApp numbers), `subscribed_apps`, webhook signature and `signed_request` verification. Pure, DB-free, fetch-injectable.
- `packages/line-connect` — LINE module attach (PKCE authorization, `POST /module/auth/v1/token`, `GET /v2/bot/list`, detach). Deferred until LINE approval; same house style.
- `packages/channel-onboarding` — mode-agnostic orchestration shared by FlowBot and AI Chat: acquisition-session issuance/consumption, credential verification, connection creation, post-connect health verification, merchant-facing status vocabulary.

### 31.2 Routing

| Mode | Webhook URL | Routing key |
| --- | --- | --- |
| `assisted_handoff` | per-connection `/public/{product}/social/{channel}/{webhookKey}` | URL path |
| `oauth_provider` | shared `/public/meta/webhook` | Page / Instagram / phone-number ID from `entry[].id` |
| `partner_attach` | shared `/public/line/webhook` | `destination` (bot userId) in payload |

Shared-webhook modes resolve routing key → tenant + connection from an unauthenticated endpoint via SECURITY-DEFINER functions (`flow_social_connection_by_routing_key`, `ai_social_connection_by_routing_key`), mirroring the existing `flow_social_runtime_connection` pattern. Connection tables gain `acquisition_mode` and a nullable `routing_key` unique per `(channel, routing_key)`.

`tenancy.channel_acquisition_sessions` generalises `meta_oauth_sessions`: encrypted staged assets, single-use nonce consumed via `DELETE … RETURNING`, forced RLS, TTL of 10 minutes (OAuth) or 72 hours (assisted links).

### 31.3 Invariants

- Provider credentials never reach the browser in any mode; only display metadata is returned to the asset/OA picker.
- Assisted setup links are capability URLs: single-use, TTL-bound, scoped to one tenant+bot+channel, operator-revocable, fully audited, and authorised **only** to attach a connection — never to read tenant data.
- Meta webhook signature verification reads the untouched raw body (`request.arrayBuffer()`); any re-serialisation silently breaks the HMAC.
- Every onboarding failure names the specific condition the merchant must change; a connection becomes `active` only after end-to-end reachability has been proven, not merely configured.

## 32. Authoritative technical references

- Approved experience contract: `docs/design/djay-bots-approved-experience-contract.md`
- Approved clickable visual reference: `docs/design/djay-bot-text-voice-configuration-flow.html`

- OpenAI Structured Outputs: <https://developers.openai.com/api/docs/guides/structured-outputs>
- OpenAI Realtime API: <https://developers.openai.com/api/docs/guides/realtime>
- Stripe Checkout subscriptions: <https://docs.stripe.com/payments/checkout/build-subscriptions>
- Stripe subscription discounts: <https://docs.stripe.com/billing/subscriptions/coupons>
- Stripe Customer Portal: <https://docs.stripe.com/customer-management/configure-portal>
- Google Cloud Run WebSockets: <https://cloud.google.com/run/docs/triggering/websockets>
- Google Cloud Run ingress: <https://cloud.google.com/run/docs/securing/ingress>
- Google Cloud Run container contract: <https://cloud.google.com/run/docs/container-contract>
- Cloud Tasks with private Cloud Run services: <https://cloud.google.com/run/docs/triggering/using-tasks>
- Cloud SQL private IP: <https://cloud.google.com/sql/docs/postgres/configure-private-ip>
- Cloud SQL backup and recovery: <https://cloud.google.com/sql/docs/postgres/backup-recovery/backups>
- LINE OpenAPI specifications (authoritative field/enum reference): <https://github.com/line/line-openapi>
- LINE module channel (attach flow, partner-gated): <https://developers.line.biz/en/docs/partner-docs/module/>
- Facebook Login for Business: <https://developers.facebook.com/docs/facebook-login/facebook-login-for-business>

Provider-specific implementation must be revalidated against current official documentation and contracted account capabilities at implementation time. FlowAccount and the selected telephony/CRM providers require official sandbox/API validation before their adapter contracts are finalized.
