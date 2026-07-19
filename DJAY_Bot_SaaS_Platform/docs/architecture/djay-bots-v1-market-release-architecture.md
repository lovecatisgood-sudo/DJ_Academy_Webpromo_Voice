# DJay Bots V1 Market Release Architecture Plan

| Field | Value |
| --- | --- |
| Status | Target architecture for implementation and production release |
| Date | 2026-07-18 |
| Product authority | `docs/product/djay-bots-v1-market-release-prd.md` |
| Experience authority | `docs/design/djay-bots-v1-ui-ux-and-user-flows.md` |
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
- **Purchase journey:** server-held purchase intent, registration/verification continuation, checkout intent and authoritative return state (`EXP-003` through `EXP-009`).
- **Workspace portfolio:** account/commerce state plus independent lifecycle projection for every subscribed product family (`ONB-010`, `OPS-001`).
- **Onboarding coordinator:** shared prerequisites, per-product steps, authoritative evidence, blockers and next allowed action (`ONB-001` through `ONB-012`).
- **Operational command views:** inbox/customer/lead/action, product health, usage/billing and attention queues (`OPS-*`).
- **Platform operations views:** cross-tenant queues and Tenant 360 with role-specific projections and masked sensitive fields (`PLT-*`).
- **Widget manifest:** product-neutral public configuration, theme, allowed modes, disclosure, fallback and session endpoints (`WEB-*`).

These are projections over domain truth, not new systems of record. Projection freshness and source state are returned explicitly so a failed secondary panel cannot become a false zero/healthy state.

### 6.2 Information architecture and route ownership

Implement the route inventory in `docs/design/djay-bots-v1-ui-ux-and-user-flows.md` incrementally. Public acquisition, checkout return, workspace Overview, Billing/Usage, product onboarding, Inbox, and Platform exception queues are P0. Large existing single-page Studios must be split behind stable product context without duplicating domain fetch/mutation code.

Route guards resolve session, selected workspace, role, entitlement and resource before rendering. Deep links preserve the intended task through same-origin validated continuation paths. Mobile stacked routes and desktop split panes share the same server action/read contracts.

The authorization model must add a billing-management job boundary. It may initially be a permission bundle on owner/admin, but purchase, tax, payment, overage/cap, plan-change and cancellation endpoints require explicit billing permissions and recent authentication independently of navigation visibility.

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
| Experience lifecycle | purchase intents, registration continuations, product lifecycle projections, onboarding definitions/evidence/blockers, install checks, customer notification/activity records |
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

Evidence examples are verified profile, notification/handover destination, disclosure/retention policy, usage protection, current published revision, current-version test, deployment install/channel/two-way/telephone test, and live health. Evidence invalidates when its subject changes: a test against version 4 does not prove version 5; a revoked deployment does not remain launch evidence.

The onboarding coordinator returns plan- and product-specific step definitions with status, required permissions, allowed actions and deep links. The browser cannot mark a step complete. Shared evidence is referenced across products, while publication, test, deployment and live health remain family/bot specific (`ONB-*`).

Product lifecycle is a projection, not a single writable enum. It combines subscription access, configuration, tests, deployments and health into the experience labels specified by the UI/UX plan. A projection worker/outbox refresh handles asynchronous changes; high-value launch/admission actions calculate authoritative prerequisites transactionally instead of trusting projection freshness.

## 10. Flow Bot architecture

### 10.1 Authoring and publication

- Extend the graph schema with typed rich-content nodes, CTA nodes, form fields, customer tag/attribute mutations, qualification, quotation/booking/order request, department routing, Sheets/webhook/API action nodes, and advanced conditions.
- Validate graph reachability, missing targets, cycles requiring explicit bounded loops, field types, secret/action references, topic count, payload size, channel capability, and entitlements.
- Save immutable revisions. Draft changes use optimistic concurrency. Publication transactionally sets one active revision and emits cache-invalidation/CDN events.
- Templates are copied into a tenant draft with source/version attribution; later template changes do not mutate published tenant flows.

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

### 16.4 Reconciliation

Daily and on-demand jobs compare raw events, aggregates, reservations, pack lots, subscription entitlement, provider usage/cost, voice call records, and billed Stripe quantities. Differences create immutable reconciliation items assigned to an operator; fixes produce adjustments, never edits.

## 17. Stripe billing architecture

### 17.1 Checkout

```text
public or authenticated package selection
 -> server creates opaque purchase_intent with catalogue/promotion snapshot reference
 -> registration/verification/sign-in attaches an eligible workspace without trusting browser state
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

## 31. Authoritative technical references

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

Provider-specific implementation must be revalidated against current official documentation and contracted account capabilities at implementation time. FlowAccount and the selected telephony/CRM providers require official sandbox/API validation before their adapter contracts are finalized.
