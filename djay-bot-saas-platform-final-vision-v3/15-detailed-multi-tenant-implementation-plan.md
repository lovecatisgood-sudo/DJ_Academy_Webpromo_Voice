# 15 - Detailed Multi-Tenant Implementation Plan - DJAY Bot SaaS Platform v3.0

## 1. Purpose and authority

This document converts the final vision into an implementation program for a multi-tenant SaaS serving many independent SME subscribers.

It operationalizes the higher-authority decision, package, PRD, domain, architecture, security and QA documents. It does not override them. If a conflict is found, stop implementation, resolve the conflict in the higher-authority documents and update this plan before continuing.

The implementation must deliver three product families with two subscription tiers each:

1. FlowBot Basic and FlowBot Premium;
2. AI Chatbot Basic and AI Chatbot Premium;
3. Voice Agent Basic and Voice Agent Advanced.

These are six plans, not six separate codebases. They share one SaaS identity, tenancy, billing, entitlement, contact, conversation, lead, inbox, knowledge, action, analytics and audit platform.

## 2. Locked terminology

### 2.1 Platform realm

The **Platform Master Dashboard** is the private DJAY internal application.

Authorized platform roles include:

- `platform_owner`;
- `platform_ai_operations`;
- `platform_operations`;
- `platform_finance`;
- limited audited support roles.

Only `platform_owner` and explicitly delegated `platform_ai_operations` permissions may view or change AI provider, model, capability-profile and routing configuration.

### 2.2 Tenant realm

A **tenant** is one subscribing SME workspace.

The **Tenant Master Admin** is the subscriber's primary owner account. It is created through registration on the public DJAY Bot SaaS site, not by creating credentials in another admin system.

Tenant roles are:

- `tenant_master_admin`;
- `tenant_admin`;
- `sales_agent`;
- `analyst_viewer`.

Tenant Master Admin is not a platform role. It cannot view or configure AI provider names, model IDs, model routing, raw provider costs or platform credentials.

### 2.3 Ownership invariants

- Every active tenant has exactly one active Tenant Master Admin in the initial release.
- A user may be Tenant Master Admin of more than one tenant through separate memberships.
- The last Tenant Master Admin cannot be deleted, deactivated or demoted.
- Ownership transfer is an explicit, reauthenticated and audited transaction.
- Platform staff cannot silently set or reset a tenant user's password.
- Support may resend verification, recovery or invitation links but the user completes credential setup on the SaaS site.

## 3. Existing implementation baseline

### 3.1 FlowBot V1 assets to reuse

The FlowBot V1 workspace already provides:

- a Node 24 pnpm/Turborepo structure;
- deterministic flow engine and matcher packages;
- immutable published versions and pinned conversations;
- idempotent visitor input processing;
- tenant-aware data access helper and tenant-prefixed test schema;
- public widget session, message, sync and SSE APIs;
- draft, publish, rollback and simulator APIs;
- admin inbox, customers, leads, settings and privacy tools;
- rate limits, secret scan, build verification and browser tests.

The FlowBot engine, authoring contracts, widget behavior, idempotency rules and privacy tests are reuse candidates. The existing single-tenant login, direct owner-created credentials and current table layout are migration inputs, not the final SaaS identity design.

### 3.2 Voice and text agent assets to reuse

The current voice/text application already provides:

- realtime voice provider integrations;
- website text chat routes;
- bilingual sales prompt behavior;
- lead capture and post-conversation analysis;
- shared admin inbox, leads, customers and analytics workflows;
- calendar availability, booking links and appointment handling;
- master-admin and normal-admin operational patterns;
- CSV exports, soft deletion and settings validation.

The sales behavior, lead extraction, analysis, booking concepts and voice runtime are reuse candidates. The singleton settings model, tenant-unscoped tables, direct browser provider contracts and merchant-visible provider controls must not be carried into the SaaS tenant application.

### 3.3 Preferred target repository direction

The preferred direction is to evolve the tested FlowBot monorepo structure into the target SaaS monorepo because it already separates applications and packages. Voice/text capabilities should be ported behind shared contracts rather than copying the single-tenant application wholesale.

This direction remains subject to ADR-001 and the P0 repository audit. The logical package boundaries in this plan are required even if the physical migration path changes.

## 4. Non-negotiable SaaS invariants

1. A request never trusts `tenant_id`, plan, role or capability values supplied by a browser.
2. Tenant context is resolved from an authenticated membership or signed public deployment key.
3. Every tenant-owned row has `tenant_id uuid not null`.
4. Tenant foreign keys include tenant ownership where practical so cross-tenant references fail at the database layer.
5. Row-level security is default-deny defense in depth, not the only authorization control.
6. Every service, job, cache key, object path, event and usage record carries explicit tenant scope.
7. Cross-tenant resource probing returns non-revealing `404` responses.
8. Platform and tenant identities use separate authorization realms and route trees.
9. Tenant roles can never gain platform provider-routing permissions.
10. Entitlements are enforced server-side at route, service, publish, runtime, action and usage boundaries.
11. FlowBot makes zero LLM calls in every tier.
12. AI Basic is Web only; AI Premium adds LINE, WhatsApp and Messenger.
13. Voice Basic resolves `voice_gen1`; Voice Advanced resolves `voice_gen2`.
14. Provider/model identifiers never enter tenant UI, tenant APIs, widgets, exports, emails, logs or invoices.
15. Published flows, playbooks, knowledge attachments, plan versions and rate versions are immutable.
16. Conversations and billable operations pin behavior and entitlement snapshots.
17. External events, actions, signup attempts, payment webhooks and usage events are idempotent.
18. No production feature launches without tenant isolation, entitlement and rollback evidence.

## 5. Target system topology

```text
Public SaaS Site
  -> Signup / Login / Email Verification / Recovery
  -> Catalog / Checkout / Legal Acceptance

Tenant Application
  -> Workspace switcher
  -> Onboarding
  -> Overview / Inbox / Contacts / Leads
  -> FlowBot Studio / AI Chatbot Studio / Voice Agent Studio
  -> Channels / Team / Usage / Billing / Privacy

Platform Master Dashboard
  -> Tenant operations
  -> Plan and entitlement versions
  -> Provider/model capability registry
  -> Routing, cost, incidents and audit

Public and External Channels
  -> Web widget
  -> LINE / WhatsApp / Messenger webhooks
  -> Browser voice / telephony adapters

Platform Services
  -> Auth and Tenancy
  -> Entitlements and Quota
  -> Conversation Orchestrator
  -> Flow Engine
  -> Sales Conversation Core
  -> Provider Gateway
  -> Action Gateway
  -> Usage and Billing
  -> Workers / Outbox / Notifications

Data Services
  -> PostgreSQL
  -> Object storage
  -> Redis-compatible cache, locks and rate limits
  -> Durable queue and dead-letter handling
```

Initial deployment is a modular monolith plus workers and a separately deployable voice gateway. Service extraction is allowed only for scale, security or failure-isolation reasons.

## 6. Target repository layout

```text
apps/
  public-site/              public catalog, signup, verification and login
  tenant-web/               tenant workspace and product studios
  platform-master/          internal DJAY Platform Master Dashboard
  public-widget/            FlowBot and AI web widget bundle
  api/                      public, tenant and platform API composition
  workers/                  outbox, email, indexing, analysis and billing jobs
  voice-gateway/            opaque realtime voice session and media gateway

packages/
  auth/                     users, credentials, verification, sessions, MFA
  tenancy/                  tenants, memberships, invitations and workspace context
  authorization/            platform and tenant RBAC policies
  catalog/                  products, plans, versions and public copy
  entitlements/             effective entitlement resolution and snapshots
  domain/                   canonical contacts, leads, conversations and events
  flow-engine/              deterministic FlowBot runtime only
  flow-authoring/           drafts, validation, publish and rollback
  sales-core/               shared AI text and voice sales behavior
  knowledge/                source ingestion, revisioning, retrieval and provenance
  provider-gateway/         internal text and voice provider adapters
  channel-adapters/         web, LINE, WhatsApp, Messenger and voice normalization
  action-gateway/           approved lead, task, handover, email and appointment actions
  usage-billing/            quota, usage ledger, invoices and reconciliation
  notifications/            email and operational notifications
  observability/            safe logs, metrics, traces and audit helpers
  db/                       schema, migrations, RLS policies and data access
  shared/                   schemas, enums, error contracts and test factories
  ui/                       shared accessible tenant UI components
```

Import rules must prevent:

- tenant applications importing restricted provider registry types;
- FlowBot packages importing AI/provider packages;
- route components importing a raw database client;
- public widget packages importing server secrets or internal model metadata;
- tenant and platform API DTOs sharing unrestricted serializers.

## 7. Identity, registration and Tenant Master Admin provisioning

### 7.1 Public registration journey

The canonical self-service journey is:

1. Visitor opens the public DJAY Bot SaaS catalog.
2. Visitor selects one of the six plans or starts an approved trial.
3. Visitor enters work email, personal name, business name, country, timezone and preferred language.
4. Visitor accepts the current Terms, Privacy Notice and relevant automated-agent/data notices.
5. Platform creates an idempotent `signup_intent` with no active tenant access yet.
6. Platform sends an expiring single-use email verification link.
7. Visitor verifies email and creates credentials on the DJAY Bot SaaS site.
8. Platform transactionally creates the user, tenant and `tenant_master_admin` membership.
9. Platform creates the selected pending/trial subscription and effective entitlement snapshot.
10. If payment is required, platform starts checkout and waits for a signed, idempotent payment webhook.
11. Platform activates the tenant only after required verification and subscription conditions pass.
12. Tenant Master Admin enters guided onboarding and must complete a test before deployment.

No other dashboard creates the merchant's Tenant Master Admin credentials.

### 7.2 Registration state machine

```text
started
  -> email_pending
  -> email_verified
  -> credentials_created
  -> tenant_provisioning
  -> payment_pending | trialing
  -> active

Failure branches:
  expired
  abandoned
  payment_failed
  manual_review
  provisioning_failed
```

Each transition records actor, request ID, timestamp, policy version and idempotency key. Retrying a completed transition returns the existing result.

### 7.3 Provisioning transaction

The database transaction creates:

- global user record;
- verified authentication identity;
- tenant record with unique slug;
- one active `tenant_master_admin` membership;
- default tenant settings and locale;
- onboarding state;
- selected product subscription in `pending`, `trialing` or `active` state;
- initial entitlement snapshot;
- default usage/quota accounts;
- audit event and transactional outbox events.

External payment, email and analytics calls execute after commit through idempotent jobs or webhooks. A failed external call must not create a second tenant on retry.

### 7.4 Authentication requirements

- Email verification is mandatory before tenant activation.
- Passwords, if supported, use an approved memory-hard hash and breached-password controls.
- Session cookies are Secure, HttpOnly and SameSite protected.
- Session rotation occurs after login, privilege change, password reset and ownership transfer.
- Tenant Master Admin must enroll MFA before billing changes, ownership transfer, API-key management or destructive privacy operations.
- Recovery invalidates older recovery tokens and optionally revokes all sessions.
- Login, verification, recovery and signup endpoints have layered IP, identity and device rate limits.
- Account enumeration is prevented with neutral responses.
- Suspended users and suspended tenants lose access independently.

### 7.5 Team invitation journey

1. Tenant Master Admin or entitled Tenant Admin selects a tenant role.
2. Platform creates an expiring invitation scoped to one tenant and role.
3. Recipient opens the DJAY Bot SaaS invitation URL.
4. Existing users authenticate; new users register and verify on the SaaS site.
5. Acceptance creates or activates the membership idempotently.
6. The invite never contains a password and cannot grant platform roles.

Invitations cannot assign `tenant_master_admin`; that role changes only through the ownership-transfer workflow.

### 7.6 Ownership transfer

- Existing Tenant Master Admin initiates transfer and reauthenticates with MFA.
- Target must already be a verified active member.
- Target confirms the transfer through a separate signed link and MFA.
- One transaction changes old owner to Tenant Admin and target to Tenant Master Admin.
- A partial unique database constraint enforces at most one active master role. Transactional transfer logic and last-owner deletion/demotion guards enforce at least one, producing exactly one active Tenant Master Admin.
- All sessions for both actors rotate and an immutable audit event is written.
- A recovery delay and platform support review may be required for suspicious transfers.

## 8. Authorization model

### 8.1 Realm separation

Platform identities and tenant memberships are evaluated by separate policy modules.

Tenant tokens cannot call `/platform/*`. Platform support access to `/tenant/*` requires a short-lived, approved impersonation session that is visible to the tenant and fully audited.

### 8.2 Tenant permission matrix

| Capability | Tenant Master Admin | Tenant Admin | Sales Agent | Analyst/Viewer |
|---|---:|---:|---:|---:|
| Workspace profile | Manage | View/edit allowed fields | View | View |
| Subscription and payment | Manage | No by default | No | No |
| Ownership transfer | Manage | No | No | No |
| Team and roles | Manage | Invite allowed roles if granted | No | No |
| Product configuration | Manage | Manage entitled products | No | View |
| Publish/rollback | Manage | Manage if granted | No | View |
| Channel credentials | Manage | Manage if granted | No | Health only |
| Inbox and takeover | All | All/assigned | Assigned | Read-only if granted |
| Contacts/leads | All | All/assigned | Assigned | Read-only if granted |
| Data export/erasure | Manage with reauth | No by default | No | No |
| Provider/model routing | Never | Never | Never | Never |
| Raw provider cost | Never | Never | Never | Never |

Every permission is checked server-side against active membership, tenant status and entitlement. UI visibility mirrors policy but is never the enforcement mechanism.

## 9. Multi-tenant data architecture

### 9.1 Global tables

Global platform tables do not carry tenant ownership:

- `users`;
- `auth_identities`;
- `user_sessions`;
- `signup_intents`;
- `email_verification_tokens`;
- `password_reset_tokens`;
- `products`;
- `plans`;
- `plan_versions`;
- `rate_card_versions`;
- `capability_profiles`;
- `provider_model_profiles`;
- platform-role and platform-audit tables.

### 9.2 Tenant and membership tables

- `tenants`;
- `tenant_memberships`;
- `tenant_invitations`;
- `tenant_ownership_transfers`;
- `tenant_settings`;
- `tenant_legal_acceptances`;
- `support_access_sessions`.

Required constraints include:

- unique normalized user email;
- unique tenant slug;
- unique active membership per tenant/user;
- exactly one active Tenant Master Admin per tenant in initial release;
- invitation token hash uniqueness;
- no tenant membership role can reference a platform role.

### 9.3 Tenant-owned product data

All of the following carry `tenant_id` and tenant-safe foreign keys:

- subscriptions and entitlement snapshots;
- agents, versions and deployments;
- flows, nodes, executions and timers;
- knowledge sources, revisions, chunks and indexes;
- channel connections and bindings;
- contacts, identities, leads and sales facts;
- conversations, messages, voice sessions and summaries;
- appointment requests, tasks and handover records;
- action requests and results;
- usage reservations, events and aggregates;
- tenant audit logs and exports.

### 9.4 Database access pattern

Application code uses a tenant-scoped unit of work:

```ts
tenantDb({ tenantId, actorId, requestId }, async (tx) => {
  // Every repository receives this scoped transaction.
});
```

The helper must:

- start a transaction;
- set transaction-local tenant and actor context;
- verify active tenant status where required;
- apply explicit tenant predicates;
- rely on RLS as a second barrier;
- clear context automatically at transaction end;
- prevent raw-client imports outside approved migration/platform modules.

### 9.5 RLS policy pattern

- Tenant tables enable and force RLS in production.
- Default policy is deny.
- Tenant policy matches transaction-local `app.tenant_id`.
- Platform maintenance paths use a separate database role and audited service path.
- Background workers establish tenant context for each job, never once for a batch of mixed tenants.
- Migration and support roles are distinct from application roles.

### 9.6 Non-database isolation

- Object paths start with environment and tenant ID.
- Presigned URLs verify tenant ownership before issuance.
- Cache and lock keys include tenant ID and product.
- Queue payloads include tenant ID, but workers reload ownership and entitlement from the database.
- Search/vector indexes require tenant and source-revision filters.
- Analytics dimensions use tenant IDs, not names or message content.
- Rate limits include tenant, actor/deployment and IP dimensions.

## 10. Catalog, subscription and entitlement design

### 10.1 Product and plan keys

Stable public keys remain:

```text
flowbot_basic
flowbot_premium
ai_chat_basic
ai_chat_premium
voice_basic_gen1
voice_advanced_gen2
```

One tenant may hold one active plan per product and up to three active product subscriptions.

### 10.2 Versioned commercial configuration

Plan versions contain:

- public name and copy;
- currency and recurring amount;
- trial policy;
- feature entitlements;
- channel entitlements;
- included usage;
- overage rates and rounding;
- bot/agent/deployment limits;
- seat, storage, knowledge and retention limits;
- concurrency and number limits;
- branding and support level;
- effective dates.

Published plan versions are immutable. Existing invoices and conversations retain references to the effective versions that governed them.

### 10.3 Subscription state machine

```text
pending
  -> trialing
  -> active
  -> past_due
  -> grace_period
  -> restricted
  -> cancelled

Optional branches:
  paused
  scheduled_change
  incomplete
```

Product access policy for each state is explicit. For example, `past_due` may allow read/export and block new billable sessions after a grace policy; it must not silently delete configuration.

### 10.4 Entitlement resolution

Entitlements resolve from:

1. active product subscription;
2. immutable plan version;
3. approved tenant override;
4. tenant and subscription state;
5. current usage and safety cap;
6. deployment and channel binding.

The resolver produces an immutable snapshot at the start of a conversation, execution, call or billable operation. Client-supplied plan keys are ignored.

### 10.5 Enforcement points

- public catalog and checkout;
- tenant navigation and onboarding;
- API route and command handlers;
- FlowBot node palette and publish validator;
- social channel connection;
- text/voice provider session creation;
- Action Gateway;
- quota reservation;
- exports, retention and analytics where tiered;
- upgrade/downgrade preflight.

## 11. Shared domain and orchestration

### 11.1 Canonical conversation model

Every channel normalizes into one conversation timeline with:

- tenant, contact and lead references;
- product, plan snapshot, agent and deployment;
- channel and external identity;
- current automation mode: `flowbot`, `ai_text`, `voice`, `human`, `closed`;
- immutable behavior versions;
- ordered messages/events;
- assignment and handover state;
- delivery and action outcomes.

### 11.2 Canonical lead status proposal

The migration ADR should normalize current status differences into:

```text
new
pending_follow_up
appointment_requested
appointment_confirmed
follow_up_later
won
lost
```

`appointment_made` and `appointment_set` require evidence-based mapping. Existing appointment records determine requested versus confirmed. `closed_deal` and `deal_closed` map to `won`; `no_deal` maps to `lost`; ambiguous records are quarantined for review.

### 11.3 Conversation orchestration

The orchestrator owns mode changes and enforces:

- active tenant and deployment;
- product/channel entitlement;
- pinned flow/playbook/knowledge versions;
- human takeover lock;
- quota reservation;
- identity context;
- allowed FlowBot-to-AI or automation-to-human transitions.

Product engines generate transitions or structured plans. They do not directly execute external effects.

### 11.4 Action Gateway

Initial allowed actions:

- create/update lead;
- record sales fact;
- create appointment request and time options;
- create follow-up task;
- request handover;
- send approved structured merchant email.

Each action requires tenant, actor, role, entitlement, consent, destination, schema, idempotency, rate and audit checks.

The existing confirmed-booking feature requires a separate accepted ADR. It may be retained as an entitled calendar integration, but it must not be confused with an appointment request or introduced implicitly into every plan.

## 12. Product implementation tracks

### 12.1 FlowBot Basic

Reuse the deterministic engine and widget behavior. Add:

- tenant-scoped repositories and RLS;
- Basic node and feature allow-list;
- per-tenant bot/deployment limits;
- usage reservation and execution events;
- platform branding;
- SaaS onboarding template and embed verification;
- tenant-aware email notification;
- plan and isolation tests.

Acceptance requires proof that no FlowBot package imports or invokes AI/provider code.

### 12.2 FlowBot Premium

Add only entitled capabilities:

- advanced conditions and variables;
- durable delays and timers;
- reusable subflows;
- business hours;
- multiple deployments;
- team routing;
- approved deterministic webhooks;
- branding removal and advanced analytics;
- higher configured limits.

Downgrade preflight lists Premium-only nodes, integrations, bot counts and branding dependencies. It never deletes them silently.

### 12.3 AI Chatbot Basic

Port text chat behind the shared Sales Conversation Core and Provider Gateway. Add:

- web-only deployment;
- tenant knowledge and immutable playbook versions;
- source-scoped retrieval and grounding;
- structured per-turn output validation;
- interest, pain point, objection and CTA facts;
- contact verification and appointment request;
- Action Gateway results;
- human takeover;
- customer message-credit usage;
- Thai/English evaluation suites;
- provider-neutral widget and API payloads.

The tenant chooses business behavior, voice/tone, knowledge and goals, not provider/model.

### 12.4 AI Chatbot Premium

Add:

- LINE, WhatsApp and Messenger connection flows;
- signed webhook verification and deduplication;
- credential rotation/health;
- channel capability rendering;
- template/session/fee rules;
- cross-channel contact identity suggestions;
- advanced routing and analytics;
- higher limits.

AI Basic must reject social bindings even when requests are manipulated.

### 12.5 Voice Agent Basic

Port voice behavior behind `voice_gen1` and the opaque voice gateway. Add:

- browser voice first unless ADR-301 selects another sequence;
- short-lived tenant/deployment/capability authorization;
- provider-neutral session contracts;
- audio lifecycle, interruption, silence and reconnect;
- automated-agent and recording disclosures;
- Sales Core and Action Gateway integration;
- transcript/summary policy;
- callback/transfer behavior;
- minute reservation, settlement and rounding;
- concurrency, destination and spend controls;
- Gen1 quality and latency gates.

### 12.6 Voice Agent Advanced

Add:

- strict `voice_gen2` routing;
- higher quality thresholds;
- complex objection and multi-constraint evaluation;
- improved names, numbers and alphanumeric recognition tests;
- advanced interruption/noise tests;
- higher entitlement-controlled concurrency and analytics;
- approved equivalent-profile qualification;
- no silent Gen2-to-Gen1 fallback;
- incident, pause, credit and recovery policy.

## 13. Platform Master Dashboard

The Platform Master Dashboard is a separate internal application and authorization realm.

### 13.1 Initial modules

- tenant directory and status;
- subscription and entitlement support operations;
- plan/rate version management;
- provider/capability/model registry;
- routing priority and effective dates;
- model evaluation evidence;
- channel and voice incident controls;
- cost, usage and margin views;
- support-access approvals;
- immutable audit history.

### 13.2 Provider/model change workflow

1. Authorized platform actor reauthenticates.
2. Actor selects capability profile and proposed provider/model profile.
3. System validates schema, credentials, region, limits and capability compatibility.
4. Actor attaches evaluation/canary evidence and an effective time.
5. System displays affected products, sessions and rollback profile.
6. Actor confirms; system writes append-only before/after audit.
7. Change is activated at effective time through versioned configuration.
8. Monitoring compares errors, latency, quality and cost.
9. Authorized actor can execute audited rollback.

Tenant APIs have no provider/model mutation fields. Tenant Master Admin and Tenant Admin receive capability labels only.

## 14. Usage, quota and billing

### 14.1 Customer units

- FlowBot: conversation or execution credit;
- AI Chatbot: AI response or message credit;
- Voice Agent: voice minute under approved rounding.

### 14.2 Dual ledger

Store separately:

- customer-billable quantity and rate;
- provider-native units, external fees and internal cost.

Tenant reports expose only public units, allowance, overage, forecast and invoice trace. Platform Finance receives restricted cost and margin views.

### 14.3 Reservation and settlement

Before billable work:

1. load entitlement snapshot;
2. lock quota account or perform atomic reservation;
3. approve included usage, overage or reject at safety cap;
4. execute operation;
5. settle actual quantity;
6. release unused reservation;
7. emit immutable usage event;
8. reconcile aggregates and invoice lines asynchronously.

Retries reuse operation and idempotency keys. Failed or waived operations settle according to versioned rate policy.

### 14.4 Payment webhook rules

- verify signature and timestamp;
- store unique external event ID before processing;
- process out-of-order events safely;
- never trust browser checkout success;
- map external customer/subscription references to one tenant;
- apply subscription transitions transactionally;
- emit audit and outbox events;
- retain replay and reconciliation tools.

## 15. APIs, events and background work

### 15.1 API namespaces

```text
/api/public/*       catalog, signup, verification, login, recovery
/api/tenant/*       authenticated tenant operations
/api/widget/*       signed public deployments and visitor sessions
/api/channels/*     external verified webhooks
/api/platform/*     internal Platform Master Dashboard only
/api/internal/*     service-to-service endpoints where unavoidable
```

Public and tenant schemas are allow-list serialized. Restricted provider fields use separate internal types and packages.

### 15.2 Core domain events

- `identity.user_registered`;
- `identity.email_verified`;
- `tenant.provisioned`;
- `tenant.master_admin_assigned`;
- `tenant.membership_changed`;
- `subscription.activated`;
- `subscription.plan_change_scheduled`;
- `entitlement.snapshot_created`;
- `agent.version_published`;
- `conversation.started`;
- `conversation.mode_changed`;
- `lead.created`;
- `action.completed`;
- `usage.reserved`;
- `usage.settled`;
- `provider.routing_changed` internal only;
- `security.tenant_isolation_denied`;
- `security.provider_leak_detected`.

### 15.3 Worker rules

- transactional outbox is the source for durable work;
- every job has tenant, correlation and idempotency identifiers;
- workers reauthorize ownership and current policy before effects;
- retry schedules are bounded and observable;
- terminal failures enter a dead-letter queue with safe replay;
- mixed-tenant batches establish a fresh tenant transaction per item;
- job logs exclude message bodies and secrets by default.

## 16. Migration plan from existing applications

### 16.1 Migration principles

- never point both legacy schemas at production writes without an accepted dual-write design;
- use stable source-to-target ID mapping tables;
- migrate one pilot tenant first;
- preserve source timestamps and behavior versions where lawful;
- use dry-run counts, checksums and reconciliation reports;
- quarantine malformed or ambiguous data;
- retain export and rollback windows;
- do not infer contact merges from weak similarity.

### 16.2 FlowBot migration

- map the existing test/owner tenant to a canonical tenant;
- map users to global users and tenant memberships;
- map bots, drafts and published versions to canonical agent/flow versions;
- preserve active-version pointers and conversation pins;
- map customers, leads, messages, notes and events with tenant IDs;
- replace direct owner credential creation with invitations;
- validate runtime parity against representative flows;
- maintain an embed compatibility shim if public keys change.

### 16.3 Voice/text migration

- create a canonical tenant for the current DJAI deployment;
- map `admin_users` into users and memberships;
- split singleton `settings` into tenant configuration and restricted platform provider configuration;
- move provider/model defaults into the Platform Master Dashboard registry;
- map conversations, messages, leads, analysis and exports;
- map booking links, availability and appointments according to the accepted appointment ADR;
- convert public widget/provider contracts to the opaque gateway;
- reconcile lead statuses using the canonical status migration;
- run English and Thai behavior parity tests.

### 16.4 Cutover pattern

1. Deploy target schema and read-only migration tools.
2. Run dry migration and reconciliation in staging.
3. Fix quarantined data and repeat until stable.
4. Enable change capture or schedule a controlled write freeze.
5. Run final delta migration.
6. Verify counts, checksums, sample records, auth and active deployments.
7. Switch traffic behind feature flags.
8. Monitor and keep legacy read-only rollback window.
9. Decommission legacy paths only after acceptance and backup verification.

## 17. Phased delivery program

Durations are planning ranges for a focused small product team and must be reset after P0. Parallel work is allowed only where dependencies and review capacity support it.

### P0 - Audit, contracts and ADR lock (2-3 weeks)

Deliverables:

- current code, route, schema, auth, job and deployment inventory;
- accepted behavior matrix for FlowBot and voice/text apps;
- reuse/refactor/replace matrix;
- data classification and provider-leak map;
- target repository ADR;
- authentication/session/MFA ADR;
- RLS and database-role ADR;
- payment, tax and invoice decision backlog;
- voice gateway and browser/telephony sequence ADR;
- canonical status and appointment ADR;
- automated baseline test report.

Gate:

- every reuse claim cites code and tests;
- no unresolved critical identity or tenant-boundary ambiguity;
- rollback and migration approach accepted;
- P1 stories are reviewable and independently testable.

### P1 - SaaS identity, tenant provisioning and realm separation (4-6 weeks)

Build:

- public registration, verification, login and recovery;
- users, tenants, memberships, signup intents and invitations;
- exactly-one Tenant Master Admin invariant;
- ownership transfer;
- tenant workspace context and switcher;
- separate Platform Master Dashboard login/realm;
- session rotation, rate limits and audit;
- minimal tenant shell and onboarding state.

Gate:

- an SME can self-register on the SaaS site and receive one isolated tenant;
- retries cannot duplicate user, tenant or membership;
- no platform staff-created merchant password path exists;
- tenant token cannot access platform routes;
- cross-tenant authorization test matrix passes.

### P2 - Data isolation, catalog, subscriptions and entitlement kernel (5-8 weeks)

Build:

- tenant-scoped database repositories and forced RLS;
- product, plan and immutable plan-version catalog;
- six stable public plan keys;
- subscription state machine;
- entitlement resolution and immutable snapshots;
- quota accounts, reservations and usage-event skeleton;
- public catalog and plan-selection flow;
- Platform Master Dashboard tenant, plan and routing foundations;
- payment-provider interface and signed webhook harness, even if pilot billing is manual.

Gate:

- generated six-plan entitlement suite passes;
- manipulated client requests cannot obtain another plan or tenant capability;
- one active tier per product is enforced;
- a tenant can combine products without data duplication;
- tenant and platform DTO leak scans pass.

### P3 - Shared conversation domain and tenant workspace (4-7 weeks)

Build:

- canonical contacts, identities, leads, conversations and messages;
- inbox, assignment, human takeover and notes;
- canonical lead statuses and migration adapters;
- shared knowledge/source revision foundation;
- Action Gateway skeleton;
- transactional outbox, workers and notification foundation;
- safe exports, retention and erasure lineage;
- tenant overview and usage shell.

Gate:

- cross-product conversation records remain tenant isolated;
- weak identity matches never auto-merge;
- duplicate effects and external events are idempotent;
- support impersonation is visible, time-limited and audited;
- privacy export/erasure tests pass across derived data.

### P4 - FlowBot Basic and Premium SaaS release (6-10 weeks)

Build:

- port/harden deterministic engine and authoring;
- tenant-aware widget and deployment keys;
- Basic/Premium feature classification;
- plan-aware builder, publish and runtime validation;
- execution metering and limits;
- FlowBot onboarding templates and install verification;
- Premium timers, subflows, team routing, approved webhooks and branding;
- legacy FlowBot migration tooling.

Gate:

- one complete E2E journey per FlowBot plan;
- zero AI/provider calls under dependency and runtime tests;
- existing sessions remain pinned during publish;
- upgrade/downgrade preserves definitions and reports blockers;
- at least three isolated pilot tenants pass acceptance before self-service expansion.

### P5 - AI Chatbot Basic Web release (6-10 weeks)

Build:

- Sales Conversation Core;
- knowledge ingestion/retrieval and playbook versions;
- Provider Gateway text adapter;
- structured response/action validation;
- web widget AI mode and streaming;
- contact, CTA, appointment-request and merchant-email actions;
- message-credit metering;
- bilingual golden and adversarial evaluation.

Gate:

- Web-only entitlement cannot be bypassed;
- factuality, sales behavior and safety thresholds pass;
- provider/model identifiers are absent from tenant/browser artifacts;
- human takeover suspends AI immediately;
- usage reservation and settlement reconcile.

### P6 - AI Chatbot Premium social release (6-10 weeks)

Build in controlled channel order:

1. LINE;
2. WhatsApp;
3. Messenger.

For each channel:

- connection and revocation;
- signed webhook verification;
- event deduplication and ordering;
- outbound rendering and delivery state;
- credential health and reauthorization;
- policy/template/session handling;
- identity linking suggestions;
- channel fee and usage events.

Gate:

- AI Basic rejects every social path;
- Premium channel suites pass independently;
- one customer can be reviewed across channels without unsafe auto-merge;
- outage and retry behavior is operationally visible;
- platform approvals and legal policies are complete.

### P7 - Voice Agent Basic release (6-10 weeks)

Build:

- opaque voice gateway;
- `voice_gen1` internal routing;
- browser voice or approved initial channel;
- Sales Core, lead and Action Gateway integration;
- interruption, silence, reconnect and disclosure behavior;
- minute metering, concurrency and spend caps;
- transcript/recording retention controls;
- transfer/callback;
- existing voice data migration.

Gate:

- tenant surfaces show First-Generation only;
- provider names and models cannot be recovered from tenant payloads;
- English and Thai call acceptance passes;
- fraud, concurrency, cap and emergency-stop tests pass;
- latency and quality meet pilot thresholds.

### P8 - Voice Agent Advanced release (5-8 weeks)

Build:

- `voice_gen2` routing and higher limits;
- Advanced evaluation suite;
- approved equivalent-profile qualification;
- incident, degradation, pause and credit workflow;
- advanced voice analytics;
- Master Dashboard routing canary and rollback.

Gate:

- tenant surfaces show Second-Generation only;
- no Gen2-to-Gen1 silent fallback is possible;
- Advanced quality thresholds pass materially harder scenarios;
- routing changes require authorized Master Dashboard workflow;
- cost and margin controls pass load tests.

### P9 - Billing, operations and paid GA hardening (5-8 weeks)

Build:

- production checkout and subscription management;
- invoice, tax, proration, dunning and cancellation policy;
- overage forecast, alerts and safety caps;
- reconciliation and finance reports;
- support, status, incident and credit tools;
- backups, restore, disaster recovery and capacity tests;
- legal notices and data-processing operations.

Gate:

- unfamiliar SME can register, pay, configure, test and launch without developer intervention;
- invoice lines trace to immutable usage and rate versions;
- restore and rollback exercises pass;
- security and privacy launch review passes;
- support runbooks and on-call ownership are active.

## 18. Testing program

### 18.1 Tenant isolation suite

For every tenant-owned route and command:

- Tenant A reads Tenant A resource: allowed by role/entitlement.
- Tenant A reads Tenant B resource ID: `404` with no metadata.
- Tenant A mutates Tenant B resource ID: no effect and safe audit.
- missing tenant context: denied.
- suspended membership or tenant: denied according to lifecycle policy.
- background job with mismatched tenant/resource: dead-letter and security event.
- export, object URL, SSE, cache and search paths receive the same substitution tests.

Run the matrix for Tenant Master Admin, Tenant Admin, Sales Agent, Viewer, public visitor and support impersonation.

### 18.2 Registration and ownership tests

- duplicate signup submission;
- concurrent email verification;
- expired/replayed verification token;
- payment success before/after provisioning webhook order;
- provisioning failure and retry;
- existing user creates second tenant;
- invite acceptance by existing/new user;
- last Tenant Master Admin deletion/demotion blocked;
- concurrent ownership transfer;
- tenant role cannot become platform role;
- recovery and session revocation.

### 18.3 Entitlement matrix tests

Generate tests from document 14 for all six plans, including API payload manipulation, stale entitlement snapshots, upgrade, downgrade, cancellation and multi-product combinations.

### 18.4 Product tests

- deterministic parity and zero-AI FlowBot tests;
- AI grounding, action, safety and channel tests;
- voice latency, recognition, interruption and generation tests;
- human takeover and release across all products;
- immutable version pinning;
- idempotent lead/action/event behavior;
- provider leak scans of built assets and API snapshots.

### 18.5 Billing tests

- allowance boundary and first overage unit;
- concurrent reservation race;
- failed/cancelled/waived settlement;
- voice rounding and active-call cap behavior;
- duplicate/missing provider usage;
- plan effective dates and proration;
- webhook replay/out-of-order delivery;
- invoice-to-raw-usage reconciliation;
- restricted provider cost visibility.

### 18.6 Performance and resilience

- signup and login burst limits;
- concurrent tenant dashboard requests;
- widget load and SSE/WebSocket concurrency;
- social webhook bursts;
- voice concurrent-session and regional latency;
- queue backlog recovery;
- database failover and pool exhaustion;
- cache loss;
- object-store and provider outage;
- backup restore and event replay.

## 19. Security, privacy and operational controls

- Separate development, staging and production accounts and secrets.
- No production data in local development.
- Managed secret storage and rotation.
- Dependency, container and source secret scanning.
- Message bodies, prompts, contact data and credentials excluded from general logs.
- Thai PDPA/privacy, cross-border and subprocessor review before paid launch.
- Recording off by default until approved tenant policy and notice exist.
- Tenant-configurable retention within plan and legal boundaries.
- Export and erasure cover derived summaries, chunks, embeddings, files and caches.
- Platform support access requires reason, approval, expiry, tenant-visible banner and audit.
- Incident runbooks cover cross-tenant exposure, billing bypass, voice fraud, provider leakage and data loss.

## 20. Observability and SLO readiness

Every safe trace includes:

- request/correlation ID;
- tenant ID;
- actor or deployment ID;
- product and public plan key;
- channel;
- conversation/call ID where relevant;
- pinned behavior and entitlement version;
- status, latency and customer usage.

Restricted platform telemetry may add provider profile and internal cost dimensions.

Before each product GA, define and measure:

- availability SLO;
- request latency and error budget;
- queue delay and dead-letter rate;
- widget/session establishment success;
- AI first-response latency;
- voice connection and end-of-turn latency;
- webhook delivery success;
- usage reconciliation variance;
- signup-to-active conversion and provisioning failure rate.

## 21. Release and rollback strategy

- Use feature flags scoped by environment, tenant, product and plan.
- Start with internal tenant, then named pilots, then limited self-service.
- Use expand-migrate-contract database changes.
- Never combine destructive schema removal with first feature activation.
- Canary provider and channel changes through the Platform Master Dashboard.
- Keep rollback-compatible application versions during migration windows.
- Publish runbooks with owner, trigger, action and verification steps.
- Stop rollout automatically on isolation, billing, provider-leak or critical quality failures.

## 22. Required decisions before implementation

The following must be accepted before their dependent phase:

- target repository and runtime versions;
- authentication, email verification, MFA and session design;
- database roles, RLS and migration tooling;
- public app URL and workspace routing model;
- payment provider, THB, tax invoice and refund policy;
- trial, card requirement and grace-period policy;
- exact included usage and overage rates;
- canonical lead statuses;
- appointment request versus confirmed booking entitlement;
- LINE/WhatsApp/Messenger connection policies;
- browser voice versus telephony release order;
- voice minute rounding and active-call cap behavior;
- provider equivalence and Advanced incident policy;
- retention, recording, cross-border and subprocessors.

## 23. First implementation backlog after plan approval

1. Produce the six P0 repository-audit documents required by document 13.
2. Write ADR-001 target repository and runtime decision.
3. Write ADR-002 reuse/refactor/replace decision for FlowBot and voice/text apps.
4. Write ADR-003 tenant context, database roles and RLS decision.
5. Write identity ADR covering registration, verification, sessions, MFA and recovery.
6. Define canonical role and permission constants with deny-by-default policy tests.
7. Define signup, tenant, membership, invitation and ownership-transfer schemas.
8. Build disposable database migration and RLS test harness.
9. Build cross-tenant substitution test factories before product migration.
10. Build public registration and idempotent tenant provisioning vertical slice.
11. Build separate Platform Master Dashboard authentication shell.
12. Implement six-plan catalog types and generated entitlement test matrix.
13. Demonstrate one Tenant Master Admin registration and one denied cross-tenant access in staging.
14. Only then begin moving a product engine behind the shared SaaS contracts.

## 24. Definition of ready for a development phase

A phase is ready only when:

- higher-authority requirements and decisions are mapped;
- schema/API/event contracts are reviewed;
- dependencies and non-goals are explicit;
- threat model and tenant/entitlement impact are documented;
- migration and rollback are defined;
- acceptance and failure tests are written or enumerated;
- observability and runbook changes are scoped;
- no unresolved decision can materially change the implementation.

## 25. Definition of done for every change

A change is done only when:

- implementation is tenant-scoped and role-authorized;
- wrong tenant, role and plan tests pass;
- migrations and rollback/mitigation pass on disposable and staging data;
- idempotency is proven for retries and concurrency;
- public schemas contain no restricted provider fields;
- product-specific tests and evaluations pass;
- audit, logs, metrics and alerts are present without leaking content;
- documentation and operational runbooks are updated;
- staging acceptance evidence identifies exact build, schema, plan and behavior versions;
- no unrelated tenant data or existing user changes were overwritten.

## 26. Program completion condition

The DJAY Bot SaaS Platform is not complete merely because all three engines run.

It is complete only when an independent SME can register on the public SaaS site, verify its Tenant Master Admin, obtain an isolated workspace, subscribe to an entitled plan, configure and test the product, deploy it, receive conversations and leads, understand usage and billing, manage its team and data, and remain technically unable to access another tenant or the internal Platform Master Dashboard.
