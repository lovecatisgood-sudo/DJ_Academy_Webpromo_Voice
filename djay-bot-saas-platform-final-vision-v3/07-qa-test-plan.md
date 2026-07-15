# 07 · QA & Test Plan — DJAY Bot SaaS Platform v3.0

## 1. Test strategy

Testing is layered across deterministic logic, domain/entitlement contracts, integrations, AI/voice quality, security, billing and end-to-end plan journeys.

Release evidence must identify the exact plan/version and capability profile tested.

## 2. Test layers

### Unit

- flow transitions/conditions/variables/timers;
- graph validator and schema migration;
- entitlement resolution;
- plan upgrade/downgrade compatibility;
- usage rounding/reservation/settlement;
- identity normalization/merge candidates;
- sales-stage/action validation;
- provider-neutral error mapping.

### Property/fuzz

- deterministic engine produces same result for same ordered inputs;
- graph cycles and malformed definitions cannot hang runtime;
- tenant/resource ID substitution never exposes data;
- duplicate webhooks/actions/usage events do not duplicate effects/charges;
- arbitrary model outputs cannot bypass action schema/allow-list;
- plan/feature combinations never grant unowned capability.

### Integration

- PostgreSQL RLS/service authorization;
- outbox/queue/retry/dead-letter;
- object storage/upload/indexing;
- email action;
- web widget/session reconnect;
- LINE, WhatsApp and Messenger signatures/delivery/credentials;
- provider adapters and usage capture;
- voice browser/telephony lifecycle;
- payment/invoice provider after selected.

### End-to-end

At least one full journey for each of the six plans plus upgrade/downgrade and multi-product subscription.

## 3. Package entitlement suite

Generated matrix tests from document 14 must prove:

- FlowBot Basic rejects Premium-only nodes/integrations/branding/team features;
- FlowBot Premium permits entitled advanced features;
- both FlowBot tiers make zero LLM calls;
- AI Basic binds Web only and rejects LINE/WhatsApp/Messenger;
- AI Premium binds Web + all three social channels;
- Voice Basic resolves `voice_gen1` and tenant surfaces say First-Generation;
- Voice Advanced resolves `voice_gen2` and tenant surfaces say Second-Generation;
- Basic cannot manipulate API payloads to request Premium/Advanced behavior;
- one active tier per product is enforced;
- subscriptions across different products coexist;
- cancellation/downgrade preserves shared records safely.

## 4. FlowBot tests

- node contract tests;
- publish immutable version;
- active version pinning during new publish;
- form/lead creation;
- durable delay resume;
- external integration result/retry/idempotency;
- handover lock;
- widget reconnect/history;
- import/migration parity from V1;
- no model/provider dependency or usage event.

## 5. AI Chatbot evaluation

Datasets include Thai/English and realistic business scenarios.

Dimensions:

- intent and language matching;
- grounded factual answer;
- interest/pain-point discovery;
- qualification appropriateness;
- recommendation evidence;
- known and unseen objection handling;
- CTA timing and clarity;
- contact validation;
- appointment-time-option capture;
- truthful action result wording;
- handover/refusal/stop behavior;
- prompt injection and malicious knowledge;
- no prohibited claim/provider leakage.

Evaluation sets:

- golden conversations;
- adversarial instructions;
- ambiguous/short/noisy messages;
- channel-specific constraints;
- long conversations/context pressure;
- changed knowledge/playbook versions;
- unsupported/sensitive requests.

Human review samples are required before each model/profile change.

## 6. Social channel tests

For LINE, WhatsApp and Messenger:

- app/account connection and revocation;
- signature verification;
- duplicate/out-of-order webhooks;
- token expiry/refresh/re-auth;
- message text/media/attachment limits;
- quick-reply/button fallback;
- delivery/read/failure state;
- session/template restrictions;
- rate-limit/backoff;
- identity linking/merge review;
- AI Premium entitlement;
- provider-neutral tenant errors.

## 7. Voice quality and integration tests

Common tests:

- connection/session establishment;
- speech in/out and language switching;
- interruption/barge-in;
- silence/noise/echo;
- names, phone numbers, email and alphanumeric capture;
- sales stages, objections, CTA and appointment request;
- action execution/result;
- transfer/callback;
- reconnect/provider error;
- disclosure/recording states;
- concurrency, spend and kill switch;
- minutes/rounding/overage.

### Generation tests

- Basic test job uses `voice_gen1` only.
- Advanced test job uses `voice_gen2` only.
- Advanced suite includes more complex multi-constraint discovery/objection scenarios and stricter quality thresholds.
- Equivalent fallback candidates must pass the target generation suite before use.
- no silent Advanced→Basic fallback test.

## 8. Provider confidentiality tests

Automated scans of:

- public/tenant UI text and source maps;
- network/API responses and GraphQL/OpenAPI schemas;
- widget configuration/payloads;
- social replies;
- voice spoken disclosure and transcript-facing metadata;
- emails, invoices and exports;
- tenant-visible logs/errors/status pages;
- analytics telemetry exposed to tenants;
- documentation/help content.

Forbidden ordinary customer-facing strings include provider/company/model identifiers configured by security. Legal privacy/subprocessor pages are explicitly excluded and reviewed for accuracy.

Authorization and contract tests must prove:

- Tenant Master Admin and Tenant Admin cannot discover, read or mutate provider/model routing through UI, APIs, exports, source maps or manipulated requests;
- tenant-role changes cannot grant platform-realm provider permissions;
- only authorized Platform Master Dashboard roles can call provider registry and routing commands;
- routing changes require reauthorization and create immutable before/after audit records;
- public widget, voice and channel session payloads remain opaque and provider-neutral;
- Master Dashboard routes and bundles are not shipped as tenant navigation or tenant client assets.

Signup and tenant-ownership tests must prove:

- duplicate and concurrent signup requests create one user, one tenant, one membership and one selected subscription;
- expired or replayed verification, invitation and recovery tokens fail safely;
- exactly one active Tenant Master Admin exists per tenant;
- the last Tenant Master Admin cannot be deleted, deactivated or demoted;
- ownership transfer requires reauthentication, target confirmation and atomic role change;
- a Tenant Master Admin can own multiple explicit workspaces without cross-tenant session leakage;
- no tenant or platform dashboard can create a merchant password or bypass public registration and verification.

## 9. Usage and billing tests

- included allowance boundary;
- overage first unit;
- concurrent reservation race;
- failed/cancelled/waived operation settlement;
- voice partial-minute rounding;
- current call at allowance boundary;
- social/telephony external fee mapping;
- upgrade/downgrade/proration;
- plan/rate effective dates;
- duplicate/missing raw usage;
- aggregate reconciliation;
- invoice trace to raw usage and rate version;
- provider native cost vs customer unit/margin.

No paid GA with unexplained reconciliation variance above the accepted threshold.

## 10. Security and privacy tests

- authorization/RLS isolation suite;
- support impersonation controls;
- credential/secret leakage;
- upload malware and parser attacks;
- SSRF and URL redirects/DNS rebinding;
- prompt injection/tool output injection;
- arbitrary action destination/recipient attempts;
- XSS/CSRF/session fixation;
- webhook replay;
- rate/fraud abuse;
- export/delete/retention lineage;
- recording/consent/opt-out behavior.

## 11. Performance and resilience

- web widget load and concurrent chats;
- FlowBot execution throughput/timers;
- AI streaming latency and provider saturation;
- webhook bursts and queue recovery;
- voice concurrent sessions and regional latency;
- database/queue/provider failure injection;
- backup restore and outbox replay;
- dead-letter recovery;
- zero/low-downtime schema migration.

## 12. Scope-drift test

CI/review checks flag new production modules/routes/tables/navigation containing excluded business domains such as POS, Creative Club, inventory, cashier, class attendance, child package or restaurant order management unless a separate approved project explicitly owns them.

## 13. Release gates

Each plan release requires:

- requirement-to-test traceability;
- zero open critical defects;
- entitlement suite pass;
- tenant isolation pass;
- provider confidentiality pass;
- product-specific quality pass;
- usage/billing evidence appropriate to launch stage;
- observability/runbook/rollback;
- founder/product acceptance.
