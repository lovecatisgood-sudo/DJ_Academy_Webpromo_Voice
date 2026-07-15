# 14 · Authoritative Package, Entitlement & Provider Routing Matrix v3.0

This document is the canonical commercial/technical mapping for the six public plans. Exact numeric prices/allowances are effective-dated configuration and intentionally marked `TBD` until approved.

## 1. Public plans and internal keys

| Public product | Public tier | Internal plan key | Product key |
|---|---|---|---|
| FlowBot | Basic | `flowbot_basic` | `flowbot` |
| FlowBot | Premium | `flowbot_premium` | `flowbot` |
| AI Chatbot | Basic | `ai_chat_basic` | `ai_chat` |
| AI Chatbot | Premium | `ai_chat_premium` | `ai_chat` |
| Voice Agent | Basic | `voice_basic_gen1` | `voice_agent` |
| Voice Agent | Advanced | `voice_advanced_gen2` | `voice_agent` |

Exactly one active plan per product key may exist for a tenant. A tenant can own up to three subscriptions—one FlowBot, one AI Chatbot and one Voice Agent.

## 2. Public feature matrix

| Entitlement | FlowBot Basic | FlowBot Premium | AI Basic | AI Premium | Voice Basic | Voice Advanced |
|---|---:|---:|---:|---:|---:|---:|
| Web text widget | Yes | Yes | Yes | Yes | No | No |
| LINE | No | No | No | Yes | No | No |
| WhatsApp | No | No | No | Yes | No | No |
| Facebook Messenger | No | No | No | Yes | No | No |
| Realtime voice channel | No | No | No | No | Yes | Yes |
| AI/LLM conversation | No | No | Yes | Yes | Yes | Yes |
| Core Flow nodes/forms | Yes | Yes | N/A | N/A | N/A | N/A |
| Advanced Flow logic/variables/delays/subflows | No | Yes | N/A | N/A | N/A | N/A |
| Multiple active FlowBots | Lower/TBD | Higher/TBD | N/A | N/A | N/A | N/A |
| Webhook/API integration | No | Yes, approved | Via Action Gateway | Via Action Gateway | Via Action Gateway | Via Action Gateway |
| Human handover | Basic owner workflow | Team routing | Yes | Advanced routing | Transfer/callback | Transfer/callback |
| Knowledge base | No/structured flow content | No/structured flow content | Yes | Yes, higher limits | Yes | Yes |
| Sales Conversation Core | No | No | Yes | Yes | Yes | Yes |
| Interest/pain-point capture | Form/rule based | Form/rule based | Natural AI | Natural AI | Natural voice | Natural voice |
| Objection handling | Scripted branches | Advanced scripted branches | AI | AI | Gen1 AI | Gen2 AI |
| CTA/contact/appointment request | Rule/form based | Rule/form based | Yes | Yes | Yes | Yes |
| Platform branding | Yes | Configurable/remove | Yes | Configurable/remove on web | Product disclosure | Product disclosure |
| Advanced analytics | No | Yes | Core | Omnichannel | Core | Advanced |
| Public generation label | N/A | N/A | N/A | N/A | First-Generation | Second-Generation |

`TBD` numeric limits are loaded from `plan_versions`; they are not absent capabilities.

## 3. Exact plan definitions

### 3.1 FlowBot Basic

Purpose: low-cost predictable website automation.

Required entitlements:

- `channel.web = true`
- `ai.enabled = false`
- `flow.nodes.core = true`
- `flow.nodes.advanced = false`
- `flow.forms = true`
- `flow.versioning = true`
- `flow.lead_capture = true`
- `flow.email_notification = true`
- `flow.team_routing = false_or_limited`
- `flow.webhook = false`
- `branding.remove = false`
- `analytics.level = core`

### 3.2 FlowBot Premium

Purpose: advanced website automation and operational control.

Adds:

- `flow.nodes.advanced = true`
- `flow.variables = true`
- `flow.delays = true`
- `flow.subflows = true`
- `flow.business_hours = true`
- `flow.team_routing = true`
- `flow.webhook = approved`
- `branding.remove = true`
- `analytics.level = advanced`
- higher bot/execution/storage/seat limits.

It remains `ai.enabled = false`.

### 3.3 AI Chatbot Basic

Purpose: AI sales chatbot for website only.

- `channel.web = true`
- `channel.line = false`
- `channel.whatsapp = false`
- `channel.messenger = false`
- `ai.text = true`
- `sales_core = true`
- `knowledge = true`
- `lead_capture = true`
- `appointment_request = true`
- `sales_email_action = true`
- `human_handover = true`
- `analytics.level = core`
- Basic knowledge/message/deployment/seat limits.

### 3.4 AI Chatbot Premium

Purpose: omnichannel AI sales chatbot.

All AI Basic capabilities plus:

- `channel.line = true`
- `channel.whatsapp = true`
- `channel.messenger = true`
- simultaneous channel binding within limits;
- advanced assignment/routing;
- cross-channel identity/lead continuity;
- advanced channel analytics;
- higher knowledge/message/deployment/seat limits;
- web branding controls.

### 3.5 Voice Agent Basic

Purpose: cost-effective standard realtime voice sales.

- `voice.enabled = true`
- `voice.capability_profile = voice_gen1`
- public label `First-Generation Voice Engine`
- Sales Core, knowledge, lead, CTA, appointment, email and handover/transfer;
- transcript/summary according to policy;
- Basic minutes/concurrency/storage/number/session limits;
- core quality analytics.

### 3.6 Voice Agent Advanced

Purpose: smartest realtime voice sales experience.

- `voice.enabled = true`
- `voice.capability_profile = voice_gen2`
- public label `Second-Generation Voice Engine`
- all Basic workflows;
- advanced reasoning/objection/recognition/interruption/noise capability target;
- higher minutes/concurrency limits;
- advanced quality analytics;
- no silent fallback to Gen1.

## 4. Internal confidential provider routing

| Capability profile | Current default provider adapter | Current default model ID | Customer disclosure |
|---|---|---|---|
| `voice_gen1` | Google | `gemini-3.1-flash-live-preview` | Never in ordinary UI; say First-Generation |
| `voice_gen2` | OpenAI | `gpt-realtime-2.1` | Never in ordinary UI; say Second-Generation |

The Google model is currently a preview identifier, so the routing layer must support tested replacement/equivalent profiles. The public plan contract remains the generation capability rather than permanent vendor identity.

Text and voice provider/model selection is internal and may be configured independently only through the Platform Master Dashboard. AI Basic/Premium tier difference is not a promise of different hidden text models.

Platform routing authority:

- Platform Owner and explicitly delegated Platform AI Operations roles may view or change provider/model routing in the internal Platform Master Dashboard;
- Tenant Master Admin, Tenant Admin and every other tenant role are explicitly denied provider/model visibility and configuration;
- merchant APIs and tenant DTOs contain capability profiles and public generation labels only;
- each routing change requires reauthentication, compatibility/evaluation evidence, effective dating, immutable audit and rollback;
- browser/widget/channel session contracts remain opaque and do not disclose the selected provider, adapter or model.

## 5. Provider leakage policy

Forbidden in ordinary customer/tenant surfaces:

- provider/company names;
- model IDs/families;
- provider-specific token names;
- SDK errors/status codes;
- provider cost/routing priority.

Allowed:

- restricted internal Platform Master Dashboard;
- internal audit/telemetry;
- legally required privacy, DPA and subprocessor documentation;
- support communication approved for a specific incident/legal need.

Public voice wording:

- Basic: “Powered by our First-Generation Voice Engine.”
- Advanced: “Powered by our Second-Generation Voice Engine—our smartest voice experience.”

## 6. Customer usage units

| Product | Customer unit | Internal cost units retained |
|---|---|---|
| FlowBot | conversation/execution credit | nodes, compute, storage, delivery |
| AI Chatbot | AI response/message credit | input/output/cached/reasoning tokens, channel fees |
| Voice Agent | voice minute | audio/text/reasoning tokens, duration, telephony fees |

The customer sees allowance, used amount, overage rate and projected overage. Internal finance sees provider-native usage/cost and gross margin.

## 7. Overage policy

Locked principles:

- every plan has included monthly usage;
- usage above allowance is chargeable at its effective plan overage rate;
- exact rate is approved later and versioned;
- usage is reserved/settled atomically;
- customer alerts before/at thresholds;
- tenant may have a safety cap;
- active voice calls follow graceful completion/limit policy;
- failed/waived operations are settled according to rate rules;
- invoices trace to reconciled events.

## 8. Upgrade and downgrade

### Upgrade

- preserves agents, data, conversations and usage history;
- activates new entitlements at effective time;
- prompts merchant to configure newly available features/channels;
- never automatically publishes new behavior without review.

### Downgrade

- preflight detects active social bindings, Premium nodes, integrations, bot counts, knowledge/usage or concurrency above destination limits;
- merchant must remove/disable/archive or schedule end-of-period downgrade;
- history remains readable according to retention;
- no configuration is silently deleted.

## 9. Multi-product behavior

Examples:

- FlowBot Premium + AI Chatbot Basic: FlowBot may transfer web conversation to AI; AI remains web only.
- AI Chatbot Premium + Voice Basic: shared lead/knowledge/playbook with social text and Gen1 voice.
- all three products: unified workspace; FlowBot deterministic entry, AI text continuation, Voice follow-up/voice channel as configured.

No product subscription is mandatory for another, except a cross-product transition requires both source and destination entitlements.

## 10. Public catalog constraints

- no seventh Enterprise card;
- no POS/Creative Club plan;
- no provider-branded voice tier;
- no “unlimited” claim without explicit fair-use/hard-limit definition;
- no social access in AI Basic;
- no AI claim in FlowBot;
- no Advanced voice delivered through unqualified Gen1 capability.

## 11. Commercial values to approve later

For each plan version:

- recurring THB price;
- included usage;
- overage rate/rounding;
- bots/agents/deployments;
- seats;
- knowledge/files/storage;
- retention;
- concurrency/numbers;
- support/SLA;
- branding;
- trial allowance;
- social/telephony fee treatment.

These decisions change plan-version data and public copy, not the six-plan architecture.

## 12. Model-verification note

The current internal model identifiers were verified against official provider documentation on 13 July 2026:

- Google Gemini API model page and changelog for `gemini-3.1-flash-live-preview` (a preview realtime audio-to-audio model): `https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-live-preview` and `https://ai.google.dev/gemini-api/docs/changelog`
- OpenAI API model page for `gpt-realtime-2.1`: `https://developers.openai.com/api/docs/models/gpt-realtime-2.1`

Engineering must re-verify model availability, pricing, regions, limits and terms at the start of the voice implementation milestone. The public plan contract remains the internal generation/capability profile.
