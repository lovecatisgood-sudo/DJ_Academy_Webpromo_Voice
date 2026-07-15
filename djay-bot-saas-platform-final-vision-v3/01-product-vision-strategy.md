# 01 · Product Vision & Strategy — DJAY Bot SaaS Platform v3.0

## 1. Vision

Build DJAY Bot SaaS Platform as a focused B2B SaaS that lets a business automate customer conversations using three complementary products:

1. **FlowBot** for predictable, rule-based chat journeys;
2. **AI Chatbot** for natural text sales conversations;
3. **Voice Agent** for natural realtime voice sales conversations.

The platform is not a POS or broad business-management suite. Its value is conversation automation and sales progression.

## 2. Customer problem

Businesses lose leads because:

- customers message outside working hours;
- staff repeat the same answers;
- response time is inconsistent;
- customer interest and pain points remain buried inside chats;
- staff do not consistently ask for contact details or the next step;
- social channels create fragmented histories;
- phone enquiries are expensive and difficult to scale;
- existing bots are either rigid or uncontrolled.

DJAY Bot SaaS Platform provides a progression from deterministic automation to intelligent text and voice selling while preserving human control.

## 3. Target customers

Initial focus:

- SMEs with repeated inbound enquiries;
- service businesses that qualify leads before quotation or consultation;
- e-commerce and local businesses that sell through web/social chat;
- agencies that need fast lead capture and follow-up;
- businesses that receive phone enquiries and want an automated sales agent.

The platform can serve many industries, but no industry-specific operational system belongs in the core SaaS.

## 4. Jobs to be done

A merchant hires the platform to:

- answer customer questions immediately;
- guide customers through a controlled path;
- understand what the customer wants and why;
- collect interest, pain points and qualification information;
- recommend an approved product/service or next step;
- handle common and unforeseen objections naturally;
- reach a CTA;
- collect and validate contact information;
- request several appointment time options;
- notify the merchant and support human takeover;
- measure conversation, lead and usage outcomes.

## 5. Product family

### 5.1 FlowBot

A traditional rule-based chatbot with no AI. It is the lowest-cost, most predictable product and the migration destination for the existing FlowBot V1.

- **Basic:** essential deterministic web automation.
- **Premium:** advanced deterministic web automation, scale, integrations, team handover and branding controls.

### 5.2 AI Chatbot

An automated text-only AI chatbot designed to provide a sales-like conversation. It uses approved business knowledge and a governed sales playbook.

- **Basic:** web chat only.
- **Premium:** web chat plus LINE, WhatsApp and Facebook Messenger.

The intelligence baseline must remain safe and useful in both tiers. Premium primarily adds omnichannel deployment, scale and advanced operational controls.

### 5.3 Voice Agent

An automated realtime voice sales agent using the same business knowledge and sales behavior as the AI Chatbot.

- **Basic:** First-Generation Voice Engine, optimized for cost-effective standard conversations.
- **Advanced:** Second-Generation Voice Engine, the smartest tier for more complex reasoning, objection handling and natural conversation.

The provider/model names remain internal.

## 6. Exactly six public plans

The public catalog is:

1. FlowBot Basic
2. FlowBot Premium
3. AI Chatbot Basic
4. AI Chatbot Premium
5. Voice Agent Basic
6. Voice Agent Advanced

This is sufficient for the public product architecture because it separates:

- deterministic vs AI text vs AI voice;
- entry vs premium capability within each product;
- web-only AI chat from omnichannel AI chat;
- cost-efficient voice from the smartest voice engine.

A seventh public package is not required. Large customers can receive negotiated usage, seats, SLA or onboarding through entitlement overrides tied to one of the six plans.

## 7. Shared platform

All subscribed products operate inside one tenant workspace with:

- users and roles;
- contacts and identities;
- leads and sales facts;
- conversations and human handover;
- knowledge and approved offers;
- appointment requests and follow-up tasks;
- analytics and evaluation;
- usage, subscription and invoices.

These are supporting platform capabilities, not standalone subscriptions.

## 8. Commercial model

Each plan contains:

- a monthly subscription price;
- included monthly usage;
- plan-specific capabilities and limits;
- a published overage rate for excess usage;
- an optional merchant safety cap where technically practical.

Exact prices, included usage, seats, bot counts, knowledge limits, concurrency and overage rates remain effective-dated commercial configuration until unit economics are validated.

Pricing principles:

- model/API cost is included in the subscription allowance and overage rate;
- customers are charged using understandable units, not raw provider tokens;
- FlowBot usage is shown as conversations/executions;
- AI Chatbot usage is shown as AI responses or message credits;
- Voice Agent usage is shown as voice minutes;
- internal provider cost is recorded separately for margin control;
- social/telephony pass-through fees must be disclosed according to the final rate card;
- customers can upgrade/downgrade one product without cancelling other products.

## 9. Provider confidentiality

Normal customer-facing surfaces must not reveal internal provider/model names. The product promise is a capability generation, not a vendor.

Internal operations may see:

- provider;
- model identifier;
- routing reason;
- raw usage/cost;
- capability profile;
- margin.

Legal privacy and subprocessor disclosures remain accurate even when marketing/UI hides model names.

## 10. Positioning

> DJAY Bot SaaS Platform automates sales conversations—from reliable rule-based chat to intelligent text and voice—inside one focused workspace.

FlowBot differentiates on control and predictability. AI Chatbot differentiates on natural sales conversion. Voice Agent differentiates on personalized spoken selling. The shared workspace differentiates the full platform from disconnected point tools.

## 11. Strategic boundaries

The platform will not become:

- a POS;
- inventory or order-management software;
- a school/club management system;
- staff attendance/payroll software;
- a generic no-code workflow platform;
- a full CRM replacing specialist CRMs;
- an uncontrolled autonomous self-modifying agent.

It may integrate with external CRM, calendar, payment and commerce systems later through approved actions.

## 12. North-star and guardrail metrics

### Primary outcome

**Qualified customer opportunities progressed to a merchant-approved next step each week.**

### Funnel metrics

- conversations started;
- meaningful conversations;
- interest captured;
- pain points captured;
- CTA offered/accepted;
- verified contact captured;
- appointment request created;
- human takeover completed;
- merchant follow-up completed;
- final sales outcome where available.

### Commercial metrics

- active subscriptions by the six plans;
- upgrade/downgrade rate;
- usage and overage revenue;
- gross margin per plan;
- channel cost;
- churn and expansion.

### Quality guardrails

- factual accuracy;
- unsafe or unauthorized action rate;
- provider/model leakage rate;
- tenant isolation;
- response latency;
- failed delivery/call rate;
- billing reconciliation accuracy;
- customer opt-out and complaint rate.

## 13. Release strategy

Build toward the final six-plan catalog in controlled stages:

1. audit the existing FlowBot and voice/text implementations;
2. establish public registration, verified Tenant Master Admin provisioning, isolation and entitlements;
3. establish the shared tenant workspace, conversations, contacts and leads;
4. release FlowBot Basic and Premium on the proven SaaS tenant kernel;
5. release AI Chatbot Basic on web;
6. add LINE, WhatsApp and Messenger for AI Chatbot Premium;
7. release Voice Agent Basic using the First-Generation capability profile;
8. release Voice Agent Advanced using the Second-Generation capability profile;
9. enable full self-service billing, overage and operational automation after reconciliation is proven.
