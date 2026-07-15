# PRD & Roadmap — Conversational Suite SaaS Platform

**Status:** future destination, not FlowBot V1 scope  
**Products:** FlowBot · AI Chatbot · Voice Sales Agent

## 1. Vision

Build one B2B SaaS that helps business owners automate customer conversations and sales follow-up through three product tiers:

| Tier | Product | Primary value |
|---|---|---|
| Starter | FlowBot | Deterministic FAQ, guided CTA, lead capture, human handoff; no token cost |
| Pro | AI Chatbot | Knowledge-grounded sales conversation, objection handling, qualification, CTA and appointment capture |
| Voice | Voice Sales Agent | Personalized voice sales calls/conversations, qualification, objection handling, appointment capture |

FlowBot is the first operational shell. Its inbox, CRM, customer identity, conversation model, analytics, scheduler, and settings patterns should later become shared platform modules. The products differ mainly in the brain and enabled channels, not in duplicated CRM systems.

## 2. Target platform architecture

```text
apps/
  dashboard/        shared tenant-facing application
  platform-admin/   internal SaaS administration
  widget/           web chat delivery
  gateway/          LINE / Messenger / WhatsApp webhooks and adapters
  voice/            telephony and realtime voice runtime
packages/
  core-flow/        deterministic FlowBot engine
  core-ai/          AI sales chatbot engine
  core-voice/       voice orchestration
  crm/              shared customers, conversations, leads, notes, statuses
  identity/         tenants, users, memberships and roles
  billing/          plans, subscriptions, entitlements and usage
  channels/         channel-normalization and rendering adapters
  scheduler/        shared availability and booking module
  db/ shared/       schema, contracts and validation
```

## 3. Shared platform rules

### 3.1 Multi-tenancy

- Shared Postgres schema with `tenant_id` on tenant-owned data.
- Application tenant scoping remains mandatory; RLS is defense in depth.
- RLS context is transaction-scoped so pooled connections cannot leak tenant context.
- Files use tenant-prefixed storage paths.
- Per-tenant rate limits, quotas, metering, audit logs, export and erasure.

### 3.2 Shared customer identity

A single customer can be linked to web chats, LINE, Messenger, WhatsApp and voice calls. Channel identities and phone/email matches feed a suggest-and-confirm workflow. Silent profile merging is prohibited.

### 3.3 Shared inbox and CRM

All channels use the same conversation states, CRM status slugs, notes, stars, archive, soft delete, customer panel, timeline, and appointment links. Voice calls appear as conversations with transcripts and permitted recording metadata.

### 3.4 Product engines

Every brain implements `INTEGRATION-CONTRACT.md`:

- FlowBot: immutable scripted flow version.
- AI Chatbot: RAG and LLM sales behavior.
- Voice: speech input/output around the appropriate sales brain.

The channel gateway receives normalized inbound messages and converts channel-neutral outbound messages into channel-specific formats.

## 4. SaaS information architecture

### Overview

Cross-channel sessions, lead conversion, appointment conversion, CRM funnel, response/fallback metrics, AI/voice usage, and actionable exceptions.

### Chat

Omnichannel inbox with All/Web/LINE/Messenger/WhatsApp/Voice filters, unread badges, takeover, customer profile, notes and CRM actions. Locked channels serve as transparent upgrade/connect states.

### Customers

Cross-channel timeline, customer notes, identifiers, conversations, leads, bookings and consent/privacy actions.

### Settings

- Knowledge: FlowBot editor or AI/voice knowledge sources depending on product.
- Channels: widget and external integrations.
- Team: owner/admin/agent roles.
- Business profile and branding.
- Billing, plan and usage.
- Data/privacy, retention, export, erasure and future learning consent.

## 5. Self-serve onboarding target

Target under 15 minutes for a new Starter tenant:

1. Create organization and business profile.
2. Choose a bilingual industry template.
3. Customize contact details and CTA.
4. Install and verify the widget.
5. Test and publish.

Pro and Voice onboarding may include paid setup until the configuration process becomes reliable enough for self-service.

## 6. Governed learning — future only

Do not implement this during FlowBot V1 or before the first paying client and multi-tenant controls are stable.

The future improvement system may be inspired by agent-learning architectures, but it must be conservative:

- Preserve each agent's approved identity, sales process and compliance boundaries.
- No autonomous production prompt, flow or tool changes.
- Candidate improvements are generated offline, evaluated against regression suites, compared with the current version, and require human approval before release.
- Customer-specific data never enters shared learning without explicit tenant consent and proper anonymization.
- Tenant-specific improvement remains isolated to that tenant unless separately approved for generalized learning.
- Every production behavior version is traceable and reversible.
- Stable quality is preferred over constant optimization or gradual drift.

## 7. Roadmap

### Phase 0 — contract alignment

Keep the three repositories aligned on the integration contract, status slugs, message model, customer identity rules, and engine boundary. No feature expansion.

### Phase 1 — FlowBot V1 and V1.5

Ship the corrected single-tenant FlowBot and later the scheduler. Use it on the owner's business, collect operational feedback, and stabilize all core flows.

### Phase 2 — first-client readiness and multi-tenant core

After the first client is ready to onboard:

- organizations, memberships and roles;
- enabled RLS and isolation tests;
- tenant onboarding and configuration;
- basic platform-admin tenant directory;
- manual subscription/entitlement controls sufficient for hand-onboarded pilots.

Exit: at least three isolated pilot tenants with stable support operations.

### Phase 3 — billing and self-serve Starter

Plans, subscriptions, entitlements, usage records, payment provider abstraction, template gallery, guided onboarding and plan management.

Exit: an unfamiliar business can pay and launch FlowBot without developer intervention.

### Phase 4 — omnichannel gateway

LINE first for Thailand, then Messenger and WhatsApp. Shared inbox, reconnect/retry behavior, channel health, notification preferences and browser push/PWA.

### Phase 5 — AI Chatbot Pro

Migrate the AI sales chatbot behind `core-ai`; add knowledge ingestion, retrieval evaluation, sales behavior configuration, token metering, setup workflow and shared CRM integration. Keep FlowBot deterministic; a hybrid handoff may be offered as an explicit paid capability later.

### Phase 6 — Voice Sales Agent

Migrate the voice agent behind `core-voice`; integrate telephony, ASR/TTS, call events, transcripts, consent/recording policy, minute metering and shared appointments/CRM.

### Phase 7 — governed improvement and consented training data

Only after multi-tenant privacy, evaluation and approval infrastructure exists:

- versioned tenant consent, default off;
- anonymization and sensitive-data exclusion;
- isolated training/evaluation stores;
- candidate flow/keyword suggestions and model improvements;
- human approval and rollback;
- tenant-visible value such as suggested FAQ branches and missed-intent clustering.

### Phase 8 — mobile operations

PWA first, then native mobile app if inbox usage justifies it: push notifications, replies, customer profile and CRM actions.

### Phase 9 — ecosystem and growth

Calendar integrations, tenant APIs/webhooks, agent seats, reseller/agency tools, affiliate program, deeper funnel analytics and localization.

## 8. Key risks

- Premature multi-product complexity → keep V1 exclusions hard.
- Contract drift between repositories → versioned contract and automated contract tests.
- Channel-provider review delays → LINE-first delivery and decoupled adapters.
- AI/voice cost overruns → entitlements, quotas and margin monitoring before launch.
- Behavior drift → governed versions, evaluation and approval; no autonomous production learning.
- Privacy risk → purpose limitation, tenant controls, erasure, consent, anonymization and auditability.

## 9. Success metrics

- Median Starter time-to-live under 15 minutes.
- New-tenant support contacts below 0.3 per onboarding.
- Healthy Starter-to-Pro conversion.
- Product gross margin tracked separately for deterministic, AI and voice tiers.
- CRM lead-to-appointment and appointment-to-closed-deal improvement.
- Zero confirmed cross-tenant exposure.
