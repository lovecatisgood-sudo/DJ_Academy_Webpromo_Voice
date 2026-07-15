# 02 · Product Requirements Document — DJAY Bot SaaS Platform v3.0

*Requirements use Must / Should / Could / Later. Package authority is `14-package-entitlements-and-provider-routing.md`.*

## 1. Product scope

The product is a multi-tenant B2B SaaS for three conversation-automation products and six plans:

- FlowBot Basic / Premium;
- AI Chatbot Basic / Premium;
- Voice Agent Basic / Advanced.

The platform includes only the shared services needed to configure, deploy, supervise, measure and bill these products.

### Explicit exclusions

- POS, order management, inventory, cashier, table and merchant-payment functions;
- Creative Club, child/parent, class, attendance, package-redemption or education-management functions;
- staff payroll/rostering;
- a general-purpose CRM beyond leads generated or managed through platform conversations;
- autonomous self-learning in V1;
- arbitrary tenant code/tool execution.

## 2. User roles

### Platform roles

- **Platform Owner:** full platform authority through the internal Platform Master Dashboard.
- **Platform AI Operations:** provider, model, capability-profile and routing configuration through the internal Platform Master Dashboard only.
- **Platform Operations:** tenant support, channels and incidents through audited access; no model-routing changes unless explicitly granted Platform AI Operations permission.
- **Platform Finance:** plans, rates, invoices, usage and margin; conversation content denied by default.

### Tenant roles

- **Tenant Master Admin:** subscriber-created workspace owner with subscriptions, billing, users and tenant-owned product configuration; no provider/model visibility or configuration.
- **Tenant Admin:** products, channels, knowledge, inbox, leads and analytics; no provider/model visibility or configuration and no payment-method/cancellation authority unless granted.
- **Sales Agent:** assigned conversations, contacts, leads, appointment requests and follow-up tasks.
- **Analyst/Viewer:** read-only analytics and approved records.

Every request must enforce tenant, role and entitlement server-side.

## 3. Package and subscription requirements

### FR-1 Catalog

1. **Must:** expose exactly six public plan keys: `flowbot_basic`, `flowbot_premium`, `ai_chat_basic`, `ai_chat_premium`, `voice_basic_gen1`, `voice_advanced_gen2`.
2. **Must:** allow one active tier per product family per tenant.
3. **Must:** allow a tenant to subscribe to any combination across the three product families.
4. **Must:** treat trials, negotiated limits, setup service, overage and credits as modifiers—not new public plans.
5. **Must:** all capabilities and limits are resolved from effective-dated plan versions.
6. **Must:** package downgrade validation identifies configurations that exceed the destination plan and offers a safe remediation path.
7. **Must:** cancellation of one product preserves shared data and other active products.

### FR-2 FlowBot Basic

1. **Must:** deterministic web chatbot with no LLM calls.
2. **Must:** core nodes: message, image/file reference, button/quick reply, input capture, form, simple condition, jump and end.
3. **Must:** publish immutable versions and pin active executions to the starting version.
4. **Must:** capture contacts/leads and send approved merchant notifications.
5. **Must:** provide conversation history and basic analytics.
6. **Must:** enforce Basic plan bot, execution, storage and seat limits from entitlements.
7. **Must:** customer-facing widget retains platform branding unless overridden by an entitled policy.
8. **Must not:** expose AI configuration or invoke the Sales Conversation Core.

### FR-3 FlowBot Premium

1. **Must:** include all FlowBot Basic capabilities.
2. **Must:** add advanced conditions/variables, business hours, delays/timers, reusable subflows/blocks and advanced validation.
3. **Must:** support multiple active bots/deployments within configured limits.
4. **Must:** support team inbox/handover, assignment and routing.
5. **Must:** support approved webhook/API integrations through a deterministic integration gateway.
6. **Must:** support branding controls and advanced analytics/export according to entitlements.
7. **Must:** allow an explicit FlowBot→AI/human transition only when the tenant owns the destination entitlement.
8. **Must:** remain non-AI in every runtime path.

FlowBot Basic and Premium are web-chat plans in this catalog. Social delivery is not promised by these two plan SKUs unless a future accepted package revision changes document 14.

### FR-4 AI Chatbot Basic

1. **Must:** text-only AI chatbot deployed on web chat only.
2. **Must:** use a governed Sales Conversation Core, approved business knowledge and approved offer/CTA rules.
3. **Must:** discover interest and pain points, qualify appropriately, answer questions, handle objections and move toward a CTA.
4. **Must:** capture and validate contact details before follow-up actions.
5. **Must:** request multiple available time options for appointment requests and state that merchant confirmation is pending.
6. **Must:** create/update lead and sales facts and send an approved structured email notification to the merchant.
7. **Must:** support human handover and business-hours/offline behavior.
8. **Must:** provide merchant test mode with sources, sales stage, extracted facts and proposed actions.
9. **Must:** enforce web-only channel binding.
10. **Must:** apply Basic plan usage, knowledge, deployment, seat and storage limits.

### FR-5 AI Chatbot Premium

1. **Must:** include all AI Chatbot Basic behavior.
2. **Must:** support simultaneous deployment on web chat, LINE, WhatsApp and Facebook Messenger.
3. **Must:** normalize all four channels into one conversation/contact/lead domain.
4. **Must:** provide channel connection, verification, health, token-expiry and webhook-delivery operations.
5. **Must:** adapt replies and controls to each channel’s capability and policy.
6. **Must:** provide advanced team routing, channel analytics, higher limits and web-branding controls according to entitlements.
7. **Must:** avoid duplicate leads when one customer appears across channels; uncertain identity matches require review.
8. **Must:** keep the underlying text-model provider internal.

### FR-6 Voice Agent Basic

1. **Must:** present itself as the **First-Generation Voice Engine**.
2. **Must:** route through internal capability profile `voice_gen1`; the initial default provider/model is confidential internal configuration.
3. **Must:** use the shared Sales Conversation Core and tenant knowledge.
4. **Must:** support realtime speech, interruption/barge-in, silence handling, automated-agent disclosure and graceful recovery.
5. **Must:** capture lead, interest, pain points, CTA outcome, contact details and appointment time options.
6. **Must:** persist call/session events, transcript where enabled/available, summary, outcome and actions.
7. **Must:** support human transfer or callback request where the configured voice channel supports it.
8. **Must:** enforce Basic minutes, concurrency, phone-number/session, storage and retention entitlements.
9. **Must:** show customer usage in minutes, not provider audio tokens.

### FR-7 Voice Agent Advanced

1. **Must:** present itself as the **Second-Generation Voice Engine** and the smartest voice tier.
2. **Must:** route through internal capability profile `voice_gen2`; the initial default provider/model is confidential internal configuration.
3. **Must:** include all Voice Agent Basic workflows.
4. **Must:** target stronger reasoning, complex objection handling, alphanumeric recognition, interruption behavior, noise/silence handling and instruction adherence.
5. **Must:** provide higher configurable minutes/concurrency and advanced quality analytics.
6. **Must:** never silently deliver a lower generation while charging Advanced. Fallback must use an approved equivalent profile or follow the documented degradation/credit policy.

### FR-8 Provider confidentiality

1. **Must:** customer UI, public API responses, widget payloads, call disclosures, invoices, emails, logs exposed to tenants and marketing copy must not reveal provider/model identifiers.
2. **Must:** provider/model routing may be viewed or changed only in the internal Platform Master Dashboard by Platform Owner or explicitly authorized Platform AI Operations roles.
3. **Must:** errors are mapped to provider-neutral codes and messages.
4. **Must:** plan records reference stable capability profiles, not direct provider model names.
5. **Must:** legally required privacy/subprocessor disclosures remain truthful.
6. **Must:** Tenant Master Admin, Tenant Admin and every other tenant role must receive only public capability labels and must never receive provider/model fields or configuration endpoints.
7. **Must:** every provider/model/routing change requires reauthorization, validation, immutable audit history, effective time, test evidence and rollback capability.
8. **Must:** browser and channel clients receive opaque platform session/configuration contracts; they must not connect using payloads that disclose provider/model identifiers.

## 4. Shared workspace requirements

### FR-9 Identity and tenancy

- the subscriber creates and verifies the Tenant Master Admin account through registration on the public DJAY Bot SaaS site;
- successful registration idempotently creates the user, tenant, exactly one active Tenant Master Admin membership, onboarding state and selected pending/trial subscription;
- no platform or tenant dashboard creates a merchant password or bypasses the subscriber registration and verification flow;
- the last Tenant Master Admin cannot be removed or demoted; ownership transfer requires reauthentication, target confirmation and immutable audit;
- users may belong to multiple tenants through memberships;
- tenant isolation uses database and service-layer defense in depth;
- workspace switching is explicit;
- all tenant data carries tenant scope where practical;
- support impersonation is time-limited, approved, visible and audited.

### FR-10 Contacts and identities

- store normalized email, phone, widget, LINE, WhatsApp and Messenger identities separately;
- verified identical identities may link automatically;
- weak similarity creates a merge candidate, never an automatic merge;
- preserve merge/undo history;
- record communication/recording consent and opt-out.

### FR-11 Leads and sales facts

- lead status, owner, source, product/channel and last/next action;
- customer interest and pain points with evidence;
- qualification facts and confidence/status;
- objections and responses;
- CTA offered and accepted/declined/considering;
- appointment request and proposed time options;
- final outcome when entered by merchant;
- lightweight lead workspace only—no general CRM scope expansion.

### FR-12 Unified conversations and inbox

- one conversation model for web, LINE, WhatsApp, Messenger, voice and human messages/events;
- explicit mode transitions between FlowBot, AI, voice and human;
- assignment, tags, status, notes, search and filters;
- delivery states and retry visibility;
- no duplicate external event processing;
- human takeover immediately suspends automated replies until released.

### FR-13 Knowledge and sales configuration

- ingest manual facts, URLs, PDF, DOCX and TXT;
- preserve source revision/provenance and indexing status;
- tenant- and agent-scoped retrieval;
- structured product/service, price, eligibility, promotion, CTA and escalation rules;
- publish immutable sales-playbook versions;
- conflicting or stale sources surfaced for review.

### FR-14 Action Gateway

Approved V1 actions:

- create/update lead;
- record sales facts;
- create appointment request and time options;
- create follow-up task;
- request human handover;
- send an approved structured sales-team email.

Every action requires typed schema validation, tenant authorization, entitlement, idempotency, audit, destination allow-list and deterministic result handling. Arbitrary email recipients, code execution and unrestricted webhooks are prohibited.

### FR-15 Channels

- web widget for FlowBot and AI Chatbot;
- LINE, WhatsApp and Facebook Messenger required for AI Chatbot Premium;
- channel adapters verify signatures, deduplicate webhooks, refresh credentials and normalize events;
- unsupported interactive elements degrade clearly;
- channel-specific template/session/fee policies are versioned configuration;
- provider/channel outages expose neutral operational status.

### FR-16 Voice channels

- support browser voice sessions and/or telephony through channel adapters selected by deployment ADR;
- plan tier controls voice engine generation, usage and limits—not the public provider name;
- telephony numbers, recording and outbound calling require jurisdiction/provider eligibility;
- fraud, destination, concurrency and spend controls are mandatory before production telephony;
- inbound or consent-based sales use cases precede mass outbound automation.

## 5. Analytics, usage and billing

### FR-17 Analytics

- conversation and lead funnel by product, plan, agent, channel, campaign/source and time;
- FlowBot completion/drop-off and node diagnostics;
- AI interest, pain point, objection, CTA, contact and appointment metrics;
- voice latency, interruption, recognition, transfer and outcome metrics;
- quality/evaluation metrics separate from sales outcomes;
- unknown/unverified data states remain visible.

### FR-18 Metering

1. **Must:** preserve provider-native usage and customer-billable usage separately.
2. **Must:** FlowBot customer units are configured as conversations/executions.
3. **Must:** AI Chatbot customer units are configured as AI responses/message credits.
4. **Must:** Voice Agent customer units are minutes under a documented rounding policy.
5. **Must:** included allowance and overage rates come from the effective plan version.
6. **Must:** default commercial behavior supports charged overage after included usage; tenants may have configured safety caps.
7. **Must:** exact pre-authorization uses atomic quota reservation; async rollups are reporting/reconciliation only.
8. **Must:** active voice calls use a graceful cap policy rather than abrupt unexplained termination.
9. **Must:** customers never see raw provider tokens/costs; platform finance can reconcile them.

### FR-19 Billing

- one tenant invoice can contain multiple active product subscriptions;
- subscription line items identify public product/tier only;
- usage/overage lines identify understandable units and period;
- invoice lines trace to plan/rate versions and reconciled usage;
- upgrade/downgrade, proration, dunning, tax and THB/payment-provider behavior require accepted ADRs;
- external social/telephony fees follow the published rate card and are not silently hidden.

## 6. Onboarding and lifecycle

- public registration, email verification, credential setup and tenant provisioning precede workspace onboarding;
- signup and payment retries must not create duplicate users, tenants, memberships or subscriptions;
- choose one of the six plans or add a second/third product;
- guided setup ends with a working test conversation;
- plan-specific onboarding only asks relevant questions;
- AI/voice onboarding configures business facts, sales goal, CTA, lead fields and merchant notification;
- AI Premium onboarding connects selected social channels;
- Voice onboarding performs microphone/call, latency, disclosure and transfer tests;
- upgrade preserves configuration;
- downgrade shows blocking features/data and remediation;
- deletion/export follows tenant policy and legal requirements.

## 7. Non-functional requirements

| Area | Requirement |
|---|---|
| Availability | measurable SLOs per web, social and voice surface before GA |
| Web response | deterministic responses p95 target set after baseline; AI first visible response streamed where possible |
| Voice latency | measured end-of-turn to audible response by capability profile and network |
| Isolation | no cross-tenant data access under tests or production controls |
| Idempotency | every external webhook, action and billable event safely retryable |
| Versioning | published flows, playbooks, knowledge/offer attachments, plans and rate cards immutable |
| Accessibility | WCAG-aligned merchant UI and accessible web widget |
| Localization | Thai and English merchant/customer experiences; language matching by agents |
| Observability | tenant/product/plan/channel/correlation IDs without general message-body logging |
| Recovery | tested backup, restore, replay, dead-letter and rollback procedures |

## 8. Final acceptance journeys

1. A new SME registers on the public SaaS site, verifies its Tenant Master Admin, receives exactly one isolated tenant and cannot access another tenant or platform route.
2. FlowBot Basic merchant publishes a core web flow and receives a captured lead without any AI call.
3. FlowBot Premium merchant uses variables/subflows, webhook integration and team handover while the active user remains pinned to the original flow version.
4. AI Chatbot Basic operates only on web, discovers pain points, reaches CTA, captures contact/time options and emails the merchant.
5. AI Chatbot Premium receives one customer across web and LINE/WhatsApp/Messenger without duplicating the lead and respects each channel’s capabilities.
6. Voice Agent Basic is shown only as First-Generation, records billable minutes and completes a standard sales/appointment-request journey.
7. Voice Agent Advanced is shown only as Second-Generation, routes to the Gen2 capability profile and passes advanced quality tests.
8. A customer cannot obtain Premium/Advanced capability through a Basic entitlement.
9. No tenant-facing artifact reveals `Google`, `Gemini`, `OpenAI`, `GPT` or provider model IDs except legally required privacy/subprocessor content.
10. Overage is calculated from reconciled customer units and traceable to immutable raw usage.
11. Searching the repository and generated assets finds no Creative Club/POS domain implementation introduced by this project.
