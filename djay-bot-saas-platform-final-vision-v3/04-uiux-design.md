# 04 · UI/UX Design — DJAY Bot SaaS Platform v3.0

## 1. Experience principles

1. One focused workspace for chat and voice automation—not a POS/business-management dashboard.
2. Product/tier status is always clear.
3. Customers see capability names and understandable usage, never provider/model names.
4. Merchants can test before deployment and understand what the automation knows and may do.
5. Leads, CTA and follow-up outcomes are more prominent than vanity message counts.
6. Upgrade prompts explain the exact capability being unlocked.
7. Thai and English are designed natively.
8. Builders are desktop-first; inbox, lead and call review are mobile/tablet friendly.

## 2. Public pricing/catalog page

Display exactly six cards grouped into three product families.

### 2.1 FlowBot

| Customer-facing capability | Basic | Premium |
|---|---|---|
| Product description | Essential rule-based chatbot | Advanced rule-based chatbot |
| AI | No AI | No AI |
| Channel | Web chat | Web chat |
| Flow building | Core nodes and forms | Core + advanced logic, variables, delays and subflows |
| Active bots/usage | Lower configured allowance | Higher configured allowance |
| Lead capture | Included | Included |
| Conversation history/analytics | Basic | Advanced |
| Human team routing | Limited/single-owner workflow | Team assignment and routing |
| Integrations | Merchant email notification | Approved webhook/API integrations |
| Branding | Platform branding | Branding controls |

### 2.2 AI Chatbot

| Customer-facing capability | Basic | Premium |
|---|---|---|
| Product description | AI sales chat for your website | AI sales chat across web and social |
| Interaction | Text only | Text only |
| Web chat | Included | Included |
| LINE | Not included | Included |
| WhatsApp | Not included | Included |
| Facebook Messenger | Not included | Included |
| Knowledge and sales playbook | Included | Included with higher limits/controls |
| Interest/pain-point/lead capture | Included | Included |
| CTA and appointment request | Included | Included |
| Human handover | Included | Advanced routing/team controls |
| Analytics | Core | Omnichannel/advanced |

### 2.3 Voice Agent

| Customer-facing capability | Basic | Advanced |
|---|---|---|
| Engine name | First-Generation Voice Engine | Second-Generation Voice Engine |
| Positioning | Fast, cost-effective standard voice sales | Our smartest and most natural voice sales experience |
| Realtime conversation | Included | Included |
| Sales playbook/knowledge | Included | Included |
| Lead/CTA/appointment request | Included | Included |
| Transcript/summary | According to retention/configuration | According to retention/configuration |
| Complex reasoning/objections | Standard | Advanced |
| Recognition/noise/interruption capability | Standard profile | Advanced profile |
| Minutes/concurrency | Lower configured allowance | Higher configured allowance |
| Quality analytics | Core | Advanced |

No public card, tooltip, page source, metadata or invoice may contain provider/model names.

## 3. Catalog behavior

- A merchant may select one plan per product family.
- “Add another product” adds a second/third subscription to the same workspace.
- Upgrading changes only that product family.
- Downgrading opens a compatibility checklist before confirmation.
- Exact prices, included usage and overage are loaded from effective plan configuration.
- Setup service, trials and bundle discounts appear as offers/adjustments, never as extra public plans.
- No Enterprise seventh card. “Contact us” may negotiate overrides on one of the six plans.

### 3.1 Signup and Tenant Master Admin creation

1. Merchant selects a plan or approved trial on the public DJAY Bot SaaS site.
2. Merchant enters work email, name, business name, country, timezone and language.
3. Merchant accepts the current legal notices and verifies email.
4. Merchant creates credentials on the DJAY Bot SaaS site.
5. Platform provisions one isolated workspace and exactly one Tenant Master Admin membership.
6. Payment or trial activation completes before billable product deployment.
7. Tenant Master Admin continues directly into guided workspace and product onboarding.

Signup, verification, invitation acceptance, recovery and ownership transfer never ask platform staff or another dashboard to create a merchant password.

## 4. Merchant navigation

```text
Home
Inbox
Leads
Appointment Requests
FlowBot
AI Chatbot
Voice Agent
Channels
Knowledge & Sales Setup
Analytics
Usage & Billing
Team
Settings
```

Navigation is entitlement-aware:

- unsubscribed products show a discover/upgrade page;
- AI Basic shows Web under Channels and locked social cards;
- AI Premium shows Web, LINE, WhatsApp and Messenger setup;
- FlowBot pages never show AI prompt/model settings;
- Voice Basic/Advanced show generation name only.

No POS, inventory, cash register, class, child/parent or attendance navigation exists.

## 5. Onboarding

### 5.1 Workspace onboarding

1. Business name, industry and timezone.
2. Tenant Master Admin profile and optional team invitations.
3. Select first product and one of its two plans.
4. Guided product setup.
5. Test.
6. Deploy.
7. Add another product later.

### 5.2 FlowBot onboarding

- choose template or blank;
- set greeting and core path;
- configure form/lead fields;
- set merchant notification;
- style web widget;
- run deterministic test;
- publish.

Premium adds advanced-node, integration, team and branding steps only when used.

### 5.3 AI Chatbot onboarding

- business identity, tone and supported languages;
- products/services and approved facts;
- target customer and sales goal;
- discovery questions and qualification rules;
- common objections and prohibited claims;
- CTA and contact fields;
- appointment-request wording;
- merchant notification recipients;
- knowledge upload/index;
- test conversations and publish.

Basic deploys Web only. Premium continues to optional LINE/WhatsApp/Messenger connection flows.

### 5.4 Voice onboarding

- choose Basic or Advanced generation;
- reuse or create sales playbook/knowledge;
- choose voice persona without displaying provider identity;
- disclosure and recording policy;
- transfer/callback details;
- microphone/browser or phone/channel connection test;
- sample sales-call evaluation;
- deploy.

## 6. Home dashboard

Show:

- active subscriptions by product/tier;
- allowance used and forecasted overage;
- conversations/calls today;
- new leads and appointment requests;
- CTA/contact-capture rate;
- unresolved human handovers;
- channel/agent health;
- recent failures requiring action.

Do not show unrelated sales/POS revenue unless it is a merchant-entered conversation outcome.

## 7. Inbox

Conversation list filters:

- product: FlowBot / AI Chatbot / Voice Agent / Human;
- plan/deployment;
- channel;
- status/assignment;
- lead stage;
- handover state;
- date/language.

Conversation detail:

- channel transcript/timeline;
- automation mode and transitions;
- contact/lead panel;
- interest, pain points, objections and CTA;
- appointment request and time options;
- pinned flow/playbook version;
- human reply/takeover/release controls;
- delivery/action status;
- internal note.

Provider/model identifiers are never shown to tenant users.

## 8. FlowBot UI

### List

- name, status, plan eligibility, deployment, published version, usage, last edited;
- Basic/Premium feature badges;
- duplicate, archive and version history.

### Builder

- canvas and node palette filtered by entitlement;
- schema/graph errors before publish;
- version comparison and rollback;
- test simulator with event/state trace;
- widget preview;
- Premium-only nodes visibly locked with precise upgrade explanation;
- AI transfer node appears only when AI Chatbot is subscribed.

## 9. AI Chatbot Studio

Tabs:

1. Identity & Languages
2. Business Knowledge
3. Sales Goal
4. Discovery & Qualification
5. Offers & Recommendations
6. Objections
7. CTA & Lead Capture
8. Appointment Request
9. Human Handover
10. Notifications & Actions
11. Test & Evaluation
12. Deploy

Deployment tab:

- Basic: Web card only; social cards display Premium upgrade.
- Premium: Web, LINE, WhatsApp and Messenger cards with connection state.

Test mode shows sources, stage, structured facts and proposed actions. Customer preview hides internals.

## 10. Voice Agent Studio

Header:

- agent name;
- public generation label;
- status;
- included/used minutes;
- concurrency;
- health.

Tabs:

1. Voice & Languages
2. Sales Playbook
3. Knowledge
4. Call/Session Entry
5. Disclosure & Recording
6. Transfer & Callback
7. Actions
8. Test Call
9. Quality Evaluation
10. Deploy

Basic displays “First-Generation Voice Engine.” Advanced displays “Second-Generation Voice Engine.” No hidden tooltip or developer field exposes the model.

## 11. Channels

Cards:

- Web Widget: available for FlowBot and AI Chatbot;
- LINE: AI Chatbot Premium;
- WhatsApp: AI Chatbot Premium;
- Facebook Messenger: AI Chatbot Premium;
- Voice Web/Phone: Voice plans according to deployment capability.

Each card shows connection, deployment, health, last event, token/credential action, policy warning and test.

## 12. Leads and appointment requests

Lead table is lightweight and conversation-linked:

- name/contact;
- source/channel/product;
- interest/pain point summary;
- status/owner;
- CTA state;
- appointment request;
- last/next action;
- outcome.

It does not attempt to replace a full CRM.

Appointment request states:

- new;
- merchant contacted;
- awaiting confirmation;
- confirmed externally;
- declined/expired/cancelled.

Requested times are never displayed as confirmed until a human/integration confirms them.

## 13. Analytics

### FlowBot

- sessions, completion, drop-off, form/lead conversion, node errors and handover.

### AI Chatbot

- web vs social conversations;
- interest/pain point/contact/CTA/appointment funnel;
- objections and unanswered questions;
- quality and grounding.

### Voice

- calls/sessions, minutes, connection, latency, interruptions, transfer, CTA/lead/appointment outcome and quality by generation.

### Commercial

- allowance, overage, projected bill and plan upgrade opportunity.

Tenant users do not see provider cost/margin.

## 14. Usage and billing

For each active product card:

- plan name;
- billing period;
- included usage;
- used/remaining;
- overage rate and current projected overage;
- safety cap;
- upgrade/downgrade;
- invoices.

Voice shows minutes, not audio tokens. AI Chat shows response/message credits, not tokens. FlowBot shows sessions/executions.

## 15. Platform Master Dashboard

This is a separate internal platform realm, application and navigation tree. It is never a tenant dashboard mode and cannot be reached by Tenant Master Admin or Tenant Admin accounts.

Authorized internal screens:

- six-plan/version editor;
- entitlement/rate editor;
- tenant subscription/override;
- provider/capability/model registry and routing editor;
- text and voice model defaults, approved equivalents, priorities and effective dates;
- channel/telephony operations;
- raw cost/margin;
- incident and kill-switch controls;
- audit/support access.

Provider/model names may appear only here under Platform Owner or explicitly delegated Platform AI Operations permissions. Routing changes require reauthentication, impact summary, validation/evaluation evidence, effective time, confirmation, audit history and rollback.

Tenant dashboards show only public product, tier and capability labels. Tenant Master Admin and Tenant Admin cannot view model names, provider names, routing priority, provider credentials, raw provider usage/cost, or any provider/model configuration control.
