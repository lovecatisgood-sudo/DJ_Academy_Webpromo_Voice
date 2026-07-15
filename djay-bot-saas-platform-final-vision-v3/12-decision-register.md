# 12 · Decision Register — DJAY Bot SaaS Platform v3.0

*Highest-authority bundle document. Changes require a dated accepted ADR and synchronized updates.*

## 1. Locked scope decisions

| ID | Decision | Status |
|---|---|---|
| D-000 | Public platform name is DJAY Bot SaaS Platform | Locked |
| D-001 | Product is a multi-tenant B2B SaaS for FlowBot, AI Chatbot and Voice Agent | Locked |
| D-002 | Public catalog contains exactly six plans | Locked |
| D-003 | No POS, Creative Club, class/child/parent, inventory, cashier, payroll or restaurant operations | Locked |
| D-004 | Shared inbox/contacts/leads/knowledge/analytics/billing are platform services, not additional public products | Locked |
| D-005 | A tenant may subscribe to one tier per product and combine products in one workspace | Locked |
| D-006 | Enterprise/custom requirements use overrides on the six plans, not a seventh public plan | Locked |
| D-007 | Every SME subscriber creates and verifies its Tenant Master Admin through the public DJAY Bot SaaS registration flow | Locked |
| D-008 | The initial release has exactly one active Tenant Master Admin per tenant; transfer is explicit, reauthenticated and audited | Locked |
| D-009 | Platform staff and tenant dashboards do not create merchant passwords; users complete credential setup on the SaaS site | Locked |

## 2. Locked package decisions

| ID | Decision | Status |
|---|---|---|
| P-001 | FlowBot Basic = essential deterministic web chatbot, no AI | Locked |
| P-002 | FlowBot Premium = advanced deterministic web chatbot, no AI | Locked |
| P-003 | FlowBot public plans do not promise social channels in v3 catalog | Locked |
| P-004 | AI Chatbot Basic = text-only AI chatbot on web chat only | Locked |
| P-005 | AI Chatbot Premium = text-only AI chatbot on web, LINE, WhatsApp and Facebook Messenger | Locked |
| P-006 | Voice Agent Basic customer label = First-Generation Voice Engine | Locked |
| P-007 | Voice Agent Advanced customer label = Second-Generation Voice Engine and smartest tier | Locked |
| P-008 | Current internal Voice Basic default = `voice_gen1` / Google adapter / `gemini-3.1-flash-live-preview` | Locked current routing; swappable by approved equivalent |
| P-009 | Current internal Voice Advanced default = `voice_gen2` / OpenAI adapter / `gpt-realtime-2.1` | Locked current routing; swappable by approved equivalent |
| P-010 | Provider/model names are hidden from ordinary customer-facing surfaces | Locked |
| P-011 | Legally required subprocessor/privacy disclosures remain truthful | Locked |
| P-012 | Subscription allowance includes model/API cost; excess usage is chargeable under effective overage rates | Locked |
| P-013 | Exact price, included usage and overage amount are configuration decisions, not source constants | Locked |
| P-014 | Provider/model routing is visible and configurable only in the internal Platform Master Dashboard; Tenant Master Admin and Tenant Admin are explicitly denied | Locked |

## 3. Locked product behavior

| ID | Decision | Status |
|---|---|---|
| B-001 | FlowBot makes no LLM calls | Locked |
| B-002 | AI Chatbot and Voice Agent are sales-oriented: interest, pain points, qualification, objections, CTA, contact and appointment request | Locked |
| B-003 | AI Chatbot and Voice Agent share one versioned Sales Conversation Core | Locked |
| B-004 | FlowBot may transfer to AI/human only through orchestrator and destination entitlement | Locked |
| B-005 | V1 actions are lead/fact/appointment request/task/handover/approved merchant email | Locked |
| B-006 | Appointment request captures several time options and is not a confirmed booking | Locked |
| B-007 | Autonomous self-learning is excluded from V1 | Locked |
| B-008 | Future improvement is offline, evaluated, tenant-safe, versioned and human-approved | Locked |
| B-009 | Human takeover suspends automated replies | Locked |
| B-010 | Lightweight lead workspace is included; full generic CRM is not | Locked |

## 4. Locked technical policy

| ID | Decision | Status |
|---|---|---|
| T-001 | Reuse/refactor existing FlowBot V1 before greenfield replacement | Locked |
| T-002 | Modular monolith + workers first; realtime voice may separate | Locked |
| T-003 | PostgreSQL system of record | Locked |
| T-004 | Membership-based tenancy and defense-in-depth isolation | Locked |
| T-005 | Published flows/playbooks/knowledge attachments/plans/rates immutable | Locked |
| T-006 | Active conversations/executions pin versions and entitlement snapshots | Locked |
| T-007 | Model output untrusted; actions use deterministic gateway | Locked |
| T-008 | Plan references capability profile, not direct provider model | Locked |
| T-009 | Tenant-facing schemas exclude provider/model/raw cost | Locked |
| T-010 | Exact quota uses synchronous reservation; async aggregate cannot enforce cap | Locked |
| T-011 | Provider-native and customer-billable usage stored separately | Locked |
| T-012 | Weak identity match creates merge candidate, not automatic merge | Locked |
| T-013 | Transactional outbox and idempotent external processing | Locked |
| T-014 | Message bodies/prompts/secrets excluded from general logs | Locked |
| T-015 | Advanced cannot silently fall back to Basic generation | Locked |
| T-016 | Platform Master Dashboard and tenant dashboards use separate authorization realms and API contracts | Locked |
| T-017 | Provider/model changes require authorized internal role, reauthentication, validation evidence, immutable audit, effective dating and rollback | Locked |
| T-018 | Browser/widget/channel session contracts are opaque and provider-neutral; provider/model identifiers remain behind the platform gateway | Locked |
| T-019 | No product plan becomes sellable before identity, tenant isolation, membership, entitlement and usage foundations pass their release gates | Locked |
| T-020 | Tenant context is explicit in every tenant-owned row, request, job, cache key, object path and usage event | Locked |

## 5. Commercial decisions still open

| ID | Decision needed | Gate | Evidence |
|---|---|---|---|
| C-001 | Exact monthly price for each of six plans | Before paid launch | unit economics, market tests |
| C-002 | Included FlowBot conversations/executions | FlowBot paid launch | observed usage/infrastructure cost |
| C-003 | Included AI responses/message credits | AI paid launch | text provider cost/distribution |
| C-004 | Included voice minutes/concurrency | Voice paid launch | provider/telephony cost and quality |
| C-005 | Exact overage rates and customer rounding | Billing GA | margin simulation/customer clarity |
| C-006 | Trial/card requirements and trial allowance | Public signup | fraud/conversion tests |
| C-007 | Bundle discount when buying multiple products | After attach-rate data | margin/expansion evidence |
| C-008 | Setup/onboarding service price | Pilot sales | measured effort |
| C-009 | Social/telephony external fee inclusion vs pass-through | Channel paid launch | current official fees and invoice UX |
| C-010 | Default overage vs optional hard cap UX | Billing GA | customer preference/risk |
| C-011 | Seats/bots/knowledge/storage limits | Each plan launch | support and infrastructure usage |

Open commercial decisions do not permit adding plans or changing locked channel/generation structure.

## 6. Required ADRs

### Bootstrap/data

- ADR-001 runtime/framework/repository policy;
- ADR-002 FlowBot V1 reuse/refactor boundaries;
- ADR-003 database/RLS/migration strategy;
- ADR-004 conversation/realtime/event protocol;
- ADR-005 search/vector/object storage.

### AI/actions

- ADR-101 text provider/profile and evaluation;
- ADR-102 retrieval/chunking/indexing;
- ADR-103 playbook structured-output schema;
- ADR-104 action email provider/template/destination policy;
- ADR-105 human handover/reply delivery.

### Channels

- ADR-201 LINE connection/identity/rate policy;
- ADR-202 WhatsApp account/template/session/fee policy;
- ADR-203 Messenger connection/identity/rate policy;
- ADR-204 cross-channel identity and merge review.

### Voice

- ADR-301 browser voice vs telephony release sequence;
- ADR-302 telephony provider/number/destination/recording eligibility;
- ADR-303 Gen1/Gen2 quality thresholds and equivalence qualification;
- ADR-304 Advanced incident/degradation/credit policy;
- ADR-305 minutes rounding/reservation/active-call cap;
- ADR-306 voice retention/transcript/recording.

### Billing/legal

- ADR-401 payment provider, THB, tax/invoice and proration;
- ADR-402 usage ledger/reconciliation/invoice generation;
- ADR-403 privacy/subprocessor/cross-border/retention;
- ADR-404 outbound communication consent and opt-out.

## 7. Superseded assumptions

The following are explicitly invalid:

- any plan for Creative Club/POS/business operations;
- AI Premium social channels treated as optional “Could” features;
- Voice tiers described without fixed generation/capability distinction;
- customer-facing plan copy containing provider names;
- one user permanently belonging to one tenant;
- automatic merge based on weak similarity;
- tool execution fully prohibited even though approved sales email is required;
- delayed usage aggregate enforcing an exact cap;
- Enterprise as a seventh public subscription plan;
- full CRM/calendar/POS as core product scope.
