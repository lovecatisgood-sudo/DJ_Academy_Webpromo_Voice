# 05 - Project Plan & Roadmap - DJAY Bot SaaS Platform v3.0

## 1. Delivery rule

The final catalog contains six plans across three product families, but the platform must be delivered in controlled phases. Identity, tenant isolation, membership, subscription, entitlement and usage foundations precede every sellable product release.

Product-engine reuse may proceed in parallel behind test contracts. No product is offered to SMEs until its dependent SaaS and product release gates pass.

Durations are planning estimates to reset after the repository audit. Document 15 contains the detailed implementation program.

## 2. Phases

| Phase | Indicative range | Outcome |
|---|---:|---|
| P0 - Audit and decision lock | 2-3 weeks | FlowBot and voice/text inventory, behavior baseline, data/security map, reuse decisions and required ADRs |
| P1 - Identity and tenant provisioning | 4-6 weeks | public signup, verified Tenant Master Admin, tenant creation, invitations, ownership transfer and separate platform realm |
| P2 - Isolation, catalog and entitlement kernel | 5-8 weeks | RLS, scoped repositories, six-plan catalog, subscriptions, entitlement snapshots, quota skeleton and Master Dashboard foundations |
| P3 - Shared workspace domain | 4-7 weeks | contacts, leads, conversations, inbox, knowledge foundation, Action Gateway, workers, audit and privacy lineage |
| P4 - FlowBot Basic and Premium | 6-10 weeks | deterministic SaaS runtime, plan-aware builder, widget, metering, Premium capabilities and migration |
| P5 - AI Chatbot Basic | 6-10 weeks | web text AI, Sales Conversation Core, knowledge, actions, handover, evaluation and message-credit metering |
| P6 - AI Chatbot Premium | 6-10 weeks | LINE, WhatsApp and Messenger, unified social identity/inbox, routing, operations and analytics |
| P7 - Voice Agent Basic | 6-10 weeks | opaque voice gateway, First-Generation profile, sales actions, minutes, quality, fraud and recording controls |
| P8 - Voice Agent Advanced | 5-8 weeks | Second-Generation profile, advanced quality suite, generation integrity, canary/rollback and advanced analytics |
| P9 - Billing and paid GA | 5-8 weeks | checkout, invoices, tax, dunning, overage, reconciliation, operations, security/privacy, load and disaster recovery |

## 3. Phase gates

### P0 gate - evidence and decisions

- current routes, packages, schemas, jobs, tests and deployments are inventoried;
- FlowBot and voice/text accepted behavior is documented;
- reuse/refactor/replace decisions cite code and tests;
- identity, RLS, repository, status, appointment and voice-gateway ADRs are accepted or explicitly gated;
- P1 migrations, tests and rollback are reviewable.

### P1 gate - verified SME tenant creation

- an SME registers on the public DJAY Bot SaaS site;
- email and credentials are verified on the SaaS site;
- one user, one tenant and exactly one active Tenant Master Admin are provisioned idempotently;
- duplicate requests and retries cannot duplicate tenants or memberships;
- invitations and ownership transfer are secure and audited;
- tenant sessions cannot access the Platform Master Dashboard;
- no platform-created merchant password path exists.

### P2 gate - isolation and plan correctness

- every tenant-owned row and service path has explicit tenant scope;
- RLS and application authorization isolation suites pass;
- exactly six public plan keys exist;
- one active tier per product is enforced;
- subscriptions across different products coexist;
- entitlement snapshots and quota reservations are immutable/idempotent;
- Tenant Master Admin cannot access provider/model routing;
- public and tenant schema leak scans pass.

### P3 gate - shared SaaS operations

- shared contacts, identities, leads, conversations and inbox work across products;
- cross-channel weak matches never merge automatically;
- human takeover and Action Gateway effects are idempotent;
- transactional outbox, retry and dead-letter paths work;
- export, erasure and retention cover derived records;
- support access is time-limited, visible and audited.

### P4 gate - FlowBot plans

- FlowBot makes zero LLM/provider calls;
- Basic rejects Premium-only nodes and capabilities;
- Premium capabilities work without weakening determinism;
- active executions stay pinned during publish and rollback;
- upgrade preserves flows and downgrade reports blockers;
- widget, usage and tenant-isolation tests pass;
- pilot data migration reconciles.

### P5 gate - AI Chatbot Basic

- Web-only entitlement cannot be bypassed;
- grounded sales behavior passes Thai/English golden and adversarial evaluations;
- contact, CTA, appointment request, email and handover actions are accurate and idempotent;
- provider identifiers are absent from tenant/browser surfaces;
- message-credit usage and provider-native cost reconcile separately.

### P6 gate - AI Chatbot Premium

- Web, LINE, WhatsApp and Messenger adapters pass independently;
- webhook signatures, replay, duplicate and out-of-order behavior pass;
- credential health and channel policy operations are ready;
- identity suggestions avoid unsafe merges;
- AI Basic tenants cannot connect or use social channels;
- external fee treatment is current and disclosed.

### P7 gate - Voice Agent Basic

- tenant UI/API exposes First-Generation only;
- provider/model identifiers stay behind the opaque voice gateway;
- English and Thai latency, interruption, silence and recognition thresholds pass;
- lead/action/transfer/callback behavior works;
- minutes, concurrency, spend, fraud and emergency-stop controls pass;
- disclosure, transcript and recording policies pass legal/security review.

### P8 gate - Voice Agent Advanced

- tenant UI/API exposes Second-Generation only;
- Advanced cannot silently route to Gen1;
- stricter complex-conversation and recognition evaluations pass;
- equivalent fallback requires qualification evidence;
- routing change, canary and rollback work through the Platform Master Dashboard;
- higher concurrency, analytics and cost controls pass.

### P9 gate - paid GA

- checkout and signed payment webhooks are idempotent;
- invoices trace to immutable subscription, usage and rate versions;
- overage, caps, upgrade, downgrade, cancellation, proration and dunning pass;
- an unfamiliar SME can register, pay, configure, test and launch without developer intervention;
- backup, restore, replay, incident and disaster-recovery exercises pass;
- security, privacy, legal, support and status operations are ready.

## 4. Commercial launch sequence

1. Internal DJAY tenant on the new tenant kernel.
2. Three named FlowBot pilot tenants.
3. FlowBot Basic/Premium limited self-service.
4. AI Chatbot Basic web pilot.
5. AI Chatbot Premium channel-by-channel pilot.
6. Voice Basic controlled pilot.
7. Voice Advanced controlled pilot.
8. Broad self-service and overage only after P9.

The pricing page may show unavailable plans as Coming soon. It must not accept payment or imply availability before the relevant release gate passes.

## 5. Workstreams

- Product/founder: package decisions, sales behavior, acceptance and commercial rates.
- Identity/platform: registration, tenancy, authorization, catalog and Master Dashboard.
- Shared domain: contacts, leads, conversations, inbox, knowledge and actions.
- FlowBot: deterministic engine, builder, widget and migration.
- AI: Sales Core, retrieval, provider gateway and evaluation.
- Channels: Web, LINE, WhatsApp and Messenger.
- Voice: gateway, realtime behavior, telephony, quality, fraud and provider profiles.
- Usage/billing: quota, ledger, checkout, invoices and reconciliation.
- Security/QA/Ops: isolation, privacy, resilience, observability and release evidence.

For a small team, protect the dependency chain and limit work in progress. Do not staff every product track simultaneously before the shared platform is stable.

## 6. Definition of done per phase

- requirements and decisions map to tests;
- tenant, role and plan denial paths pass;
- schema/API/event changes and migrations are documented;
- rollback or forward mitigation is tested;
- idempotency and concurrency behavior is proven;
- observability, audit and runbooks are updated;
- provider-confidentiality scan passes;
- public copy and plan registry remain synchronized;
- no excluded operational scope is introduced;
- staging evidence identifies exact build, schema, plan and behavior versions.

## 7. Dependencies requiring early action

- authentication, email verification, MFA and recovery decision;
- payment provider, Thai tax/invoice and refund policy;
- LINE/Meta app and business verification;
- WhatsApp template, session and fee policy;
- telephony number, recording and outbound eligibility;
- provider accounts, regional limits and cost controls;
- email notification domain and reputation;
- Thai PDPA, cross-border and subprocessor review;
- backup, object storage, queue and cache selections.

## 8. Change control

Any proposed seventh public plan, FlowBot social entitlement, tenant-visible provider/model setting, platform-created merchant password, weakening of exactly-one Tenant Master Admin ownership, or POS/Creative Club feature is a product-scope change requiring founder approval and synchronized decision, package, PRD and implementation documents.
