# DJay Bots V1 Market Release Product Requirements Document

| Field | Value |
| --- | --- |
| Product | DJay Bots by DJAI |
| Version | V1 Market Release |
| Status | Approved product scope; implementation and production validation pending |
| Date | 2026-08-13 |
| Product owner | DJAI |
| Primary market | Thailand |
| Languages | Thai and English on all plans; additional supported languages on Advanced AI plans |
| Billing currency | Thai baht (THB) |
| Source of truth | This PRD for commercial and normative requirements; the approved experience contract for page and interaction behavior |

## 1. Purpose and authority

> **Document authority (reconciled 2026-08-13).** Earlier product and onboarding documents disagreed on pricing, channel packaging, and setup order. Resolution:
> - **This document is authoritative** for commercial catalogue, prices, billing period, meters, and all normative `XXX-nnn` requirements.
> - `PRD_CLAUDE_26JUL.md` (repo root) is authoritative for **product strategy and SKU release sequencing** only. Where it states prices or packaging, this document wins.
> - `docs/design/djay-bots-approved-experience-contract.md` is authoritative for **public page order, trial UX, onboarding mechanics, Configuration Studio behavior, publishing/install separation, dashboard navigation, and five-minute takeover**.
> - `docs/design/djay-bot-text-voice-configuration-flow.html` is the approved clickable visual reference. Its sample data and simulated integrations are not production policy.
> - `docs/superpowers/specs/2026-07-26-omnichannel-onboarding-design.md` remains a historical/deferred social-channel design and cannot override the approved website-first experience contract.
> - Billing is **annual only** (§6.1). Social packaging is **one included channel + paid extras** (`CHN-004`, `CHN-005`).

This PRD converts the complete DJay Bots commercial offer into testable product requirements. Every capability advertised in the offer is committed V1 scope unless this document explicitly labels it as an optional paid service, add-on, third-party dependency, or Enterprise capability. The implementation must satisfy the offer; the offer must not be reduced to fit the current implementation.

The requirement keywords **MUST**, **MUST NOT**, **SHOULD**, and **MAY** are normative. Requirement identifiers are stable and must be referenced by designs, database migrations, tickets, tests, release evidence, and operational runbooks.

## 2. Product vision

DJay Bots is a multi-tenant conversation automation SaaS for Thai businesses. A customer can start with predictable rule-based automation, adopt natural-language AI chat, or deploy an AI voice agent without moving to a different platform. The product must make bot creation, channel publication, lead capture, human handover, usage control, billing, and reporting manageable by a normal business administrator.

### 2.1 Customer problem

Small and medium businesses lose leads because staff cannot answer every website, social, and telephone enquiry immediately. Existing tools often require technical setup, do not handle Thai well, separate text and voice into unrelated products, or expose unpredictable AI costs.

### 2.2 Product promise

- Answer customer enquiries continuously in Thai and English.
- Provide a controlled Flow Bot for predictable, high-volume journeys.
- Provide grounded AI Text conversations for flexible sales and service questions.
- Provide web and telephone AI Voice conversations with transcripts and outcomes.
- Capture actionable leads and transfer conversations with context.
- Expose clear plan allowances, usage, overages, and renewal behavior.
- Let growing customers add channels, administrators, workspaces, bots, and integrations.

## 3. Goals and non-goals

### 3.1 V1 goals

1. Deliver all six self-service annual packages and their advertised feature boundaries.
2. Make the full purchase, first-year promotion, renewal, cancellation, upgrade, portal, invoice, and credit-note lifecycle production-safe.
3. Support website deployment for all bot types and the advertised social/telephone channels for Advanced packages.
4. Provide knowledge ingestion, lead management, human handover, reporting, usage enforcement, and overage controls appropriate to each plan.
5. Operate staging and production on GCP with tenant isolation, observability, backups, disaster recovery, and controlled deployment.
6. Produce auditable evidence that each advertised promise works before paid general availability.

### 3.2 Non-goals for the standard V1 packages

- More than the published maximum bots, channels, usage, concurrency, brands, or branches without an add-on or Enterprise contract.
- Bespoke CRM, telephony, reporting, security, SLA, or workflow development included in the base subscription.
- Third-party subscription, messaging, telephone-number, carrier, or transaction fees included in DJay Bots pricing.
- Fully managed bot design and content preparation included in self-service subscriptions; these are professional services.
- White-label deployment, dedicated infrastructure, staff training, or custom SLAs in standard plans.

## 4. Product principles

- **Offer fidelity:** the entitlement engine, user interface, invoices, and support process must agree with the package tables below.
- **Tenant isolation:** a tenant must never read, change, meter, or administer another tenant's data.
- **Deterministic where promised:** Flow Bot responses must not require a language-model call for ordinary execution.
- **Grounded AI:** AI responses must use the tenant's approved knowledge and policy, disclose uncertainty through configured escalation, and never invent a completed business action.
- **Provider abstraction:** customer contracts are with DJay Bots. OpenAI, Stripe, social networks, telephony providers, and accounting systems remain replaceable adapters.
- **Usage transparency:** customers and operators must see authoritative allowance, consumption, forecast, overage, and safety-cap state.
- **Human control:** publication, integration credentials, billing changes, destructive actions, handover, and sensitive support access require explicit authorization and audit trails.
- **Thai-first operations:** Bangkok time, THB pricing, Thai content, local tax/accounting needs, and Thai channel behavior are first-class requirements.

## 5. Personas and jobs to be done

| Persona | Primary jobs |
| --- | --- |
| Business owner | Select a package, pay, understand value and usage, review leads, control renewal and cost |
| Workspace administrator | Configure bots, knowledge, channels, users, branding, CTAs, integrations, routing, and reports |
| Conversation designer | Build, test, version, publish, and improve Flow journeys without code |
| AI manager | Curate knowledge, instructions, personalities, confidence rules, catalogues, and escalation behavior |
| Sales or service agent | Receive handovers with context, review leads, respond, update outcomes, and export records |
| Customer or website visitor | Ask naturally, navigate a guided flow, speak with an agent, submit details, and reach a human |
| DJAI platform operator | Support tenants safely, reconcile providers and billing, monitor reliability, and manage incidents |
| DJAI finance operator | Review subscriptions, immutable invoices/credits, payment state, tax data, and FlowAccount sync |
| DJAI support/professional services | Provision purchased setup work, configure systems with consent, document acceptance, and hand off ownership |

## 6. Commercial catalogue

### 6.1 Annual package prices

The displayed first-year price is authoritative. Each subscription is paid annually for 12 months. The monthly equivalent is informational and is not a monthly payment option.

| Family | Package | Internal plan key | First-year annual price | Regular annual renewal | First-year saving | Displayed monthly equivalent |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| Flow Bot | Starter | `flowbot_basic` | THB 2,499 | THB 4,999 | THB 2,500 | THB 208 |
| Flow Bot | Advanced | `flowbot_premium` | THB 4,450 | THB 8,900 | THB 4,450 | THB 371 |
| AI Text Bot | Starter | `ai_chat_basic` | THB 5,950 | THB 11,900 | THB 5,950 | THB 496 |
| AI Text Bot | Advanced | `ai_chat_premium` | THB 12,450 | THB 24,900 | THB 12,450 | THB 1,038 |
| AI Voice Bot | Starter | `voice_basic_gen1` | THB 14,950 | THB 29,900 | THB 14,950 | THB 1,246 |
| AI Voice Bot | Advanced | `voice_advanced_gen2` | THB 29,950 | THB 59,900 | THB 29,950 | THB 2,496 |

### 6.2 First-year promotion rules

- `COM-001` Every eligible new annual package subscription MUST receive the exact first-year price above for its first 12-month term.
- `COM-002` The promotion MUST be applied server-side and MUST NOT depend on a customer knowing a reusable promotion code.
- `COM-003` Flow Starter MUST use the explicit THB 2,500 reduction from THB 4,999, not a calculation that produces THB 2,499.50.
- `COM-004` A customer who completes an eligible purchase while the offer is active MUST retain the full first-term price even if the public promotion later changes.
- `COM-005` The promotion has no fixed end date. Operators MUST be able to end or replace it prospectively without changing existing subscriptions.
- `COM-006` Renewal after the first term MUST use the regular annual price unless a later approved discount, upgrade, downgrade, or cancellation applies.
- `COM-007` Checkout, order confirmation, invoice, portal, and renewal notices MUST show the actual charge, term, renewal price, taxes, and excluded third-party fees consistently.

### 6.3 Shared commercial rules

- `COM-010` One subscription grants entitlements to one tenant workspace unless the package or an add-on grants more.
- `COM-011` An annual subscription MUST receive twelve monthly allowance periods based on its billing anniversary in the `Asia/Bangkok` timezone.
- `COM-012` Unused monthly allowances MUST NOT roll over unless an explicit future catalogue version says otherwise.
- `COM-013` Plan upgrades MAY take effect immediately with Stripe proration according to the approved billing policy. Downgrades MUST default to the next renewal to prevent destructive automatic changes.
- `COM-014` Cancellation MUST stop renewal but retain paid access through the current term unless fraud, chargeback, legal, or safety policy requires suspension.
- `COM-015` Failed renewal MUST enter a configurable grace and dunning process before suspension. Customer data MUST be retained according to the retention policy.
- `COM-016` Limits and prices MUST be versioned. Existing subscription terms MUST remain reproducible after the public catalogue changes.
- `COM-017` Tax-inclusive or tax-exclusive presentation, VAT invoice requirements, and withholding-tax handling MUST be approved by Thai accounting/legal review before paid GA.
- `COM-018` A tenant MUST be able to hold compatible Flow, AI Text, and AI Voice subscriptions together. At most one base package per bot family/workspace is active unless an approved Enterprise contract says otherwise; upgrading within a family replaces that family's base package without removing other families.

### 6.4 Free trials

- `TRL-001` A verified account email MUST be offered at most one 30-fixed-day website-only Flow Bot Starter trial with 5,000 customer conversations and no payment card requirement.
- `TRL-002` A successfully verified Stripe card fingerprint MUST be offered at most one 30-fixed-day website-only AI Text Bot Starter trial with 500 AI-generated replies, equal to 25% of the 2,000-reply Starter allowance. Card setup MUST be deferred until the merchant presses Deploy Bot after configuration.
- `TRL-003` AI Voice Bot MUST NOT advertise or provision a free trial under the approved V1 experience.
- `TRL-004` The trial request begins from the public package page as a pending intent. Configuration and testing MUST remain available before activation. The fixed trial clock MUST begin only after authoritative deployment provisioning succeeds.
- `TRL-005` Trial entitlements MUST exclude social channels, telephone channels, paid add-ons, overage, and Advanced-only features.
- `TRL-006` At 100 AI Text trial replies remaining, equal to 20% of the trial allowance, the platform MUST notify the account owner in-product and by email. Delivery MUST be deduplicated and auditable.
- `TRL-007` At trial allowance exhaustion or fixed-period expiry, the affected bot MUST stop accepting new trial-metered service and present the merchant with a paid-plan action. The customer-facing experience MUST use the merchant-approved unavailable/contact fallback and MUST NOT expose provider, token, model, or internal quota identifiers.
- `TRL-008` Flow trial usage MUST be tracked as deterministic customer conversations and MUST NOT consume AI reply credits.
- `TRL-009` Flow repeat prevention MUST use only the normalized verified account email. Text repeat prevention MUST use only a keyed hash of the Stripe card fingerprint returned after successful SetupIntent confirmation. Text card setup MUST validate/save the card without creating a DJBOT charge and MUST NOT promise an exact USD 1 debit because temporary verification behavior is controlled by Stripe, card networks and issuers. The card MUST NOT authorize automatic trial conversion or charging. Company registration, business-domain verification, telephone verification, IP address and device identity MUST NOT be eligibility requirements, and IP/device signals MUST NOT be a sole rejection reason.

## 7. Meter definitions

- `MET-001` A **Flow conversation topic** is an independently addressable, named, top-level published entry journey. Nodes, buttons, branches, reusable fragments, translations, and draft revisions do not each count as topics.
- `MET-002` **Unlimited Flow steps** means no commercial node count. The platform MAY enforce documented technical limits on payload size, graph validity, recursion, execution duration, and abuse to preserve reliability.
- `MET-003` A **customer conversation** is one customer-initiated Flow session for one bot and channel. A session ends after 24 hours of inactivity, explicit closure, or handover closure. Retries, duplicate channel deliveries, previews, staff messages, and system messages MUST NOT double-count it.
- `MET-004` An **AI-generated reply** is one successful customer-facing assistant response committed to a conversation. Provider retries, internal tool calls, validation retries, safety refusals with no customer-facing message, previews, and duplicate deliveries MUST NOT count twice.
- `MET-005` A **connected AI voice minute** is metered from the time an AI media session becomes connected until terminal disconnect, excluding pre-connection setup and provider downtime. Each completed session is rounded up to the next whole minute for billing; raw connected seconds MUST also be retained for audit.
- `MET-006` Usage events MUST have stable idempotency keys, tenant, subscription, bot, channel, source event, quantity, occurred-at time, and reconciliation state.
- `MET-007` The customer dashboard MUST show current period, included allowance, consumed amount, purchased packs, projected end-of-period usage, overage estimate, and safety-cap state.
- `MET-008` Provider usage and DJay Bots billable usage MUST be separately recorded and reconciled; provider cost is not itself the customer meter.

## 8. Shared platform requirements

### 8.1 Identity, tenancy, and administration

- `IDN-001` Support secure registration, email verification, login, logout, password reset, session revocation, and account recovery.
- `IDN-002` Require MFA for platform operators and make MFA available to tenant administrators before GA; require it for sensitive billing/integration actions in a scheduled security release.
- `TEN-001` Provision tenant, first workspace, owner membership, default policies, and audit records atomically after eligible checkout or approved trial/provisioning action.
- `TEN-002` Roles MUST include tenant owner, administrator, conversation designer/manager, human agent, analyst/viewer, billing manager, and read-only support access.
- `TEN-003` Administrator-seat counts MUST be enforced by active privileged memberships. Human-agent-only seats MUST follow an explicit catalogue policy and MUST NOT silently bypass the advertised administrator limit.
- `TEN-004` Support invited users, invite expiration, role changes, removal, ownership transfer, and access review.
- `TEN-005` PostgreSQL row-level security and least-privilege database roles MUST enforce tenant isolation independently of application filters.
- `TEN-006` Every privileged or security-sensitive action MUST create an immutable audit event with actor, tenant, action, target, before/after reference, timestamp, request ID, and origin.

### 8.2 Common bot lifecycle

- `BOT-001` Administrators MUST be able to create, name, configure, duplicate, archive, and restore bots within entitlement limits.
- `BOT-002` Bot configuration MUST use immutable revisions with draft, validation, preview/test, publish, rollback, and audit history.
- `BOT-003` Publishing MUST be atomic: a conversation sees one coherent bot revision throughout its turn/session.
- `BOT-004` Widget installation MUST provide tenant-specific embed code, allowed-origin controls, environment separation, and a visible health/test state.
- `BOT-005` Starter widgets MUST show DJay Bots branding. Advanced plans MUST support branding removal. Starter branding removal MUST be available as an add-on.
- `BOT-006` All bots MUST support configurable welcome/opening messages appropriate to their modality.
- `BOT-007` All bots MUST support customer consent notices, privacy links, retention disclosure, and tenant-configurable lead consent where required.

### 8.3 Lead and conversation operations

- `LEAD-001` Store customer name, telephone number, email, consent state, source bot/channel, campaign/referrer where available, conversation reference, and creation time.
- `LEAD-002` Validate and normalize contact data without preventing a customer from continuing when optional details are omitted.
- `LEAD-003` Provide searchable/filterable conversation and lead history with plan-appropriate reports and exports.
- `LEAD-004` Human handover MUST carry the transcript, bot, channel, customer identity, collected fields, reason, confidence/outcome, and routing target.
- `LEAD-005` Operators MUST be able to assign, accept, resolve, reopen, and annotate handovers with an audit trail.
- `LEAD-006` Exports MUST be authorization-controlled, tenant-scoped, time-limited, auditable, and safe against spreadsheet formula injection.

### 8.4 Notifications and support

- `NOT-001` Send transactional email/in-app notifications for verification, invitations, checkout, payment, renewal, payment failure, cancellation, usage thresholds, safety caps, integration failures, handovers, and exports.
- `NOT-002` Notification delivery MUST be asynchronous, retryable, deduplicated, observable, and preference-aware except for mandatory service/legal messages.
- `SUP-001` Standard and Priority support queues MUST be distinguishable by entitlement and visible to operators.
- `SUP-002` Support impersonation is prohibited. Time-limited support access MUST require tenant consent or approved break-glass procedure and be fully audited.

## 9. Flow Bot requirements

### 9.1 Flow Starter

- `FLS-001` Allow one Flow Bot in one business workspace with one administrator account.
- `FLS-002` Provide a website chat widget with allowlisted origins and self-service installation instructions.
- `FLS-003` Permit up to 150 published conversation topics and no commercial limit on steps per flow.
- `FLS-004` Include up to 50,000 customer conversations per monthly allowance period.
- `FLS-005` Provide a visual flow builder for messages, buttons, links, questions, forms, branches, reusable fragments, validation, preview, publish, and rollback.
- `FLS-006` Support welcome/opening messages, FAQ flows, and text responses.
- `FLS-007` Render image responses with accessible alternative text, secure uploads, responsive sizing, and channel fallbacks.
- `FLS-008` Render buttons, external website links, click-to-call links, LINE contact links, checkout links, and booking links as functional actions.
- `FLS-009` Render simple product/service cards with image, title, description, optional price text, and CTA.
- `FLS-010` Support lead-capture forms for name, telephone, email, consent, and tenant-defined fields.
- `FLS-011` Support human-agent handover with the collected context.
- `FLS-012` Support basic conditional paths based on answers, button choice, known contact fields, and simple equality/presence rules.
- `FLS-013` Provide conversation history, basic lead reports, basic chatbot analytics, and CSV export where the offer grants export through the relevant UI.
- `FLS-014` Apply DJay Bots branding unless the branding-removal add-on is active.
- `FLS-015` Execute ordinary Flow responses without consuming AI credits or calling a language model.

### 9.2 Flow Advanced

- `FLA-001` Allow up to three Flow Bots representing up to three departments, campaigns, or customer journeys.
- `FLA-002` Allow up to 500 published conversation topics and no commercial limit on steps.
- `FLA-003` Include up to 100,000 customer conversations per monthly allowance period.
- `FLA-004` Include website plus one selected supported social channel: LINE Official Account or Facebook Messenger at launch. Additional supported channels follow add-on/Enterprise policy.
- `FLA-005` Use the deterministic Flow runtime on social channels; normal Flow social responses MUST NOT use AI-generated reply credits.
- `FLA-006` Add video responses with upload/URL validation, thumbnails/fallbacks, captions, and channel capability adaptation.
- `FLA-007` Provide unlimited standard buttons and branches under documented fair use, and add rich product/service cards, image carousels, rich messages, menus, and category browsing.
- `FLA-008` Add advanced conditional logic with typed comparisons, AND/OR groups, tags, attributes, prior answers, channel, and safe webhook/API result fields.
- `FLA-009` Support customer tags and typed customer attributes, including searchable history and consent-aware updates.
- `FLA-010` Support lead qualification, quotation requests, appointment requests, booking flows, and order-enquiry flows.
- `FLA-011` Support department routing and human-agent handover with context.
- `FLA-012` Provide Google Sheets integration with OAuth/service authorization, explicit field mapping, retry, deduplication, and error visibility.
- `FLA-013` Provide signed outbound webhooks with tenant-configurable URLs, secret rotation, event selection, retries, delivery logs, and replay.
- `FLA-014` Provide basic external API actions through an allowlisted, server-side action gateway with schema validation, timeout, rate limit, secret storage, audit, and response-field mapping.
- `FLA-015` Provide conversation export, lead export, unanswered-input reports, customer-journey analytics, and flow-performance analytics.
- `FLA-016` Support reusable tenant templates and DJAI-provided versioned starter templates.
- `FLA-017` Remove DJay Bots branding and permit up to three administrators.

## 10. AI Text Bot requirements

### 10.1 Shared AI behavior

- `AIT-001` Route production model calls only through the restricted DJAI AI gateway; browser clients and general application code MUST NOT hold provider credentials.
- `AIT-002` Ground answers in the tenant's active knowledge revision, approved catalogues, bot instructions, and conversation context.
- `AIT-003` Use strict structured outputs for customer text, citations/source references, confidence, intent, typed actions, lead updates, escalation, and safety metadata.
- `AIT-004` Validate every model response against the application schema. Invalid output MUST be retried within policy or replaced with a safe customer-facing fallback.
- `AIT-005` Treat provider refusal, policy violation, timeout, quota exhaustion, and dependency failure as explicit states with safe fallbacks and operator telemetry.
- `AIT-006` Prevent cross-tenant retrieval, prompt injection from documents, tool misuse, secret disclosure, and unapproved external actions.
- `AIT-007` Support configurable personality, business tone, sales instructions, prohibited claims, escalation instructions, and CTA priorities.
- `AIT-008` Answers MUST never claim that an appointment, order, payment, transfer, or external update succeeded unless the corresponding tool returns a verified success record.
- `AIT-009` Every customer-facing AI Text reply MUST be instructed to be concise, normally about 40–80 words, and validated to a hard maximum of 200 locale-aware words before delivery. English and Thai counting MUST use locale-aware segmentation. Oversized output MUST receive at most one controlled fact/citation/action-preserving rewrite and MUST never be cut off by string slicing; failure to produce a valid concise reply uses the approved safe fallback without exposing internal validation or model details.
- `AIT-010` AI Text onboarding MUST begin with Customer Support, Sales Associate, or Appointment Booking role selection after the merchant has already selected the AI Text family/package. Sales Associate MUST retain appointment booking as a supporting action after discovery and objection handling.

### 10.2 Knowledge ingestion

- `KNO-001` Support manual FAQ authoring and import.
- `KNO-002` Support TXT, PDF, and DOCX uploads with file validation, malware scanning, text extraction, page/source attribution, and visible processing status.
- `KNO-003` Support website-content import for Starter and multi-page website crawling for Advanced, respecting robots/access policy, scope allowlists, rate limits, canonical URLs, and crawl status.
- `KNO-004` Normalize, chunk, index, and version extracted content. Retrieval MUST reference only an active, published knowledge revision.
- `KNO-005` Allow source preview, exclusion, correction, reprocessing, deletion, and full reindexing.
- `KNO-006` Apply weekly knowledge refresh to AI Text Starter and monthly knowledge review workflow to AI Text Advanced, with customer-visible status and actionable failures.
- `KNO-007` Provide product and service information on Starter and structured product/service catalogue support on Advanced.
- `KNO-008` Deleting source content MUST remove it from future retrieval and complete provider/vector cleanup within the stated retention window.

### 10.3 AI Text Starter

- `ATS-001` Allow one AI Text Bot in one business workspace with one administrator.
- `ATS-002` Provide the website chat widget and include up to 2,000 AI-generated replies per monthly allowance period.
- `ATS-003` Provide one business knowledge base containing website content, FAQs, PDF, DOCX, TXT, and product/service information.
- `ATS-004` Support Thai and English conversations, including language detection and a configured language override.
- `ATS-005` Answer FAQs, explain products/services, recommend suitable products/services, and follow configured sales instructions.
- `ATS-006` Provide lead-capture forms and collect name, telephone, and email with consent state.
- `ATS-007` Render booking, call, LINE, and website CTAs as typed, functional actions.
- `ATS-008` Support human-agent handover and configurable low-confidence escalation.
- `ATS-009` Provide conversation history, basic AI analytics, lead reports, and weekly knowledge refresh.
- `ATS-010` Apply DJay Bots branding unless an add-on removes it.
- `ATS-011` Permit additional usage at THB 0.35 per reply and the 1,000-reply pack at THB 299, subject to customer overage/safety-cap settings.

### 10.4 AI Text Advanced

- `ATA-001` Allow up to three AI Text Bots for up to three brands, departments, or AI personalities and up to five administrators.
- `ATA-002` Include website plus one selected LINE OA or Facebook Messenger channel and up to 10,000 AI-generated replies per monthly period.
- `ATA-003` Support multiple knowledge collections, a larger documented knowledge allowance, crawling, FAQ/document uploads, product catalogues, and service catalogues.
- `ATA-004` Support Thai, English, and a configurable list of additional validated languages. The sellable language list MUST show only languages that pass release quality tests.
- `ATA-005` Provide custom sales personality, advanced sales instructions, intent detection, recommendations, package comparisons, and objection handling.
- `ATA-006` Provide lead qualification, customer segmentation, customer tags, and configurable lead scoring with explainable rule/AI contributions.
- `ATA-007` Provide appointment-request flows and booking, quotation, checkout, call, and LINE CTAs.
- `ATA-008` Provide confidence-based escalation, department routing, and contextual human handover.
- `ATA-009` Generate conversation summaries and customer summaries with provenance and an operator correction mechanism.
- `ATA-010` Provide Google Sheets, signed webhook, and at least one production-ready basic CRM integration using the common integration framework.
- `ATA-011` Provide lead export, conversation export, advanced AI analytics, question/intent reports, and unanswered-question reports.
- `ATA-012` Provide a monthly knowledge-review workflow, branding removal, and Priority support.
- `ATA-013` Permit additional usage at THB 0.25 per reply and the 5,000-reply pack at THB 999, subject to customer controls.

## 11. AI Voice Bot requirements

### 11.1 Shared voice behavior

- `VOI-001` Route all production realtime sessions through the DJAI Voice gateway. Clients and carriers MUST NOT receive provider credentials.
- `VOI-002` Support interruptible, bidirectional streaming audio, turn detection, reconnection, session timeout, backpressure, and explicit terminal states.
- `VOI-003` Use the tenant's active knowledge and configured voice instructions while applying the same grounded-action guarantees as AI Text.
- `VOI-004` Capture raw connected seconds, billable minutes, provider session IDs, modality/channel, disconnect reason, and reconciliation state without storing raw audio unless consent and retention configuration explicitly allow it.
- `VOI-005` Produce call transcripts, summaries, collected contact details, outcomes, and analytics with clear partial/failed status when generation is incomplete.
- `VOI-006` Display and/or play appropriate AI disclosure, recording/transcription notice, emergency limitation, and consent wording approved for the channel and jurisdiction.
- `VOI-007` Enforce tenant, plan, per-agent, and global concurrency before allocating provider resources.
- `VOI-008` A voice agent MUST fail safely on provider outage, silence, abusive input, unsafe request, tool failure, or handover failure.
- `VOI-009` Voice responses MUST normally use about 20–50 words and MUST be validated as customer-facing written content of no more than 200 locale-aware words before speech output. Oversized output uses the same single controlled rewrite and safe-fallback policy as AI Text and is never cut off directly.
- `VOI-010` AI Voice onboarding MUST begin with Customer Support, Sales Associate, or Appointment Booking role selection after the merchant has already selected the AI Voice family/package. The selected role determines behavior configuration; Voice settings remain a separate modality layer.

### 11.2 AI Voice Starter

- `VOS-001` Allow one AI Voice Agent, one business knowledge base, one administrator, and one concurrent AI voice session.
- `VOS-002` Provide a web-based voice widget and 150 connected minutes per monthly allowance period.
- `VOS-003` Support Thai and English with validated speech recognition, response quality, pronunciation, and voice output.
- `VOS-004` Provide configurable voice personality, greeting, FAQ answering, and product/service explanations.
- `VOS-005` Provide basic sales qualification, lead-information collection, appointment requests, callback requests, and CTA guidance.
- `VOS-006` Provide human callback handover, including requested time/contact and conversation context.
- `VOS-007` Provide transcripts, summaries, contact details, call outcomes, and basic call analytics.
- `VOS-008` Permit additional connected usage at THB 6 per minute, subject to customer controls.
- `VOS-009` Make telephone integration available as an optional paid professional/integration service; external carrier and number fees remain separate.

### 11.3 AI Voice Advanced

- `VOA-001` Allow up to three AI Voice Agents for up to three departments, brands, or call purposes, five administrators, and two concurrent AI voice sessions.
- `VOA-002` Provide web voice and inbound telephone integration with 500 connected minutes per monthly allowance period.
- `VOA-003` Support Thai, English, and validated additional languages shown in the active sellable-language list.
- `VOA-004` Support multiple knowledge collections, custom greeting/opening, custom voice personality, and sales/qualification instructions.
- `VOA-005` Provide intent detection, recommendations, package comparisons, lead qualification, and customer-data collection.
- `VOA-006` Provide integrated appointment scheduling and callback scheduling through verified external actions, not merely request capture.
- `VOA-007` Provide call routing, live human transfer, and department transfer with a warm context package and visible fallback behavior.
- `VOA-008` Provide transcripts, conversation/customer summaries, objection/intent tags, outcome tags, and sentiment indicators. Sentiment MUST be presented as a fallible indicator, not a fact.
- `VOA-009` Provide Google Sheets, signed webhook, and at least one production-ready basic CRM integration.
- `VOA-010` Provide advanced call analytics, lead reports, and call-performance reports.
- `VOA-011` Remove DJay Bots branding and provide Priority support.
- `VOA-012` Permit additional connected usage at THB 5 per minute, subject to customer controls.
- `VOA-013` Itemize telephone carrier charges, number rental, and third-party call fees separately from included DJay Bots connected minutes.

## 12. Channel requirements

- `CHN-001` The website text widget MUST support responsive desktop/mobile layout, keyboard operation, screen readers, Thai text, reconnect, transcript restoration, consent, and accessible CTAs.
- `CHN-002` The website voice widget MUST expose microphone permission, connection, listening, speaking, muted, reconnecting, handover, limit reached, and ended states without overlapping controls.
- `CHN-003` LINE OA and Facebook Messenger adapters MUST verify signed inbound requests, deduplicate provider event IDs, map identities, enforce reply windows, adapt rich content to capability, and expose delivery failures.
- `CHN-004` Tenants MUST choose the one included social channel on eligible Advanced plans. Channel changes require an explicit cooldown or operator-approved migration to prevent entitlement abuse.
- `CHN-005` Additional supported social channels MUST be provisioned only when the appropriate add-on or Enterprise entitlement is active.
- `CHN-006` Channel credentials and tokens MUST be encrypted, rotated, access-controlled, and never returned to browsers after entry.
- `CHN-007` Every channel MUST have a self-test, health state, last successful event, last error, and reconnect/re-authorize flow.
- `CHN-008` Channel-specific charges, outbound broadcast limits, and platform policy constraints MUST be disclosed and must not be represented as included usage.
- `CHN-009` **Instagram Direct** MUST be supported as a social channel for Flow Bot and AI Text Bot, using the same Meta app, consent flow, and shared webhook as Messenger, routed by Instagram account ID.
- `CHN-010` **WhatsApp Business** MUST be supported as a social channel, onboarded via Embedded Signup, routed by phone-number ID. Per-message service charges MUST be disclosed under `CHN-008` and MUST NOT be presented as included usage.
- `CHN-011` Channel onboarding MUST verify provider **prerequisites before requesting credentials**, and MUST name the specific unmet condition and its fix. Minimum set: LINE Messaging API enabled (with the permanent-Provider warning) and chat/auto-reply disabled; Messenger Page-admin role; Instagram Business account linked to the granted Page with message access allowed; WhatsApp number not already registered on the WhatsApp Business App. An empty asset picker MUST NOT be shown in place of an explanation.
- `CHN-012` Channel onboarding MUST NOT require the merchant to visit a provider developer console where the platform can obtain equivalent authority itself. For LINE the platform MUST mint channel access tokens server-side from Channel ID + Channel Secret (`client_credentials`) and MUST set and verify the webhook via API; long-lived token entry is permitted only as an advanced fallback.
- `CHN-013` A channel connection MUST NOT be reported as working until end-to-end reachability has been **proven** by a provider round-trip (LINE webhook test, Meta subscription confirmation) — configuration alone is insufficient.
- `CHN-014` **Voice is not a social-messaging channel.** AI Voice Bot MUST be offered on the website widget and telephony only; LINE, Messenger, Instagram, and WhatsApp MUST NOT be advertised or scoped as voice channels.

## 13. Integrations and actions

- `INT-001` Integrations MUST use a common connection model with provider, tenant, scopes, encrypted credentials, status, health, owner, created/updated time, and revocation.
- `INT-002` External actions MUST be server-side, schema-validated, idempotent where possible, rate-limited, timed out, retried only when safe, and audited.
- `INT-003` A customer-facing confirmation MUST be emitted only after a verified result; unknown outcomes MUST be described as pending or failed.
- `INT-004` Google Sheets exports/actions MUST prevent duplicate rows on retry and expose mapping and delivery history.
- `INT-005` The first basic CRM connector MUST support create/update lead or contact, add conversation summary/outcome, field mapping, and reconciliation. Provider selection is an implementation decision, not grounds to omit the feature.
- `INT-006` Booking/scheduling integrations MUST support availability lookup, timezone, customer confirmation, create/reschedule/cancel where offered, and idempotency.
- `INT-007` Checkout CTAs MUST use approved tenant URLs or DJay Bots-managed checkout targets and MUST prevent malicious redirect schemes.

## 14. Billing and subscription lifecycle

- `BIL-001` Stripe Checkout MUST create annual subscriptions from server-selected, versioned Price IDs; the browser MUST NOT choose arbitrary price or tenant identifiers.
- `BIL-002` Checkout creation MUST bind authenticated customer, tenant/workspace intent, plan version, promotion version, expected amount, currency, and idempotency key.
- `BIL-003` Signed Stripe webhooks MUST be verified against raw request bytes and stored in an encrypted/durable inbox before processing.
- `BIL-004` Webhook processing MUST be idempotent, order-tolerant, retryable, and reconcile Checkout Session, Customer, Subscription, Invoice, PaymentIntent, refunds, disputes, and credit notes.
- `BIL-005` Required lifecycle handling includes checkout completion/expiration, trial if introduced, active, past due, unpaid, paused, canceled, scheduled change, payment success/failure, refund, dispute, and provider deletion.
- `BIL-006` Entitlements MUST derive from the local reconciled subscription state, never directly from browser return URLs.
- `BIL-007` The Customer Portal MUST support approved payment-method updates, invoice history, cancellation, and allowed plan changes while preserving DJay Bots authorization rules.
- `BIL-008` Billing administrators MUST see subscription, next renewal, price, promotion, payment state, invoices/credits, usage, overage estimate, and portal access.
- `BIL-009` Operators MUST have a reconciliation queue for mismatched or unprocessed provider state, with safe replay and audit.

## 15. Invoices, credit notes, accounting, and revenue controls

- `FIN-001` Finalized invoice records MUST be immutable. Corrections MUST use a credit note and replacement invoice or other legally approved append-only adjustment.
- `FIN-002` Store immutable invoice number, legal entities, tax IDs/addresses, line descriptions, quantities, unit amounts, discounts, tax, currency, totals, period, payment reference, source hashes, and document artifact.
- `FIN-003` Credit notes MUST reference the original invoice and reason, retain immutable lines/totals, and never delete or rewrite the original.
- `FIN-004` Invoice/credit numbering MUST be unique, monotonic according to approved accounting policy, race-safe, and reproducible.
- `FIN-005` Stripe billing objects and FlowAccount records MUST be linked by immutable external-reference mappings but neither provider may silently overwrite the local accounting ledger.
- `FIN-006` FlowAccount synchronization MUST use an outbox, idempotency/reference keys, retry with backoff, operator review, and daily reconciliation.
- `FIN-007` Finance operators MUST be able to see pending, synced, rejected, mismatch, and manually resolved states without editing finalized facts.
- `FIN-008` Tax invoice, receipt, credit-note, refund, withholding-tax, and data-retention behavior MUST pass Thai accountant/legal acceptance before paid GA.

## 16. Overage, alerts, packs, and safety caps

- `OVR-001` Flow usage MUST be enforced at its allowance according to an approved fair-use and limit-reached policy; no Flow overage price is advertised.
- `OVR-002` AI Text and Voice customers MUST explicitly enable pay-as-you-go overage or purchase a pack before charges can exceed the prepaid term, unless the checkout contract explicitly obtains equivalent consent.
- `OVR-003` Usage packs MUST be immutable purchases linked to one tenant, meter, quantity, validity policy, payment, and consumption ledger.
- `OVR-004` Forecast consumption and overage cost using current pace, recent seasonality when sufficient, purchased packs, remaining period, and plan rate. Label forecasts as estimates.
- `OVR-005` Notify at configurable thresholds including 50%, 75%, 90%, 100%, forecasted exhaustion, safety-cap proximity, cap reached, and anomalous spikes.
- `OVR-006` Customers MUST be able to set a hard monetary or quantity safety cap at or above a platform minimum and choose an allowed fallback behavior.
- `OVR-007` Enforcement MUST be atomic under concurrency and fail closed against billable resource allocation after a hard cap.
- `OVR-008` Operators MUST be able to grant auditable, expiring goodwill credits without editing usage events.
- `OVR-009` Daily reconciliation MUST compare raw events, aggregates, entitlements, packs, provider activity, and Stripe invoice quantities where applicable.

## 17. Analytics and reporting

- `ANA-001` All reports MUST state timezone, period, filters, last-updated time, and data freshness.
- `ANA-002` Basic Flow analytics: conversations, completion, drop-off, leads, handovers, top topics, and outcome counts.
- `ANA-003` Advanced Flow analytics: journey/node performance, branch conversion, unanswered inputs, CTA conversion, department/channel breakdown, and reusable-flow performance.
- `ANA-004` Basic AI analytics: conversations, generated replies, leads, handovers, confidence distribution, unanswered/escalated questions, and usage.
- `ANA-005` Advanced AI analytics: questions, intents, topics, recommendation/CTA outcomes, lead qualification/scoring, source coverage, channel/language, response quality feedback, and knowledge gaps.
- `ANA-006` Basic Voice analytics: sessions, connected minutes, completion/disconnect, leads, callback/appointment requests, outcomes, and average duration.
- `ANA-007` Advanced Voice analytics: channel/department/agent/language, intents, objections, transfer success, scheduling outcome, sentiment indicators, lead outcomes, concurrency, latency, and cost/usage.
- `ANA-008` Personally identifiable information MUST be minimized or permission-gated in analytics and excluded from general observability logs.

## 18. Professional services, add-ons, and Enterprise

### 18.1 Professional setup services

| Service | Starting price | Required deliverable |
| --- | ---: | --- |
| Starter Flow Setup | THB 3,900 | Business review, up to 20 configured topics, basic journey, lead form, one CTA, installation assistance |
| Advanced Flow Design | THB 7,900 | Advanced mapping, conditions, categories, qualification, booking/quotation journey, up to 50 configured topics |
| Complex Flow Automation | THB 19,900 | Scoped large structure, departments, business logic, APIs, complex booking/sales journeys |
| Knowledge-Base Setup | THB 4,900 | Content review, website import, FAQ preparation, document organization, initial answer tests |
| AI Sales Configuration | THB 4,900 | Personality, sales instructions, qualification, objection, CTA configuration |
| Advanced AI Sales System | THB 9,900 | Complete sales strategy, recommendations, qualification, escalation, testing, optimization |
| Voice Agent Setup | THB 9,900 | Opening, personality, FAQs, qualification flow, outcomes, testing, optimization |
| Telephone Integration | THB 4,900 | Provider/number integration; external fees excluded |
| Custom Voice Automation | THB 19,900 | Scoped CRM, appointments, departments, routing, and sales automation |

- `PRO-001` Professional services MUST create a separate order/SOW, scope, owner, target dates, customer inputs, acceptance checklist, and completion record.
- `PRO-002` Starting prices MUST NOT be converted into fixed scope beyond the inclusions above without an approved quotation.
- `PRO-003` Professional-service access to tenant content MUST be consented, least-privilege, time-bound, and audited.

### 18.2 Add-ons

| Add-on | Price | Entitlement behavior |
| --- | ---: | --- |
| Additional social channel | THB 299/month/channel | Adds one supported channel connection to the specified bot/workspace subject to third-party fees |
| Additional administrator | THB 99/month/admin | Adds one active administrator seat |
| Additional business workspace | From THB 299/month | Adds one scoped workspace according to quotation/catalogue version |
| Starter branding removal | THB 199/month | Removes DJay Bots widget branding while active |

- `ADD-001` Monthly add-ons attached to an annual subscription MUST have an explicit proration, renewal, cancellation, and failed-payment policy.
- `ADD-002` Add-on activation MUST require successful billing state and update entitlements idempotently.
- `ADD-003` Removing an add-on MUST preserve data but prevent new use after its effective end; the UI MUST identify required remediation.
- `ADD-004` The supported additional-channel catalogue MAY include WhatsApp and an additional website when their adapters, provider approvals, pricing, and release gates are complete; the UI MUST show only channels currently sellable for that tenant and region.

### 18.3 Enterprise routing

Requests exceeding 100,000 Flow conversations, 10,000 AI replies, 500 voice minutes, standard concurrency, bots, channels, brands/branches, or requiring custom CRM/API, dedicated infrastructure, SLA, training, advanced security/reporting, or white-label deployment MUST route to an Enterprise qualification workflow. Enterprise is quoted and is not silently enabled by standard-plan overage.

## 19. Core user journeys

### 19.1 Evaluate and subscribe

1. Visitor starts on a landing page that presents all three product families and proceeds to package comparison.
2. Visitor chooses Flow Bot, AI Text Bot, or AI Voice Bot first, then chooses Starter or Advanced. No role/business-goal question precedes the product selection.
3. Visitor chooses paid subscription or, for eligible Flow/Text selections, the approved 30-day Starter trial.
4. Visitor configures, tests, and publishes an anonymous draft, then presses `Deploy Bot`; only then does the visitor create or sign into an account and review the selected product, access type, due-now amount, renewal/trial limits, channel scope, and legal terms. The completed draft must survive this boundary.
5. Paid purchase uses an authoritative Stripe Checkout Session and signed webhook. Trial provisioning uses an authoritative, eligibility-checked, idempotent entitlement command.
6. Provisioning creates the tenant/workspace/access exactly once and routes the merchant to that product's separate onboarding.

### 19.2 Build and publish

1. Flow Bot starts with one of six editable templates or blank; Text/Voice starts with role selection, website/manual business learning, transparent task progress, and editable generated business/behavior/FAQ material.
2. Administrator enters the full-page product Configuration Studio and may open, skip, or revisit any section while draft autosave preserves work.
3. The expandable right panel tests the current draft without billable customer usage or external side effects. Testing and reviewing every section are recommended but optional.
4. Content-quality and incomplete-review findings are advisory. Only technical, security, legal, entitlement, or external-action invariants may block the affected operation.
5. Administrator explicitly publishes an immutable revision. Publication does not install the widget or enable traffic.
6. Administrator copies the website snippet, supplies/validates the HTTPS origin, verifies installation, and explicitly chooses Go live. Rollback and traffic-off controls remain available.

### 19.3 Operate and improve

1. Staff monitor conversations, leads, handovers, outcomes, knowledge gaps, and usage.
2. Threshold/quality/integration alerts link to a concrete corrective action.
3. Staff update a draft and validate before publishing.
4. Advanced customers export or synchronize approved records.

### 19.4 Change or end service

1. Billing manager reviews next renewal, usage, consequences, and eligible changes.
2. Upgrade/add-on is billed and activated idempotently; downgrade is validated and scheduled.
3. Cancellation preserves access through the paid term and confirms data-export/deletion dates.
4. At entitlement end, bots stop new service gracefully, operator access follows retention policy, and deletion/export requests remain available.

## 20. UX and accessibility requirements

- `UX-001` Tenant applications MUST be responsive at supported desktop/tablet/mobile widths without overlapping text or controls.
- `UX-002` Meet WCAG 2.2 AA for customer widgets and critical tenant workflows, including keyboard, focus, contrast, labels, errors, and reduced-motion behavior.
- `UX-003` Thai and English UI/content MUST use locale-aware dates, numbers, currency, line breaking, search, and validation.
- `UX-004` Destructive, billable, publishing, and external-action operations MUST show impact and require explicit confirmation.
- `UX-005` Long-running imports, crawls, exports, syncs, and provisioning MUST show queued/running/succeeded/partially succeeded/failed states and recovery action.
- `UX-006` Limit-reached states MUST identify the meter, current usage, reset time, available pack/upgrade, and service fallback without misleading success.
- `UX-007` Plan comparison and in-product entitlement messaging MUST be generated from the same versioned catalogue data used by enforcement.
- `UX-008` Authoritative read failure MUST render unavailable/retry state and MUST NOT be represented as an empty collection, zero metric, successful state, or endless loading state.
- `UX-009` Draft preview, current published-version test, deployed verification, and live production MUST be visually and semantically distinct.
- `UX-010` Product setup MUST use job-oriented, resumable steps; complex product Studios MUST NOT require editing raw JSON as the primary workflow.
- `UX-011` The authenticated tenant product MUST use compact, work-focused layouts with stable navigation, tables, split panes, and tool surfaces rather than decorative marketing composition.
- `UX-012` UI visibility MUST follow role and entitlement, but every backing route/service MUST independently enforce the same authorization and commercial boundary.
- `UX-013` The public landing and package page MUST show all three product families; the merchant MUST select bot family and package before a role or bot-specific configuration question.
- `UX-014` Flow Bot MUST use template-led deterministic onboarding. AI Text and AI Voice MUST use separate role-led onboarding with Customer Support, Sales Associate, and Appointment Booking choices.
- `UX-015` The product Configuration Studio MUST remain a dedicated full-page surface with a direct Dashboard route and an expandable real-draft tester. Dashboard access MUST remain available before configuration completion and MUST highlight Configuration as `Not configured` until publication.
- `UX-016` `Needs attention`, `Not reviewed`, and `Not tested` states MUST remain advisory. The UI MUST NOT force completion of all categories, all review actions, or all suggested tests before publication.
- `UX-017` Publication, snippet installation, origin verification, and Go live MUST be separate explicit states and commands.
- `UX-018` Processing status for website learning MAY use friendly varied task copy but MUST describe observable pipeline stages and MUST NOT reveal or fabricate hidden chain-of-thought.

## 21. Security, privacy, and compliance

- `SEC-001` Encrypt data in transit and at rest; use managed KMS and Secret Manager for application/provider secrets.
- `SEC-002` Apply OWASP ASVS-aligned controls, CSRF protection, secure cookies, CSP, origin validation, rate limiting, input/file validation, and dependency/container scanning.
- `SEC-003` Verify signatures for Stripe and social webhooks before business processing; preserve raw evidence according to retention policy.
- `SEC-004` Scan uploads, restrict MIME/size, isolate processing, prevent active content execution, and protect retrieval from hostile document instructions.
- `SEC-005` Maintain data classification, retention, export, correction, deletion, consent, and legal-hold processes suitable for Thailand's PDPA and customer agreements.
- `SEC-006` Provider data-processing terms, residency implications, training/retention settings, subprocessors, and cross-border transfers MUST be reviewed before production enablement.
- `SEC-007` No secrets, raw payment data, unrestricted PII, document content, or complete transcripts may appear in normal application logs.
- `SEC-008` Platform access, billing mutations, invoice creation, credits, entitlement overrides, exports, and support access MUST be audited.
- `SEC-009` Perform threat modeling, SAST, dependency scanning, container scanning, secret scanning, penetration testing, tenant-isolation testing, and webhook replay testing before paid GA.

## 22. Reliability and performance

| Measure | Paid-GA objective |
| --- | --- |
| Tenant web/API availability | 99.9% monthly, excluding published maintenance |
| Flow runtime availability | 99.9% monthly |
| AI Text platform availability | 99.5% monthly, provider impairment distinguished |
| Voice gateway availability | 99.5% monthly, provider/carrier impairment distinguished |
| Flow p95 response start | <= 1.0 second excluding channel delivery |
| AI Text p95 time to first response content | <= 5 seconds under supported load, excluding declared provider incident |
| Voice p95 user-stop to audible response start | target <= 2.0 seconds; validate per language/provider |
| Webhook durable acknowledgement | <= 2 seconds when provider permits asynchronous processing |
| RPO | <= 15 minutes for primary transactional data |
| RTO | <= 4 hours for regional service recovery; exact Voice/third-party degradation documented |

- `REL-001` SLOs MUST have service-level indicators, dashboards, alert thresholds, ownership, and error-budget review.
- `REL-002` All asynchronous operations MUST be idempotent, retryable with bounded backoff, and dead-lettered for reviewed recovery.
- `REL-003` Public requests MUST use request/correlation IDs propagated through gateways, workers, usage, webhooks, and provider calls.
- `REL-004` Capacity tests MUST cover advertised allowances, tenant hotspots, two concurrent Advanced voice sessions per tenant, global concurrency, and campaign/channel bursts.
- `REL-005` Dependency outages MUST degrade by capability and preserve accepted work; they MUST NOT corrupt subscription, usage, invoice, or configuration state.

## 23. Product success metrics

- Paid checkout completion and provisioning success.
- Time from purchase to first published working bot.
- Activation: knowledge/flow configured, widget/channel connected, and first customer conversation.
- 7-day and 30-day active tenants by package.
- Conversation completion, lead capture, qualified lead, CTA, booking, and handover outcomes.
- AI grounded-answer quality, unanswered rate, escalation rate, and operator correction rate by Thai/English/additional language.
- Voice connection success, latency, completion, transfer, appointment, and disconnect reasons.
- Usage forecast accuracy, unexpected-overage complaints, safety-cap efficacy, and reconciliation mismatches.
- Renewal, upgrade, downgrade, cancellation, failed-payment recovery, and support volume.
- Platform SLO attainment, incident rate, recovery time, and tenant-isolation/security findings.

Metrics MUST NOT optimize response volume at the expense of correctness, customer consent, lead quality, cost transparency, or human escalation.

## 24. Package acceptance matrix

| Package | Release acceptance summary |
| --- | --- |
| Flow Starter | Requirements `FLS-001` through `FLS-015`, shared and `EXP-*` requirements, exact catalogue/branding/admin/topic/conversation limits, complete Flow onboarding, and production website widget pass |
| Flow Advanced | All Flow Starter behavior where not superseded plus `FLA-001` through `FLA-017`, `SOC-*`, deterministic LINE/Messenger, rich media, integrations, reports, branding removal, and limits pass |
| AI Text Starter | `AIT-*`, `KNO-*` applicable to Starter, `ATS-001` through `ATS-011`, shared and `EXP-*`, Thai/English quality, complete AI onboarding, ingestion, typed CTAs, overage controls, and production website pass |
| AI Text Advanced | Starter foundations plus `ATA-001` through `ATA-013`, `SOC-*`, catalogues, additional languages, CRM/Sheets/webhooks, scoring/summaries/reports, and limits pass |
| Voice Starter | `VOI-*` plus `VOS-001` through `VOS-009`, shared and `EXP-*`, complete Voice onboarding, Thai/English web voice, metering, transcripts/outcomes/callback, concurrency, and production realtime provider pass |
| Voice Advanced | Starter foundations plus `VOA-001` through `VOA-013`, `TEL-*`, inbound telephone, scheduling, live/department transfer, additional languages, integrations, advanced reports, carrier itemization, and concurrency pass |

No package may be marked sellable merely because its UI exists. Acceptance requires an end-to-end production-like test, correct entitlement denial, metering/reconciliation, failure-state behavior, security evidence, and operator runbook.

## 25. Release gates

### 25.1 Gate A: specification and traceability

- Every offer line maps to a requirement ID and automated/manual acceptance case.
- Catalogue, meter, billing, tax, language, channel, telephony, CRM, and retention policies are owner-approved.
- Architecture threat model and data-processing inventory are approved.

### 25.2 Gate B: feature complete in staging

- All six packages meet their package acceptance matrix in GCP staging.
- Entitlement boundary tests prove both allowed and denied behavior.
- Stripe test-mode lifecycle, invoices/credits, FlowAccount sandbox or approved test double, usage, alerts, caps, and reconciliation pass.
- Social and telephone integrations pass provider review/sandbox and real-device tests.

### 25.3 Gate C: operational readiness

- Monitoring, on-call ownership, alerts, runbooks, support tooling, status communication, backups, and restore drill pass.
- Load, soak, failover, dependency outage, webhook replay, dead-letter recovery, tenant isolation, and penetration tests pass.
- Privacy, terms, promotion, cancellation, refund, tax/accounting, third-party fee, AI disclosure, and recording consent are approved.

### 25.4 Gate D: controlled production launch

- Production DNS, certificates, secrets, quotas, billing budget, sender domains, providers, and merchant settings are verified.
- Internal tenants and limited design partners complete real payment-to-service journeys.
- No unresolved severity-1 or severity-2 defects; severity-3 exceptions require named owner, mitigation, and deadline.
- Product owner signs each package sellable independently. Unsigned packages remain hidden/non-sellable without changing their committed scope.

## 26. Dependencies and decisions still requiring owner/vendor validation

These decisions choose how to fulfill the offer; they do not remove requirements.

1. Select and contract the initial telephony/SIP carrier supporting Thai numbers, inbound media streaming, transfer, itemized cost, and production scale.
2. Select the first basic CRM connector based on target-customer demand and API/sandbox quality.
3. Approve the exact additional-language launch list after text and voice quality tests.
4. Approve Thai VAT/tax invoice/credit-note/withholding and promotion terms with accountant/legal counsel.
5. Validate FlowAccount API/sandbox contract, rate limits, fields, document numbering, and reconciliation procedure.
6. Approve overage opt-in defaults, grace thresholds, minimum safety cap, pack expiry/consumption ordering, proration, refund, and downgrade policies.
7. Approve data retention by artifact: account, lead, transcript, audio if enabled, document, audit, webhook, invoice, and backup.
8. Confirm LINE, Meta, email, telephony, OpenAI, Stripe, FlowAccount, and Google production accounts, reviews, quotas, and support contacts.
9. Approve automatic-conversion/charge policy, repeat-trial/abuse rules, trial-data retention, and any Text-trial warning recipients beyond the account owner. Until approved, no automatic conversion/charge or additional recipient is permitted.

## 27. Traceability and change control

- Product backlog items MUST reference one or more PRD IDs.
- Architecture components and data models MUST identify the PRD IDs they implement.
- Tests MUST reference PRD IDs in names, metadata, or the release evidence index.
- A catalogue change requires product-owner approval, version/effective date, migration impact, pricing/entitlement tests, customer communication, and preserved historical interpretation.
- A requirement is complete only when code, migration, tests, UI, documentation, telemetry, security controls, and operational recovery are complete where applicable.
- The commercial feature gap audit remains evidence of the starting point, not authority to narrow this PRD.

## 28. End-to-end SaaS experience requirements

### 28.1 Public acquisition and unsubscribed business

- `EXP-001` The public experience MUST let a prospect compare all six packages by family, exact first-year price, renewal, allowance, overage, bot/agent count, channels, administrators, integrations, branding, support, exclusions, and setup services.
- `EXP-002` Package comparison, checkout, and workspace entitlement copy MUST use the active versioned catalogue rather than separate hardcoded commercial values.
- `EXP-003` A prospect MUST configure, test and publish the selected Bot without registering. Registration or sign-in MUST first appear when the prospect presses `Deploy Bot`; after verification the prospect MUST resume the preserved deployment and may still decline payment or trial activation.
- `EXP-004` The package selection and anonymous configuration draft MUST be preserved as an opaque server-side intent through deployment-time registration, verification, sign-in, checkout interruption, and return; browser parameters MUST NOT be trusted as price, plan, configuration or tenant authority.
- `EXP-005` A verified unsubscribed owner MUST receive a functional workspace showing business/security setup and package selection, not empty operational analytics or inaccessible product Studios.
- `EXP-006` Expensive provider resources, live publication, channel connection, and production customer-data ingestion MUST NOT be allocated before active entitlement or an explicitly approved internal pilot grant.
- `EXP-007` Checkout review MUST identify the charged workspace, package, first-term total, regular renewal, billing period, allowance, overage/pack mode, add-ons/cadence, taxes, business details, and third-party exclusions before redirecting to Stripe.
- `EXP-008` The checkout-return view MUST resolve authoritative local/provider state and support processing, active, action-required, expired/canceled, and unavailable outcomes without provisioning from the return URL.
- `EXP-009` An open checkout MUST be resumable and duplicate-safe. An expired checkout MUST be replaced from the preserved intent; unknown payment result MUST be reconciled before a customer is asked to pay again.
- `EXP-010` The acquisition sequence MUST be Landing -> Packages -> Bot family -> Package -> Subscribe or eligible trial -> Account -> product-specific onboarding. All three families MUST remain visible on Landing and Packages.
- `EXP-011` Flow and AI Text trial presentation and enforcement MUST follow `TRL-001` through `TRL-009`; AI Voice MUST show subscription-only.

### 28.2 Post-subscription and product onboarding

- `ONB-001` After active payment, the customer MUST see package, paid term, renewal, allowance, usage-protection state, invoice/receipt state, and a primary product-specific setup action.
- `ONB-002` Onboarding MUST be resumable and evidence-derived with back/continue, saved draft state, per-field error recovery, and scoped setup-help entry. Role awareness applies to AI Text and AI Voice; Flow uses template choice instead.
- `ONB-003` Shared prerequisites MUST cover business profile, language/timezone/business hours, lead/handover destination, privacy/disclosure/retention, and usage thresholds/overage/safety cap.
- `ONB-004` Flow Starter onboarding MUST offer the six approved starting journeys, editable identity/widget preview, visual step map, lead capture, fallback/handover, optional real-draft test, publish, website origin/install verification, and explicit activation.
- `ONB-005` Flow Advanced onboarding MUST additionally cover rich content, advanced logic/customer state, business hours/departments, business workflows, integrations, selected social channel, capability fallback preview, and goals/analytics.
- `ONB-006` AI Text Starter onboarding MUST follow Role -> Website or manual business source -> transparent processing -> editable generated business/behavior/FAQ review -> role-specific full-page Configuration Studio -> optional Thai/English grounded test -> publication -> website verification -> explicit activation.
- `ONB-007` AI Text Advanced onboarding MUST additionally cover multiple agents/collections/catalogues, additional validated languages, qualification/segments/tags/scores, routing, CRM/Sheets/webhooks, selected social channel, summaries, and monthly knowledge review.
- `ONB-008` Voice Starter onboarding MUST follow the same role/source/processing/editable-review structure as AI Text, then provide role-specific configuration plus provider-neutral Voice settings, optional Thai/English voice test, publication, website verification, and explicit activation.
- `ONB-009` Voice Advanced onboarding MUST additionally cover multiple agents/departments, additional validated languages, telephone number/carrier status, scheduling, live/department transfer and fallback, CRM/Sheets/webhooks, reporting, carrier fees, and real inbound test call.
- `ONB-010` A tenant with multiple product families MUST see independent entitlement, configuration, current-version test, deployment, and live-health state for each family. One product MUST be launchable while another remains processing or incomplete.
- `ONB-011` Shared knowledge, team, customer, or integration resources MUST show all product bindings and change/delete impact; reuse MUST NOT merge product meters or readiness.
- `ONB-012` Preview and current-version test activity MUST not consume customer allowance or create production external side effects; internal provider cost MUST remain separately observable. The anonymous AI Text builder MUST use a 50-request maximum per signed 30-day builder session and MUST NOT impose a small rolling conversation throttle.
- `ONB-013` Website learning MUST exclude login/account, checkout, private, form-submission, and unrelated pages; expose partial/failure recovery; and allow every generated business field, agent objective/behavior/boundary, and FAQ to be edited or removed.
- `ONB-014` The Configuration Studio section navigator MUST be the primary guide. A second readiness panel MUST NOT repeat the same checklist. Merchants MUST be able to skip, revisit, or publish with advisory warnings.

### 28.3 Post-onboarding business operations

- `OPS-001` Workspace Overview MUST show each product lifecycle, customer/lead/handover/action outcomes, usage risk, operational attention, and recent changes with the primary command derived from current state.
- `OPS-002` Inbox MUST unify website, social, and voice conversations while preserving channel/product identity, canonical rich content, assignment, customer/lead context, handover, delivery/reply-window, and outcome state.
- `OPS-003` Business staff MUST be able to accept/assign/resolve/reopen handovers, reply where permitted, annotate, update leads/outcomes, schedule callbacks, and return to bot only under safe policy.
- `OPS-004` Leads/contacts MUST expose source, product/channel, qualification, score, stage, owner, consent, identity history, tags, activity, next action, and suggestion-only duplicate review.
- `OPS-005` Appointment/callback UX MUST distinguish requested, pending, confirmed, rescheduled, canceled, failed synchronization, due, and completed; unknown external outcomes MUST NOT appear confirmed.
- `OPS-006` Usage UX MUST separate meters by product contract and show included/used/remaining, packs, forecast, estimated overage, reset, alerts, cap, and reconciliation freshness.
- `OPS-007` Billing UX MUST show all compatible family contracts, add-ons, packs, terms, renewal/payment state, billing/tax entity, invoices, credit notes, refunds/disputes, Portal, and plan-change consequences.
- `OPS-008` Upgrade MUST show effective entitlement, charge/proration, and renewal. Downgrade MUST run preflight and preserve excess data as disabled/read-only rather than deleting it. Cancellation MUST disclose access end and export/deletion dates.
- `OPS-009` Team UX MUST show included/used/invited/add-on administrator seats and prevent an invitation beyond entitlement unless an authorized add-on is purchased.
- `OPS-010` Product analytics MUST answer business outcome questions and always show period, timezone, filters, denominator, freshness, and entitlement-appropriate depth.
- `OPS-011` The merchant dashboard MUST be directly accessible before bot configuration is complete and MUST expose Overview, Conversations, Contacts, Leads and follow-up, Appointments, Analytics, Configuration, and Usage and plan.
- `OPS-012` A merchant MAY take over a website bot conversation only while the latest bot response is less than five minutes old. The server MUST revalidate recency and ownership atomically; once in human mode automation pauses until explicit return. Flow returns to its main menu, while AI returns under the safe AI continuation policy.

### 28.4 Customer-facing website experience

- `WEB-001` The website loader MUST use a public deployment key, verify allowed origin server-side, fetch a provider-neutral manifest, isolate widget styling from the host, and expose no tenant/provider secret.
- `WEB-002` Installation MUST provide snippet, origin validation, position/theme/brand controls, desktop/mobile preview, automated install check, real-site test, and duplicate-launcher detection.
- `WEB-003` When multiple bot families are deployed on one site, the merchant MUST choose one launcher with mode selection/escalation or explicit inline secondary entry points; the product MUST NOT render competing floating launchers by default.
- `WEB-004` Shared widget behavior MUST include accessible identity/disclosure/privacy, stable responsive geometry, minimize/restore, durable conversation recovery, real unread state, explicit availability/fallback, and plan-correct branding.
- `WEB-005` Flow widget MUST render ordered text/media/cards/buttons/forms/CTAs, preserve and validate input, resolve submissions idempotently, expose handover state, and route unknown text only through configured deterministic fallback.
- `WEB-006` AI Text widget MUST support natural input, truthful progress, grounded structured responses, typed actions, safe low-confidence/refusal behavior, contextual lead capture, and explicit bot/human actor state.
- `WEB-007` Voice widget MUST request microphone only after explicit start and expose stable permission/connecting/listening/speaking/mute/end/reconnect/action/transfer/warning/ended states with text/call alternatives.
- `WEB-008` Customer-facing limit/provider/cap failure MUST use the tenant-approved contact, Flow, LINE, call, or human fallback and MUST NOT expose model, token, provider, internal entitlement, or quota identifiers.

### 28.5 Social and telephone customer experience

- `SOC-001` Social connection setup MUST validate entitlement/channel slot, provider authorization/account/scopes, bot binding, language, business hours, handover, reply-window fallback, capability preview, two-way test, and health before activation.
- `SOC-002` Flow social conversations MUST use the deterministic runtime, native channel controls where supported, reviewed fallbacks otherwise, and no AI reply meter for normal execution.
- `SOC-003` AI Text social conversations MUST retain grounding/action/handover policy, adapt to channel limits, meter one committed reply once despite delivery retry, and avoid duplicate output.
- `SOC-004` Social handover MUST give staff transcript/context/reason/department/assignment and reply-window deadline; the composer MUST disable before an impermissible reply and show approved alternatives.
- `SOC-005` Reauthorization, provider outage, rate limit, invalid content, closed window, and rejected delivery MUST be distinct operational states with actionable merchant alerts and safe end-customer fallback.
- `TEL-001` Inbound telephone flow MUST resolve tenant/number/agent/language/routing/admission, provide approved AI/transcription disclosure, execute grounded conversation/actions, support language/human/callback/end requests, and finalize usage/outcome once.
- `TEL-002` Telephone interaction MUST bound silence/poor-audio loops, provide DTMF fallback where required, confirm external actions only after verification, and use approved emergency/regulated-request behavior.
- `TEL-003` Live transfer MUST expose pending/connected/failed state, provide context to the human destination, and return to configured callback/fallback when it fails.
- `TEL-004` Known usage/time/cap risk MUST warn and transition safely rather than terminate a call mid-sentence, except immediate security/emergency action.

## 29. Platform Master and SaaS operation requirements

- `PLT-001` Platform Master MUST use route-based, role-restricted operational workspaces for command center, tenants, subscriptions/checkouts, catalogue/promotions, usage/overages, finance/accounting, providers/channels, AI/Voice, jobs/recovery, support, release, security/audit, and configuration.
- `PLT-002` The command center MUST prioritize current customer impact and business risk: provisioning, onboarding, deployment/channel health, usage/caps/margin, payment/finance mismatch, provider incidents, queue backlog, support, and package release state.
- `PLT-003` Tenant 360 MUST combine identity/contract/product lifecycle/deployment/usage/billing/integration/support/audit evidence while masking sensitive customer content by default.
- `PLT-004` Catalogue/promotion activation MUST require immutable draft version, effective date, price/provider mapping, public preview, entitlement/price tests, diff, and approved activation; active versions MUST NOT be directly edited.
- `PLT-005` Checkout/subscription/provisioning exception queues MUST provide idempotent evidence-based recovery and MUST NOT require direct database repair.
- `PLT-006` Finance workspaces MUST visibly preserve immutable invoices/credits and route corrections through credit/replacement and reconciled FlowAccount workflows.
- `PLT-007` Provider routing, Voice admission, channel/carrier health, incident safeguard, and release gates MUST remain provider-confidential and independently authorized/reviewed.
- `PLT-008` Support cases and access grants MUST capture scope, reason, duration, consent/break-glass authority, visible tenant disclosure, expiry/revocation, and audit.
- `PLT-009` Standard and Priority support entitlement MUST map to separate operational queue/SLA policy without exposing an unsupported response-time promise.
- `PLT-010` Customer and platform notification centers MUST group actionable lifecycle events, deep-link to affected objects, suppress duplicates, and never claim success before authoritative state.
- `PLT-011` The approved SaaS Owner analytics experience, metric definitions, field ownership, filters, exports, privacy boundaries and change-control rules MUST follow `docs/design/djay-bots-saas-owner-analytics-contract.md`; no implementation or historical screen MAY silently substitute a different behavior.
- `PLT-012` Owner Overview MUST report period-, timezone-, currency-, freshness- and reconciliation-qualified merchant, subscription, conversion, revenue, collection, refund, usage, provider-cost, margin, deployment and attention metrics; MUST include a keyboard-accessible Daily/Monthly Net revenue trend bound to the approved net-collected definition with a same-value table alternative and separate currencies; and MUST distinguish unavailable or incomplete evidence from zero.
- `PLT-013` The merchant directory MUST provide server-side search, sorting, pagination, combinable URL-representable filters and governed export across approved identity, business, lifecycle, subscription, deployment, usage, revenue, support and risk fields.
- `PLT-014` The SaaS user directory MUST expose approved identity, verification, security, activity, legal-acceptance and merchant-membership fields and filters; Owner-authorized User Detail MUST expose the complete lawfully stored identity-owned personal contact record under recent assurance, purpose and audit, offer 100 membership results per page and show merchant name, company role, membership state, first join date, merchant subscription start and expiry/access-end dates, subscribed products and effective access while attributing subscriptions to the merchant rather than duplicating a personal subscription for each team member.
- `PLT-015` Subscription analytics MUST preserve separate Flow, Text and Voice records and expose creation, provisioning, trial, original start, current period, contract duration, renewal, scheduled and actual cancellation, access end, immutable price, invoice/payment, allowance and change-history evidence without flattening provider and entitlement states.
- `PLT-016` Revenue analytics MUST keep invoiced amount, cash collected, net collected, MRR, ARR, new/expansion/contraction/reactivation/churned MRR, average recurring revenue, refunds, credits, chargebacks, provider cost and variable gross margin definitionally separate and reconcilable.
- `PLT-017` Text analytics MUST keep customer-facing committed AI replies separate from internal input/cached/output/reasoning token, request, latency, reliability, quality, provider/model and cost evidence; token usage MUST NOT become a merchant billing meter without an approved commercial change.
- `PLT-018` Voice analytics MUST preserve exact connected seconds, customer-facing rounded minutes, session outcomes, concurrency, provider-reported audio/text usage, provider/model/voice attribution, latency, interruption, reconnect, transfer, callback, appointment and snapshotted cost evidence.
- `PLT-019` Provider and model analytics MUST be restricted to Platform Owner and expressly authorized AI Operations roles and MUST report immutable route/price versions, usage, reach, reliability, quality, incidents and cost without leaking provider/model identity into tenant or public surfaces.
- `PLT-020` Every cost-bearing Text or Voice event MUST pin provider, model, currency, native usage dimensions and effective unit-price version at event time; historical cost and margin MUST NOT be recomputed from a later provider price.
- `PLT-021` Owner exports MUST use a server-authoritative filter and column snapshot, bounded or asynchronous generation, spreadsheet-safe UTF-8 output, recent assurance for sensitive scope, encrypted short-lived artifacts, download/expiry/deletion audit and unconditional secret/payment-credential exclusion.
- `PLT-022` Merchant-account and SaaS-user analytics MUST remain separate from merchant end-customer contacts, messages, transcripts and recordings; ordinary cross-tenant lists and exports MUST mask or exclude end-customer content and sensitive content access MUST require purpose, applicable grant, recent assurance and immutable audit.
- `PLT-023` Reports MUST support approved period and cohort views across acquisition, configuration, deployment, first use, first outcome, trial conversion, renewal, retention, cancellation and churn, while alerts MUST be deduplicated, severity-labelled, assigned, deep-linked and resolved from authoritative state.
- `PLT-024` Merchant 360 MUST add owner-approved identity, membership, subscription, revenue, Text/Voice usage, model-economics, deployment, support, incident and audit projections while preserving masked defaults and state-appropriate, idempotent, authorized workflows instead of arbitrary direct edits.
- `PLT-025` Owner analytics read models MUST be derived and rebuildable from immutable tenant, billing and provider evidence, expose freshness and reconciliation state, retain UTC event authority, apply an explicit reporting timezone, preserve currency boundaries and distinguish empty, unavailable, delayed and zero states.

## 30. Related project documents

- `docs/design/djay-bots-approved-experience-contract.md`
- `docs/design/djay-bots-saas-owner-analytics-contract.md`
- `docs/design/djay-bot-text-voice-configuration-flow.html`
- `docs/audit/commercial-package-feature-gap-2026-07-18.md`
- `docs/audit/deployment-session-checkpoint-2026-07-18.md`
- `docs/architecture/djay-bots-v1-market-release-architecture.md`
- `docs/design/djay-bots-v1-ui-ux-and-user-flows.md`
- `docs/implementation/djay-bots-v1-detailed-implementation-plan.md`
- `docs/adr/001-target-workspace-runtime.md`
- `docs/adr/003-tenancy-rls-database-roles.md`
- `docs/adr/009-ai-text-gateway-sales-core.md`
- `docs/adr/011-release-readiness-slo-policy.md`
- `docs/adr/012-reviewed-dead-letter-recovery.md`
- `docs/adr/013-production-provider-selection.md`
