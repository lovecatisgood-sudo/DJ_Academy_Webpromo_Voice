# Commercial package feature gap audit - 2026-07-18

This audit compares the proposed **DJay Bots by DJAI** Starter/Advanced annual
packages with the current SaaS workspace. It evaluates the exact customer
promise, not only whether a related database table or internal primitive exists.

## Status definitions

- **Delivered locally**: the customer workflow, server authority, persistence,
  and relevant automated evidence exist in this repository.
- **Partial**: a related foundation exists, but the exact advertised workflow,
  limit, UI, integration, or production evidence is incomplete.
- **Missing**: no customer-ready implementation of the advertised capability was
  found.
- **External gate**: engineering exists locally, but credentials, provider
  approval, live evaluation, named-merchant acceptance, or managed-environment
  evidence is still required.

## Executive result

The offer is **not ready to publish as a purchasable product contract**. The
platform has strong multi-tenant, identity, deterministic Flow, AI Sales Core,
Web/social AI, Voice, usage-ledger, isolation, audit, and operations foundations.
However, the exact Starter/Advanced package limits and prices are not encoded,
several advertised customer-facing features do not exist, and paid activation
and production deployment are incomplete.

The current immutable catalog retains internal Basic/Premium keys while exposing
the customer-facing Starter/Advanced names. All six market-release plan versions
remain `sellable: false` because commerce was deliberately deferred, but annual
first-term/renewal amounts, allowances, overage rates, and package limits are now
encoded. Product runtime enforcement is being completed before sellability.

- Checkout collection and renewal activation remain deferred.
- One-time AI usage-pack purchasing remains deferred.
- Add-on purchasing and additional-workspace provisioning remain deferred.
- Production provider credentials, managed-cloud evidence, and named-merchant
  acceptance remain external gates.

## Shared platform capabilities

### Delivered locally

- Multi-tenant workspaces with forced PostgreSQL RLS and tenant-safe APIs.
- Public registration, email verification, login, recovery, MFA, invitations,
  ownership transfer, and separate tenant/platform identity realms.
- Tenant Master Admin, Admin, Operator, and Analyst roles.
- Shared contacts, leads, conversation history, inbox, human takeover/release,
  privacy export/erasure, audit, and retention controls.
- Immutable plan-version, entitlement-snapshot, quota reservation/settlement,
  usage-event, and reconciliation foundations.
- Responsive tenant, platform, public, Flow widget, AI widget, and Voice widget
  builds.
- Thai and English contracts across Flow, AI Text, and Voice.

### Partial or missing

- Seat counts are configured and enforced across pending invitations and active
  memberships; add-on purchase and self-service lifecycle remain deferred.
- Additional workspace purchase and workspace-count enforcement are missing.
- Starter branding removal as a paid add-on is missing; Advanced entitlement
  removal exists.
- Additional administrator and additional social-channel add-on purchasing is
  missing.
- Tutorials/help-center delivery is not a complete in-product workflow.
- Professional setup and Enterprise packages are service offerings, not
  platform automation; quoting, contracting, and fulfillment remain business
  processes.

## Flow Starter

### Delivered locally

- Deterministic, non-AI Flow engine and visual authoring.
- Website widget, exact-origin deployment keys, install checks, welcome/text
  messages, image/video media, product/service cards, carousels, typed actions,
  option buttons, forms, input capture, basic conditions, branching,
  lead creation, conversation history, analytics, CSV export, human handover,
  versioned publishing, rollback, and usage metering.
- Forms can collect customer name, email, and telephone data.
- Starter branding remains visible unless an entitlement removes it.

### Remaining gates against the offer

- The complete customer template library and tutorial/onboarding journey belongs
  to Shared SaaS Operations and is not yet evidenced.
- Rich media currently accepts safe HTTPS assets; a managed upload/media-library
  workflow is not promised by this package but may be added through the shared
  knowledge/object-storage pipeline.
- Commerce must activate the encoded annual contract before customer sale.

## Flow Advanced

### Delivered locally

- All delivered Flow Starter foundations.
- Advanced conditions, variables, delays, immutable subflows, business-hour
  schedules, routing teams, approved encrypted webhooks with retry/failure
  branches, advanced analytics, exports, and branding removal.
- Customer tags and typed attributes, unanswered-input and journey reports,
  Google Sheets/external API connector identities, safe rich web rendering, and
  deterministic LINE/Messenger transport with durable delivery.

### Remaining gates against the offer

- LINE and Messenger implementations are locally complete, but real provider
  credentials, provider-console webhook acceptance, delivery tests, fees, and
  named-merchant acceptance remain external gates.
- Google Sheets uses a deployed Apps Script HTTPS endpoint through the hardened
  connector. A real Google account authorization and merchant sheet acceptance
  test remain external gates.
- Managed-cloud queue/alert evidence and the shared full-browser/accessibility
  pass remain pending.

## AI Text Starter

### Delivered locally

- Website AI widget and provider-neutral Sales Conversation Core.
- Immutable playbooks with business name, agent identity, tone, sales goal,
  claims, discovery questions, CTA policy, contact requirements, bilingual
  greetings, business hours, and pinned knowledge revisions.
- Grounded responses, product/service explanation and recommendation through
  approved knowledge, objection-stage handling, lead capture, appointment
  requests, follow-ups, merchant email, human handover, conversation history,
  lead reports, analytics, immutable usage reservation/settlement, and branding.
- Thai and English text runtime contracts.
- Restricted OpenAI Responses adapter and independently deployable internal AI
  gateway now exist in the uncommitted worktree and pass local tests/builds.

### Partial or missing against the offer

- **1 AI Text Bot**: AI agent creation has no plan-level agent-count limit.
- **2,000 AI replies/month**: metering exists, but the allowance is null.
- **1 knowledge base**: revision-backed knowledge sources exist, but there is no
  one-knowledge-base product boundary.
- **Website-content import**: the UI can label pasted content as `url`; it does
  not fetch or crawl the URL.
- **FAQ import, PDF, DOCX, and TXT upload**: the UI accepts pasted text only. It
  has no file upload, extraction, malware scan, object storage, or parsing
  pipeline.
- **Booking, call, LINE, and website CTAs**: the model can write guidance as
  text, but the web widget has no typed clickable CTA rendering.
- **Quick replies**: Sales Core produces quick-reply data, but the web widget
  persists/renders only message text.
- **Low-confidence escalation**: grounding failures fail closed and handover is
  supported, but no accepted configurable confidence threshold and customer
  workflow implements this exact promise.
- **Weekly knowledge refresh**: missing automation and source synchronization.
- **1 administrator**: seat enforcement is missing.
- **฿0.35/reply and 1,000 replies for ฿299**: no accepted rate card, forecast,
  one-time usage-pack purchase, invoice, or collection workflow exists.
- Live OpenAI profile qualification, Thai/English evaluation, secrets, alerts,
  merchant acceptance, and production activation remain external gates.

## AI Text Advanced

### Delivered locally

- All delivered AI Text Starter foundations.
- LINE, WhatsApp, and Messenger connection operations, signed inbound webhooks,
  ordered/deduplicated events, encrypted credentials and subjects, durable
  workers, service-window enforcement, delivery retries, channel analytics, and
  platform operations health.
- Multiple knowledge sources and multiple AI agents can technically be created.
- Sales Core supports intent, qualification facts, recommendations, comparisons
  and objections in generated conversation, lead capture, appointment requests,
  follow-up, human handover, and merchant notification.
- Branding removal and richer omnichannel analytics entitlements exist.

### Partial or missing against the offer

- **Up to 3 bots**: no AI agent-count enforcement.
- **One supported social channel**: the current Premium entitlement enables all
  LINE, WhatsApp, and Messenger capabilities and does not enforce one selected
  channel. This conflicts with the package wording and add-on pricing.
- **10,000 replies/month**: metering exists, but the allowance is null.
- **Multiple knowledge collections/larger allowance**: sources and pins exist,
  but collection grouping, storage policy, and package limits are incomplete.
- **Website crawling and document uploads**: missing ingestion pipelines.
- **Product/service catalogue support**: structured business knowledge can be
  pasted, but no catalogue importer, catalogue entity, synchronization, or
  dedicated catalogue UI exists.
- **Additional languages**: missing. Playbooks, sessions, and widgets are
  restricted to `th` and `en`.
- **Customer segmentation, customer tags, and lead scoring**: missing.
- **Checkout/call/LINE/booking/quotation CTAs**: no typed CTA widget/action
  workflow; only text guidance and appointment requests exist.
- **Department routing**: AI handover exists, but there is no AI department/team
  routing contract comparable to Flow routing teams.
- **Conversation summaries and customer summaries**: missing as durable tenant
  workflows/reports.
- **Google Sheets, generic webhook, and CRM integration**: missing for AI Text.
- **Question, intent, and unanswered-question reports**: current analytics are
  aggregate session/turn/lead/appointment/delivery metrics, not these reports.
- **Monthly knowledge review**: missing automation; it could be a manual service
  but must not be presented as platform automation without an operating process.
- **5 administrators**: seat enforcement is missing.
- **฿0.25/reply and 5,000 replies for ฿999**: not implemented commercially.
- Restricted channel credentials, LINE/Meta acceptance, alert verification,
  rollback rehearsal, and named-merchant acceptance remain external gates.

## AI Voice Starter

### Delivered locally

- Web Voice widget with consent/disclosure, microphone capture, mute/end,
  transcript display, reconnect, bilingual states, and exact-origin deployment.
- Independent WebSocket Voice gateway, concurrency reservation, minute
  reservation and exactly-once settlement, maximum duration, interruption,
  silence handling, reconnect, health/capacity, emergency pause, and stale
  session recovery.
- Thai/English Voice Sales Core playbooks, knowledge pins, personality, greeting,
  FAQ/product explanation, lead qualification, contact capture, appointment
  request, callback request, handover terminal path, transcripts, summaries,
  outcomes, retention/privacy, and core analytics.
- Restricted OpenAI Realtime adapter exists for the Gen1 route and passes local
  unit/build verification.

### Partial or missing against the offer

- **1 Voice Agent**: no plan-level Voice deployment/agent-count limit.
- **150 connected minutes/month**: minute metering and rounding exist, but the
  catalog allowance is null.
- **1 knowledge base**: sources/pins exist without the advertised grouping and
  limit.
- **CTA guidance** is spoken/textual; there is no complete typed CTA execution
  surface in the Voice widget.
- **1 concurrent session**: the runtime enforces `concurrent_calls` when
  configured and refuses unconfigured concurrency, but the catalog value is
  currently null.
- **1 administrator**: seat enforcement is missing.
- **฿6/additional minute**: rate, forecasting, invoice, and collection are
  missing.
- **Optional telephone integration**: missing. Current Voice is WebSocket/web
  widget only; no carrier, number, SIP/PSTN, inbound call, or telephone billing
  adapter exists.
- Live OpenAI audio quality/latency, interruption/noise/reconnect, Thai/English,
  cost, load, rollback, and named-merchant acceptance remain external gates.

## AI Voice Advanced

### Delivered locally

- All shared Voice foundations.
- Server-resolved Advanced profile, two-person route qualification and approval,
  canary/promotion/rollback, incident pause, no silent Gen1 fallback, exact
  gateway route assignment, advanced aggregate analytics, CSV export, and
  restricted finance credit review.
- Multiple Voice deployments can technically be created.

### Partial or missing against the offer

- Advanced Voice is paused and unavailable by default. It has not passed live
  provider qualification or production admission.
- **Up to 3 agents**: no deployment/agent-count enforcement.
- **Inbound telephone integration, number rental, call routing, live human
  transfer, and department transfer**: missing.
- **500 minutes/month and 2 concurrent sessions**: enforcement primitives exist,
  but catalog values are null.
- **Additional languages**: missing; runtime contracts allow Thai and English.
- **Multiple knowledge collections**: multiple source pins exist, but collection
  grouping and package limits are incomplete.
- **Integrated appointment scheduling**: only pending merchant-confirmation
  appointment requests exist.
- **Objection/intent tagging**: Sales Core facts exist, but no complete advertised
  call-tag management/report workflow was found.
- **Sentiment indicators**: missing.
- **Google Sheets, generic webhook, and CRM integration**: missing.
- **5 administrators**: seat enforcement is missing.
- **฿5/additional minute**: commercial workflow is missing.
- Equivalent/live Gen2 route qualification, cost/margin thresholds, controlled
  degradation, live Thai/English quality, rollback, and merchant acceptance are
  external gates.

## Billing, promotion, and subscription lifecycle

### Delivered locally or partially

- Provider-neutral subscription states and allowed transitions.
- Immutable catalog/version and entitlement-snapshot foundations.
- Usage reservation, settlement, credit/waiver ledger, tenant Usage Center, and
  restricted reconciliation view.
- A Stripe HTTP adapter can create hosted Checkout and Customer Portal sessions
  and cancel an external subscription using fixed server-side Price IDs.
- Stripe `v1` signed webhook verification, live/test-mode boundary, encrypted
  idempotent webhook inbox, and conflict detection exist.

### Missing before charging customers

- Tenant-authorized Checkout, Portal, cancellation, upgrade, downgrade, and
  billing-contact routes/UI.
- Durable checkout-attempt/customer/subscription linkage and webhook application
  to local subscription state. Current Stripe events are inboxed but not applied.
- The six Stripe Products/Prices and their immutable local mappings.
- A first-year-only 50% promotion, eligibility/abuse prevention, and automatic
  renewal at the regular annual price. The current adapter sends no coupon,
  promotion code, discount, or subscription schedule.
- The Flow Starter first-year price needs an explicit rounding rule: half of
  ฿4,999 is ฿2,499.50, while the offer charges ฿2,499 and states a ฿2,500 saving.
- Renewal notice, failed-payment retries, grace, restriction, suspension,
  cancellation, refund, dispute, and chargeback operations.
- Thai VAT/tax policy, immutable invoice numbering, tax invoices, receipts,
  credit notes, retention, and delivery.
- FlowAccount synchronization, idempotent document mapping, retries,
  reconciliation, and accountant-reviewed exception handling.
- Overage forecasting, customer alerts, safety-cap changes, additional-usage
  packs, rate rounding, invoice lines, and collection.
- Add-on and Enterprise quote/order/billing lifecycle.
- Accepted legal/accounting/commercial ADR superseding ADR-008.

## Production and rollout gaps

- GCP bootstrap exists, but Cloud SQL, private networking, application images,
  Cloud Run services, load balancer, certificate, CDN, final DNS, monitoring,
  and managed backups are not deployed.
- Runtime secrets and provider credentials are not populated.
- The release source is uncommitted, so no truthful immutable image SHA exists.
- Flow broad self-service still requires three named pilot acceptances.
- AI Web requires live route evaluation and named-merchant acceptance.
- Social requires provider credentials/approvals, alerts, and rollback rehearsal.
- Voice Basic/Advanced require live quality, latency, load, cost, recovery, and
  merchant evidence.
- Managed backup/PITR, regional recovery, operational observations, staffed
  on-call/support, privacy/security/legal exercises, and end-to-end unfamiliar
  SME register/pay/configure/test/launch acceptance remain pending.

## Required implementation decisions

1. Confirm whether internal Basic/Premium plan keys remain stable while only the
   public labels change to Starter/Advanced. Renaming keys would require a wider
   migration and is unnecessary if labels alone meet the business need.
2. Define “topic,” “conversation,” “AI reply,” and “connected minute” as exact
   meter contracts, including timezone, reset, replay, bot/test traffic, and
   rounding behavior.
3. Implement Advanced as website plus one customer-selected supported social
   channel, with further channels granted through the advertised add-on. The
   current code enables all three for AI Premium and none for Flow Premium.
4. Implement unlimited Flow steps as no commercial step quota while retaining
   documented technical safety and fair-use protections against abusive graph
   size and runtime behavior.
5. Treat additional-language support, telephone and live transfer, CRM, Google
   Sheets, file ingestion, crawling, rich media, and scheduling as committed
   launch requirements for the packages that advertise them.
6. Accept exact annual price versions, promotion mechanism, allowance/rate
   versions, add-on rules, VAT/invoice policy, proration, refunds, dunning,
   cancellations, retention, and reconciliation.

## Recommended delivery order

1. Adopt the offer as the authoritative product contract and convert every
   advertised capability into an executable requirement and acceptance test.
2. Publish immutable Starter/Advanced plan versions with prices, annual interval,
   limits, allowances, rates, and feature entitlements; add negative tests for
   every package boundary.
3. Finish Stripe tenant workflows, lifecycle application, immutable invoices and
   credit notes, FlowAccount sync, overage forecasts/alerts/caps, and promotion
   renewal behavior.
4. Close the highest-impact product gaps: Flow rich media/links/social decision,
   real knowledge ingestion/crawling, typed AI CTAs/quick replies, agent/seat/
   channel limits, and Advanced integrations.
5. Build telephone, live transfer, sentiment, additional languages, integrated
   scheduling, CRM, and Google Sheets for the packages that advertise them.
6. Complete GCP staging, live provider evaluations, named pilots, managed
   recovery/monitoring, production deployment, DNS/TLS, and paid-GA acceptance.

## Verification performed for this audit

On 2026-07-18, `scripts/use-node24.sh pnpm run verify` passed lint, boundary
checks, typechecking, unit tests, and production builds across all 32 workspace
packages/apps. This proves current repository consistency; it does not prove the
missing commercial workflows or external production gates.
