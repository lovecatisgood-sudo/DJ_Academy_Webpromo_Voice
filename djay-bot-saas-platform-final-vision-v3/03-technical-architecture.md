# 03 · Technical Architecture — DJAY Bot SaaS Platform v3.0

## 1. Architecture principles

1. Reuse and harden the existing FlowBot V1 before replacing proven behavior.
2. Build a modular monolith plus workers first; extract voice/realtime or high-scale components when justified.
3. One canonical domain supports all six plans.
4. FlowBot runtime is deterministic and isolated from LLM code.
5. AI Chatbot and Voice Agent share a Sales Conversation Core but use different channel runtimes.
6. Plan/tier behavior is entitlement-driven and effective-dated.
7. Plans reference stable capability profiles; provider/model mappings remain internal and swappable.
8. Published behavior and commercial configuration is immutable/versioned.
9. Provider output and external events are untrusted.
10. No POS/Creative Club domain modules belong in this repository.

## 2. Logical architecture

```text
Web App / Widget / Social Channels / Voice Channels
                     │
              Edge/API Gateway
                     │
       Authentication + Tenant Context
                     │
            Entitlement Resolver
                     │
          Conversation Orchestrator
          ┌──────────┼──────────┐
          │          │          │
     Flow Engine  Sales Core  Human Inbox
       (no AI)       │
                     ├──────── Text Runtime ── Provider Gateway
                     └──────── Voice Runtime ─ Voice Provider Gateway
                     │
               Action Gateway
                     │
 Contacts / Leads / Knowledge / Appointments / Notifications
                     │
      PostgreSQL + Object Storage + Redis/Queue + Outbox
                     │
        Usage Ledger / Billing / Analytics / Audit
```

## 3. Repository boundaries

```text
apps/
  public-site/
  merchant-web/
  platform-master/ # internal Platform Master Dashboard
  public-widget/
  api/
  workers/
  voice-gateway/
packages/
  auth-tenancy/
  entitlements/
  domain/
  flow-engine/
  sales-core/
  provider-gateway/
  channel-adapters/
  action-gateway/
  usage-billing/
  observability/
  ui/
```

No package named for POS, Creative Club, inventory, class, child/parent or cashier operations is permitted.

### Public signup and tenant provisioning

The public site owns catalog selection, signup, email verification, credential setup and recovery. An idempotent provisioning service creates the verified user, tenant, exactly one active Tenant Master Admin membership, onboarding state, selected subscription and initial entitlement snapshot.

External email and payment operations execute through signed callbacks or transactional outbox jobs. Retries return the existing provisioning result and cannot create a second tenant. Tenant and platform sessions use separate authorization realms.

## 4. Plan and entitlement resolution

Public plan keys are fixed:

```text
flowbot_basic
flowbot_premium
ai_chat_basic
ai_chat_premium
voice_basic_gen1
voice_advanced_gen2
```

At the start of a billable interaction, the resolver creates an immutable entitlement snapshot containing:

- tenant and active product subscription;
- plan/version;
- deployment/agent;
- allowed channels;
- allowed features;
- usage allowance and overage policy;
- capability profile;
- seats/bots/knowledge/concurrency limits;
- effective rate-card version.

The snapshot is attached to the conversation/session and usage records so later plan changes do not rewrite history.

## 5. Conversation orchestrator

The orchestrator owns mode and transitions. It does not generate conversational content.

Modes:

- `flowbot`
- `ai_text`
- `voice`
- `human`
- `closed`

It validates:

- channel and plan entitlement;
- deployment status;
- pinned behavior version;
- business hours;
- human takeover lock;
- quota authorization;
- customer identity/context;
- allowed transitions.

Examples:

- FlowBot Basic cannot route to AI unless AI Chatbot is separately active.
- AI Chatbot Basic rejects LINE/WhatsApp/Messenger bindings.
- AI Chatbot Premium accepts all four text channels.
- Voice Basic resolves `voice_gen1`; Voice Advanced resolves `voice_gen2`.

## 6. Deterministic Flow Engine

### State transition

```text
(flow version + execution state + ordered event + controlled environment)
      -> (new state + commands + domain events)
```

Core requirements:

- immutable published flow versions;
- execution pins starting version;
- canonical schema version;
- pre-publish graph validation;
- unreachable node/broken edge/cycle safeguards;
- durable timers for delays;
- idempotent resume and external-command results;
- ordered execution event stream;
- debug trace and rollback;
- no LLM/model/provider imports in flow-engine package.

FlowBot Basic node entitlement is a subset of Premium. Validation rejects Premium-only nodes before publish for Basic tenants.

## 7. Sales Conversation Core

Shared by AI text and voice. Components:

- versioned business persona/language policy;
- sales-stage controller;
- discovery/qualification planner;
- knowledge retriever;
- approved offer/CTA selector;
- objection policy;
- lead/sales-fact extractor;
- contact verification policy;
- appointment-request logic;
- action proposal builder;
- handover/safety policy;
- evaluation trace.

The Core produces structured output:

```json
{
  "stage": "discovery",
  "facts": [],
  "response_intent": "ask_pain_point",
  "proposed_actions": [],
  "handover": null,
  "channel_response": {}
}
```

The Action Gateway, not the model, executes effects.

## 8. Text runtime

- accepts normalized web/LINE/WhatsApp/Messenger messages;
- loads pinned playbook, knowledge and entitlement snapshot;
- calls provider through provider-neutral interface;
- validates structured output;
- renders to channel capabilities;
- records provider-native usage internally and AI-response units for customer billing;
- streams web responses when supported;
- never includes provider metadata in tenant payloads.

The text model/provider is internal configuration and is not defined by the public Basic/Premium plan names. AI Premium differs primarily by channel entitlement, operational scale and advanced controls.

## 9. Voice runtime and capability profiles

### Public profiles

- `voice_gen1` → First-Generation Voice Engine
- `voice_gen2` → Second-Generation Voice Engine

### Current internal default mappings

```text
voice_gen1 -> google adapter -> gemini-3.1-flash-live-preview
voice_gen2 -> openai adapter -> gpt-realtime-2.1
```

These mappings live in a restricted provider registry and are managed only through the internal Platform Master Dashboard. They are never stored in public plan copy or returned to tenant applications.

The voice runtime handles:

- WebRTC/WebSocket/SIP/telephony adapter lifecycle as selected by ADR;
- audio input/output and interruption;
- session state and reconnect;
- speech/turn events;
- Sales Conversation Core integration;
- action proposals/results;
- transcript/recording policy;
- human transfer/callback;
- usage reservation, provider usage and billable minutes;
- fraud/concurrency/spend controls.

### Generation integrity

- `voice_gen2` can route only to an approved Gen2-equivalent provider profile.
- If no equivalent is available, new Advanced sessions follow incident policy rather than silently downgrading.
- Any temporary degradation, credit or pause policy is capability-based and provider-neutral to tenants.

## 10. Provider Gateway

Internal abstractions:

```ts
interface TextProvider {
  generate(request: TextRequest): Promise<TextResult>;
}

interface RealtimeVoiceProvider {
  createSession(request: VoiceSessionRequest): Promise<VoiceSession>;
}
```

Responsibilities:

- model/profile registry;
- encrypted credentials;
- routing and health;
- request/response normalization;
- timeout/retry/circuit breaker;
- provider-native usage/cost capture;
- safety and content configuration;
- sanitized error mapping;
- internal audit.

Provider/model fields must not cross the tenant API boundary except a legally approved privacy/subprocessor endpoint. The Provider Gateway exposes separate internal administration commands that are callable only by the Platform Master Dashboard with platform-realm authorization; merchant APIs have no provider/model mutation schema.

Browser voice and chat clients receive an opaque platform session identifier and provider-neutral transport contract. Provider credentials, adapter keys and model identifiers remain behind the platform gateway and cannot be inferred from tenant API payloads or client-side configuration.

## 11. Channel architecture

### Web

- signed public widget/deployment key;
- isolated tenant theme/config;
- resumable visitor session;
- history, forms, quick replies, handover and accessibility;
- FlowBot Basic/Premium and AI Chatbot Basic/Premium eligible.

### LINE, WhatsApp, Messenger

- AI Chatbot Premium only;
- encrypted channel credentials;
- signed webhook verification;
- idempotent external event receipt;
- outbound capability renderer;
- credential expiry/health monitoring;
- current policy/template/session/fee configuration.

### Voice

- Voice Basic/Advanced only;
- browser or telephony connections according to deployment;
- number/session ownership and routing;
- jurisdiction and recording policy.

## 12. Action Gateway

Execution path:

1. Sales Core proposes typed action.
2. Gateway validates tenant, actor, plan, deployment and action allow-list.
3. Validate schema, consent, destination and rate limit.
4. Create idempotent action request.
5. Execute server-controlled integration.
6. Record result and feed a result event back to the conversation.
7. Customer receives truthful success/failure wording.

Initial actions are lead/fact/appointment/task/handover/sales-email only.

## 13. Data architecture

System of record: PostgreSQL. Supporting components:

- object storage for uploads/recordings;
- Redis for short-lived session, lock, rate and quota state;
- durable queue/workers for indexing, delivery, email, analytics and billing;
- transactional outbox for effects/events;
- optional vector extension/store with tenant/agent/revision scope.

Canonical entities are defined in document 11. No operational POS entities are permitted.

## 14. Quota and metering

### Customer units

- FlowBot: conversation/execution units;
- AI Chatbot: AI response/message-credit units;
- Voice Agent: minutes under a rate-card rounding rule.

### Internal units

- provider input/output/cached/reasoning/audio units;
- duration;
- channel/telephony fee events;
- storage/egress;
- retries and waived usage.

### Authorization

Before billable work:

1. resolve entitlement/rate snapshot;
2. reserve expected customer units or spend budget atomically;
3. approve/reject/allow overage;
4. settle actual usage after completion;
5. emit immutable usage event;
6. reconcile aggregates and invoices.

Overage is the intended default commercial path after included usage. Safety caps and voice graceful-finish behavior remain configurable.

## 15. Security boundaries

- tenant context established from authenticated identity or signed channel deployment;
- row-level security plus service authorization;
- separate platform and tenant realms;
- provider secrets, model routing and raw costs restricted to internal services and the authorized Platform Master Dashboard;
- Tenant Master Admin and Tenant Admin permissions cannot be elevated into platform provider-routing permissions;
- channel credentials encrypted;
- message bodies excluded from general logs;
- uploads scanned and URL ingestion protected against SSRF;
- tool/action output treated as untrusted;
- support access time-limited and audited.

## 16. Observability

Every trace/event includes safe identifiers:

- correlation ID;
- tenant ID;
- product and public plan key;
- deployment/conversation/call ID;
- channel;
- pinned behavior and entitlement versions;
- internal capability profile (restricted visibility);
- latency, status and usage.

Provider names/costs are recorded only in restricted telemetry dimensions.

## 17. Deployment evolution

Initial topology:

- merchant/API modular application;
- worker processes;
- separate voice gateway when realtime requirements demand it;
- managed PostgreSQL, queue/cache and object storage.

Extract services only for independent scale, security boundary, failure isolation or team ownership—not to imitate an enterprise diagram.

## 18. Required ADRs

Before relevant implementation:

- repository/runtime/framework versions;
- database/RLS strategy;
- text provider profile and evaluation;
- browser voice vs telephony sequence;
- telephony provider/number eligibility;
- social connection/onboarding policies;
- payment provider, tax and THB billing;
- customer usage-unit definitions/rounding;
- provider-equivalence and Advanced degradation policy;
- retention/recording and cross-border processing.
