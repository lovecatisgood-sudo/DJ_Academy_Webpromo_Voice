# DJay Bots V1 UI/UX and User-Flow Plan

| Field | Value |
| --- | --- |
| Status | Target experience specification for V1 Market Release |
| Date | 2026-08-13 |
| Product authority | `docs/product/djay-bots-v1-market-release-prd.md` |
| Architecture authority | `docs/architecture/djay-bots-v1-market-release-architecture.md` |
| Experience contract | `docs/design/djay-bots-approved-experience-contract.md` |
| Approved visual reference | `docs/design/djay-bot-text-voice-configuration-flow.html` |
| Primary audiences | Prospects, subscribed businesses, their customers, and DJAI operators |
| Primary locales | Thai and English |
| Primary business timezone | Asia/Bangkok |

## 1. Purpose

This document defines how DJay Bots works as a complete SaaS business, not merely how individual screens look. It covers:

- How an unsubscribed business evaluates, registers, subscribes, pays, and resumes an interrupted purchase.
- What a business sees immediately after payment and what remains blocked while payment is processing.
- How each product is configured, tested, deployed, and operated.
- How combined Flow, AI Text, and AI Voice subscriptions coexist in one workspace.
- How DJAI staff manage catalogue, tenants, billing, finance, provider health, release gates, incidents, and support access.
- How website visitors experience text/Flow/Voice widgets after installation.
- How Flow and AI agents behave in LINE OA, Messenger, and later supported social channels.
- How inbound telephone Voice experiences start, disclose AI use, route, transfer, complete, and fail safely.

The design preserves the existing security rules, realm separation, RLS, fail-closed data behavior, safe mutations, support-access disclosure, and server-derived readiness evidence.

## 2. Experience outcomes

### 2.1 Prospect outcomes

- Understand the difference between Flow, AI Text, and AI Voice without learning internal technology.
- Compare Starter and Advanced using price, included usage, channels, operational needs, and likely business outcome.
- See the exact first-year amount, regular renewal, annual billing term, overage terms, exclusions, and setup-service options before paying.
- Create an account without being forced to pay, then return to the selected package later.
- Trust that checkout and activation status are accurate even after a closed tab, delayed webhook, or failed payment.

### 2.2 Subscribed-business outcomes

- Know what was purchased, what is available now, and the shortest path to a working bot.
- Finish configuration through a product-specific checklist rather than a generic engineering console.
- Test the exact published behavior before exposing it to customers.
- Deploy with channel-specific verification and know whether the bot is actually reachable.
- Operate conversations, leads, handovers, usage, integrations, and billing without returning to onboarding screens.
- Understand limits early enough to avoid service interruption or unexpected charges.

### 2.3 End-customer outcomes

- Immediately understand whether the experience is text, guided Flow, or voice.
- Use it comfortably on mobile and desktop in Thai or English.
- Receive predictable controls, honest AI/action status, and a clear path to a human.
- Resume or exit without losing already submitted information.
- Know when audio/transcription, personal details, or third-party actions are involved.

### 2.4 DJAI operational outcomes

- Distinguish acquisition, payment, activation, configuration, deployment, usage, support, and incident problems.
- Change catalogue availability prospectively without corrupting existing contracts.
- Support a merchant without impersonation or unlogged access.
- Reconcile Stripe, usage, invoices, credit notes, FlowAccount, provider cost, and customer entitlement.
- Stop one capability, provider route, tenant, bot, or channel without taking unrelated products offline.

## 3. Experience principles

1. **State before action.** Every screen must clearly communicate current authoritative state before offering a mutation.
2. **One primary job per view.** Dense operational information is appropriate, but unrelated setup tasks must not compete in one long page.
3. **State is evidence; quality remains the merchant's decision.** Server-observed facts control access, publication integrity, deployment and external actions. `Needs attention`, `Not reviewed` and `Not tested` are advisory and never forced checklist gates.
4. **Commercial truth everywhere.** Public pricing, checkout, workspace entitlements, usage, invoices, and support see the same catalogue contract.
5. **Separate setup from operations.** Onboarding helps launch; the regular workspace helps run the business.
6. **Preview is not production.** Draft preview, published test, and live deployment are visually and technically distinct.
7. **Channel-native behavior.** Website, social, and telephone share business rules but use controls natural to each channel.
8. **Human handover is a workflow.** It includes routing, ownership, context, response, resolution, and fallback, not a single button.
9. **Cost is visible before consumption.** Usage and cap implications appear where a billable capability is enabled or expanded.
10. **Failure never looks empty or successful.** Unknown data is unavailable, not zero; pending action is pending, not complete.
11. **Provider details stay internal.** Merchant and end-customer surfaces use DJay Bots capability language.
12. **Do not overwhelm the SME.** Default paths ask only decisions needed for launch; advanced controls remain available in clearly named sections.

## 4. Realms and identities

| Realm | Users | Authentication | Information boundary |
| --- | --- | --- | --- |
| Public product site | Anonymous visitor or signed-in global user | Optional until registration/checkout | Public catalogue, legal, status, account and purchase entry only |
| Tenant workspace | Business owner, admin, operator, analyst | Tenant session and role | Selected tenant's products, customers, usage, billing and settings |
| Platform Master | DJAI owner, finance, AI operations, support | Separate platform session, MFA/recent auth | Cross-tenant operations authorized by platform role |
| Website widgets | Anonymous/known business customer | Short-lived deployment/session identity | One deployment, bot, conversation and allowed host origin |
| Social/telephone | External channel customer | Provider-verified event/call identity | One tenant connection/number and resolved conversation |

Tenant and Platform navigation, cookies, permissions, vocabulary, and visual danger states remain separate. A DJAI operator must never enter a tenant workspace through a normal merchant session as part of support.

## 5. Business lifecycle state model

The UI must derive its calls to action from authoritative lifecycle state. The state model is additive: account, commerce, product access, configuration, deployment, and health are separate dimensions.

### 5.1 Account states

| State | Meaning | Primary UI action |
| --- | --- | --- |
| Anonymous | No authenticated identity | Compare packages or sign in |
| Registration pending | Account submitted; email unverified | Verify email or resend |
| Verified, no workspace | Identity valid; provisioning incomplete/failed | Retry or contact support; do not recreate blindly |
| Workspace owner, unsubscribed | Workspace exists with no active product contract | Choose a product |
| Workspace member | Invited/accepted into one or more workspaces | Choose workspace and perform role-allowed work |
| Suspended/closed | Access restricted by policy or lifecycle | Show reason category, retained rights, billing/support path |

### 5.2 Commerce states

| State | Customer-facing meaning | Allowed behavior |
| --- | --- | --- |
| No checkout | Nothing selected or saved selection only | Browse and start checkout |
| Checkout open | Stripe session valid | Resume checkout; prevent duplicate active session |
| Checkout expired/abandoned | No payment confirmed | Start a fresh checkout from preserved selection |
| Payment processing | Provider accepted but local active state not final | Show processing, refresh automatically with backoff, no false access |
| Active | Paid/service policy grants access | Configure and operate |
| Past due/grace | Payment failed; grace policy active | Keep disclosed access, update payment method prominently |
| Restricted | Grace ended or policy block | Read/export/billing as policy allows; stop new runtime allocations |
| Cancel scheduled | Renewal off, paid term active | Show access end date and resume option |
| Ended | Entitlement term ended | Read/export/renew within retention policy |

### 5.3 Per-product lifecycle

```text
not_subscribed
 -> checkout_processing
 -> entitled_unconfigured
 -> draft_in_progress
 -> published
 -> deployed_verification_pending
 -> live_healthy
 -> live_attention
 -> paused_or_entitlement_restricted
 -> ended_retained
```

Each subscribed family has its own lifecycle. A tenant can have Flow live, AI Text still onboarding, and Voice temporarily paused. The Overview must never collapse these into one global “ready” state.

## 6. Information architecture

### 6.1 Public site

```text
/
  Product chooser and package comparison
/flow-bot
/ai-text-bot
/ai-voice-bot
/pricing
/setup-services
/enterprise
/checkout/return
/login
/register
/verify-email
/invitations/accept
/terms
/privacy
/status
```

The first screen is the approved business-outcome landing page. It presents all three families and leads to `/pricing`; it does not contain registration. Pricing then keeps all families visible and owns family, package and subscribe/trial selection. Exact prices and renewal are one clear action from Landing, not buried behind a campaign funnel.

### 6.2 Tenant workspace

Recommended desktop navigation groups:

```text
Overview

Products
  Flow Bots
  AI Text Bots
  AI Voice Bots

Customers
  Inbox
  Leads
  Contacts
  Appointments and callbacks

Content and connections
  Knowledge
  Channels
  Integrations

Insights
  Analytics
  Usage and costs

Workspace settings
  Team and roles
  Billing and invoices
  Brand and widgets
  Data and privacy
  Security
```

Navigation is entitlement- and role-aware. A non-subscribed product may appear only as a clearly labeled “Explore” destination for owners/billing managers, never as a broken operational page. Operators and analysts should not see purchase controls they cannot use.

Inside the approved current-product merchant dashboard, the compact navigation is:

```text
Operate
  Overview
  Conversations
  Contacts
  Leads and follow-up
  Appointments
  Analytics

Your bot
  Configuration
  Usage and plan
```

Configuration opens the full-page Studio; it is not an inline dashboard panel. The global workspace may later add Billing, Team, Connections, Data and Security without changing this current-product operating path.

On mobile, use a stable top bar with workspace switcher and a drawer/bottom destination mechanism. Do not compress the desktop sidebar until labels become unreadable.

### 6.3 Product workspace pattern

Each product uses a dashboard-to-Studio relationship:

```text
Merchant dashboard
  Operations pages
  Configuration -> full-page product Studio
  Usage and plan

Product Studio
  Dashboard return
  Role/template-specific section navigation
  Main editable task surface
  Expandable edit/test panel
  Publish/install release section
```

The selected bot/agent persists across these views. The header shows name, product/role or template, plan/lifecycle, published version, save state and relevant actions. The dashboard is reachable even while `Not configured`; the Studio is reachable again from every dashboard page.

### 6.4 Platform Master

```text
Command center
Tenants
Subscriptions
Catalogue and promotions
Usage, packs and overages
Invoices, credits and accounting
Providers and channels
AI routing and quality
Voice and telephony
Jobs, webhooks and dead letters
Support access and cases
Release readiness
Security and audit
System configuration
```

Platform Master must move from one long anchor page to route-based operational workspaces. Each queue supports filters, saved views, detail drawers/pages, assignment, evidence, permitted action, and audit history. Cross-tenant PII is minimized in list views.

## 7. Public acquisition and subscription journey

### 7.1 Entry and package discovery

The landing page introduces Flow Bot, AI Text Bot and AI Voice Bot together, explains the merchant/customer outcome, and routes the prospect to Packages. The Packages page keeps all three family tabs visible. The visitor chooses the bot family first, then Starter or Advanced. Business-goal and role questions do not appear before that commercial choice.

Each family view shows:

- Literal product name and short outcome statement.
- Starter and Advanced in one scannable comparison.
- First-year annual amount, regular annual renewal, saving, and informational monthly equivalent.
- Included bots/agents, channels, usage, admins, integrations, branding, and overage.
- Third-party exclusions directly beside channel/telephone claims.
- Optional setup services separated from subscription inclusions.
- “Choose [package]” and “Talk to DJAI” actions.
- An eligible `Start 30-day free trial` action for Flow Bot and AI Text Bot; Voice remains subscription-only.

Do not default-select the most expensive plan or use visual tricks that obscure renewal price. “Recommended” may be used only when driven by stated needs or an approved general recommendation with clear reasoning.

### 7.2 Package comparison interaction

- Tabs switch Flow/Text/Voice families; a second segmented control switches concise/full comparison.
- Sticky comparison header on long desktop tables; stacked feature groups on mobile.
- Differences are grouped by Capacity, Channels, Conversation behavior, Lead operations, Integrations, Analytics, Team/support, and Costs.
- Exact offer terms come from the active catalogue API; public copy does not maintain a separate price constant.
- Unavailable catalogue state preserves descriptive product content but disables checkout and identifies retry/contact paths.

### 7.3 Deployment-time registration strategy

The self-service acquisition journey has one account boundary: `Deploy Bot`. A prospect chooses a package or eligible trial, completes the product-specific onboarding, edits and tests the configuration, and publishes an anonymous draft before registration or sign-in is requested. Direct registration is not a parallel customer journey.

When the prospect presses `Deploy Bot`, preserve the package/trial selection and complete anonymous draft in an opaque server-side deployment intent across registration, email verification, sign-in, checkout interruption, and return. Do not place a trusted plan, price, promotion, configuration, or tenant identifier in an editable browser parameter. Invitation acceptance remains a separate team-access journey and must not create a second owner onboarding flow.

Registration asks only name, work email, business name, password/confirmation, preferred UI language, timezone confirmation, and current legal acceptance. Detailed business profile belongs in onboarding.

### 7.4 Deployment-pending workspace experience

After deployment-time verification and workspace provisioning, an unsubscribed owner resumes the preserved deployment and can enter a real workspace, not an empty dashboard or a different setup wizard.

The Overview shows:

- “Finish deploying your configured Bot” as the primary task.
- The preserved selected package and configuration, with exact price and renewal.
- Links to compare all packages and professional setup.
- Workspace profile and security steps that can be completed before purchase.
- No usage charts filled with zeros and no launch checklist pretending product work has begun.

The owner may invite a billing manager/admin only according to the pre-subscription seat policy; expensive provider resources, bot publication, live channel connections, and customer-data ingestion are not allocated before active entitlement.

### 7.5 Checkout

The checkout-review screen before Stripe shows:

- Business/workspace being charged.
- Product family and Starter/Advanced package.
- First 12-month charge and exact renewal amount/date basis.
- Included monthly allowance and overage/pack options.
- Add-ons selected, each billing cadence and proration behavior.
- VAT/tax presentation, billing contact, legal business details, and exclusions.
- Promotion terms and cancellation/refund links.

The browser then requests a server-created Checkout Session and redirects to Stripe. Disable repeated submission while the request is pending, but provide a safe retry after an unknown network result by resolving the existing checkout intent first.

### 7.6 Checkout return and abandoned checkout

The return page never assumes success from its URL. It polls/reloads local checkout status and renders:

- **Processing:** payment is being confirmed; safe to close; email will follow.
- **Active:** show receipt/term and continue to product onboarding.
- **Action required:** return to Stripe/update payment without creating duplicate entitlement.
- **Expired/canceled:** no charge confirmed; selection preserved; start new checkout.
- **Unavailable:** cannot verify; do not retry payment blindly; status/support path.

An abandoned checkout appears on workspace Overview as “Finish checkout” until expired. Expired sessions are replaced server-side. Email reminders require consent/commercial policy and stop immediately after payment/cancel/expiry.

### 7.7 Trial selection and activation

The same package page exposes approved trials without merging them into paid checkout:

| Product | Trial presentation |
| --- | --- |
| Flow Bot | 30 fixed days, Starter settings, website only, 5,000 conversations, no card |
| AI Text Bot | 30 fixed days, Starter settings, website only, 500 AI replies, card required, owner warning in platform and email at 100 replies remaining |
| AI Voice Bot | Subscription only |

The deployment-time account page repeats the selected trial terms before activation. Trial time starts when deployment provisioning succeeds, not when the visitor opens Pricing, starts configuration, publishes a draft, or creates an account. Exhaustion or expiry stops new trial service and shows a paid-plan action. The UI must not promise automatic paid conversion because that policy is not approved.

## 8. First session after deployment-time account creation

### 8.1 Subscription success landing

After authoritative activation, the owner sees:

- Package and access-active confirmation.
- Paid term and regular renewal amount/date.
- Included allowance and current safety-cap/overage mode.
- Invoice/receipt status.
- The already completed product configuration and its pending deployment state; never restart product onboarding.
- Choice between self-service and purchased/requested professional setup.

Do not send the customer into a different builder. The primary action is “Continue deployment”. Secondary actions are return to Configuration, view billing, or deploy later.

### 8.2 Onboarding shell

The product-specific onboarding before Studio is intentionally short. It uses a visible current-step header/progress indicator, back/continue without data loss, and one primary decision per page. Flow has three pages; Text and Voice each have four. The full Configuration Studio then uses a narrow left section navigator on desktop and a current-section drawer on mobile. Each configuration section has:

- One outcome-oriented title.
- Current authoritative status.
- Required fields first; advanced settings collapsed into named groups.
- Save-and-exit.
- Back and continue without losing valid draft data.
- An expandable right-side preview/test where meaningful.
- Error summary linked to fields.
- “Get setup help” that creates a scoped support/professional-services request.

The Studio navigation is the sole configuration guide; do not add a second readiness panel that repeats it. Users can open, skip, revisit, save and publish from any section. Server evidence controls actual entitlements, safe external actions, version integrity, origin verification and live state. Advisory quality/review/test statuses never force completion.

### 8.3 Shared prerequisite steps

1. **Business profile:** legal/display name, industry, website, contact information, timezone, default language, business hours.
2. **Lead destination:** notification recipients, inbox ownership, handover availability, callback expectation.
3. **Privacy and disclosure:** privacy URL, consent wording, retention, AI/transcription disclosure as applicable.
4. **Usage protection:** threshold recipients, overage opt-in, pack, safety cap, and fallback behavior.

If multiple products are purchased, shared steps are completed once and referenced by each product. Product-specific readiness still remains independent.

## 9. Flow Bot onboarding

### 9.1 Flow Starter path

1. **Choose a starting journey.** Select and preview FAQ and contact, Capture leads, Appointment request, Product or service guide, Support routing, or Start from blank. The chosen template is copied into a fully editable tenant draft.
2. **Set identity and website experience.** Edit bot name, default language, English/Thai greetings, brand colour, launcher position, business hours, handover contact and privacy URL while seeing the widget preview.
3. **Choose the next workspace.** The prepared summary shows template, name and editable-step count, then offers Open Dashboard or Open Flow Studio.
4. **Configure in Flow Studio.** Use Bot identity, Flow map, Lead capture, Fallback and handover, Widget appearance, and Publish/install sections in any order.
5. **Test optionally.** The expandable right panel can start from the entry or selected step and exercise buttons, forms, typed keywords, language and fallback without billable usage or external effects.
6. **Publish explicitly.** Advisory warnings and unrun tests do not block publication. Broken entry/references, duplicate IDs, empty option lists/forms, entitlement, safety and security invariants do.
7. **Install and launch separately.** Copy snippet, enter/verify the HTTPS origin, explicitly Go live, and then enter the dashboard. Publication never silently installs or activates traffic.

### 9.2 Flow Advanced additions

- Bot/department selection up to plan limit.
- Rich video, carousel, menus/categories, advanced conditions, tags and attributes.
- Business hours and department-routing setup.
- Quotation, appointment, booking, and order-enquiry templates.
- Google Sheets, signed webhook, or basic API connection wizard with test result.
- Social channel choice after the same Flow is working in channel preview.
- Channel capability preview shows exact fallbacks before activation.
- Advanced analytics goals: topic completion, CTA/lead outcome, unanswered input, and journey drop-off.

### 9.3 Flow builder interaction model

- Left: direct Dashboard route followed by Bot identity, Flow map, Lead capture, Fallback and handover, Widget appearance, and Publish/install. Status is advisory except for true invalid state.
- Center: stable graph/canvas with message add, select, drag, duplicate, remove, entry selection, fit/scroll, connections, keyboard alternative and validation markers. Removing a message disconnects incoming paths and leaves them visibly repairable.
- Right: Edit selected message and Test flow tabs. The editor describes what the customer can do next, supports message, reply choice, input, form, card, handover and end behavior, and keeps localized reply text, destination selectors and canvas connectors synchronized.
- Normal customer testing always starts at the configured entry message. Starting from a selected message is a separate explicit debugging action. Reply selection follows the exact saved destination and exposes disconnected or missing destinations as repairable errors instead of failing silently.
- Mobile right panel: focused sheet/panel with Return to canvas; it never traps the user away from the map.
- Top bar: draft/version context, autosave state, Dashboard, Undo, Redo and reset/controlled recovery. Publication remains a separate release section/action.
- Version conflict opens a compare/reload flow and never silently overwrites another editor.
- JSON is an advanced import/export/repair surface, not the primary authoring experience.

## 10. AI Text onboarding

### 10.1 AI Text Starter path

1. **Choose role after product/package selection.** Customer Support, Sales Associate, or Appointment Booking. Sales can still book appointments after discovery/objection handling.
2. **Supply business information.** Enter an authorized public website URL or describe the business manually.
3. **Watch truthful preparation progress.** Show public-page validation, reading, fact extraction, role organization and draft preparation; never reveal/fabricate chain-of-thought. Partial crawl offers retry, accessible pages, or manual entry.
4. **Edit the generated draft.** Business name/type/summary/offers/hours/contact, three agent-behavior fields, source/exclusion context, and every FAQ are editable/addable/removable.
5. **Configure in the role-specific full-page Studio.** Use the shared business/knowledge foundation plus Support, Sales or Booking sections and Text experience controls.
6. **Test optionally.** Suggested/custom Thai/English tests and the persistent right tester show response/evidence with no production action. The model is instructed to answer concisely and every customer response is validated to at most 200 locale-aware words; an oversized candidate receives one preserving rewrite attempt and is never cut at the boundary.
7. **Publish, install and launch separately.** Publish with advisory warnings if desired, then snippet, HTTPS origin verification, explicit Go live, and Enter Dashboard.

### 10.2 AI Text Advanced additions

- Up to three agents/brands/departments with a clear agent switcher.
- Knowledge collections and structured product/service catalogue mapping.
- Validated additional-language selection; unsupported languages do not appear.
- Qualification fields, segment/tag rules, lead score setup, department routing.
- Booking/quotation/checkout actions and one CRM/Sheets/webhook integration.
- One included social connection setup, channel preview, identity/routing policy, business hours and human handover.
- Review screen for summary policy, knowledge gaps, question/intent analytics, and monthly knowledge review ownership.

### 10.3 Knowledge UX

The Knowledge library is shared but clearly shows which agents use each published revision.

Source rows show name, kind, locale, last import, status, pages/items, active revision, and attention reason. Detail shows extracted content/source references, exclusions, reprocess history, bot bindings, and delete impact. Publishing a knowledge revision shows which live bots will change and requires an owner/admin confirmation.

Upload and crawl progress survives navigation. A failed file/page does not make successful sources appear failed. The UI must never show “Ready” before retrieval index publication completes.

### 10.4 Shared role-specific Studio structure

The selected role changes the left navigation and the configuration form, not just a label:

| Role | Required section order after shared Business profile and identity |
| --- | --- |
| Customer Support | Support knowledge and FAQs -> Issue handling behavior -> Customer details and handover -> Text/Voice experience -> Test your bot -> Publish/install |
| Sales Associate | Products, services and FAQs -> Sales behavior and objections -> Leads and appointments -> Human handover -> Text/Voice experience -> Test your bot -> Publish/install |
| Appointment Booking | Services and FAQs -> Booking behavior and rules -> Availability and customer details -> Changes, fallback and handover -> Text/Voice experience -> Test your bot -> Publish/install |

Support uses Identify issue -> Collect context -> Check policy -> Guide resolution -> Confirm or escalate. Sales uses Discover need -> Qualify fit -> Recommend -> Handle objection -> Book or hand over. Booking uses Choose service -> Collect details -> Check availability -> Confirm summary -> Create appointment.

Every Studio keeps the right tester expandable while the merchant edits. `Not reviewed`, `Needs attention`, and `Not tested` link back to the relevant section but never disable Publish. The publish review distinguishes advisory warnings from real blockers and confirms that publication creates an immutable version without installation or traffic activation.

## 11. AI Voice onboarding

### 11.1 Voice Starter path

1. Follow the same post-package Role -> Website/manual source -> truthful processing -> editable generated-review sequence as AI Text.
2. Enter the role-specific full-page Studio using Support, Sales or Booking configuration.
3. Configure the distinct Voice layer: approved provider-neutral voice label, speaking speed, interruption, silence, readback, maximum duration, disclosure, low-confidence/misunderstanding recovery, transfer fallback and recording consent.
4. Run optional Thai/English voice quality tests for interruption, silence, contact capture, end call and transcript/summary. The visual design demo simulates voice without requesting a microphone; production requests it only after explicit start.
5. Prompt for short spoken delivery and validate written response content to no more than 200 locale-aware words before speech. Rewrite one oversized candidate while preserving its structured decision; never truncate it at the boundary.
6. Publish, install, verify and explicitly activate the website deployment as separate actions, then enter Dashboard.

### 11.2 Voice Advanced additions

- Up to three agents/departments and two-session concurrency visibility.
- Additional validated languages.
- Inbound telephone provider/number setup, number status, operating hours, test call.
- Appointment availability and confirmed scheduling action.
- Live human and department transfer destinations, warm-context policy, timeout and callback fallback.
- CRM, Sheets, and webhook integrations.
- Outcome, intent/objection, sentiment-indicator and advanced reporting setup.
- Carrier-cost disclosure and separate carrier/number status from DJay Bots connected minutes.

### 11.3 Voice launch safety

Voice cannot activate until disclosure, maximum call duration, usage cap/fallback, end-call behavior, and deployment/number health are verified. Suggested quality-test completion remains advisory unless a separately approved legal/safety gate explicitly makes a named test mandatory. If Advanced provider admission is globally paused, the merchant sees “Voice launch temporarily unavailable” with saved setup intact, never provider/model names or a silent downgrade.

## 12. Combined-product onboarding

A tenant buying more than one family receives a portfolio setup page:

| Product | Access | Configure | Current-version test | Deployment | Live health |
| --- | --- | --- | --- | --- | --- |
| Flow Bot | Active | In progress | Not started | None | Not live |
| AI Text | Active | Complete | Complete | Website active | Healthy |
| AI Voice | Processing | Not available | Not available | None | Waiting for access |

Shared prerequisites appear once. The owner chooses which product to launch first. The system may recommend the shortest path based on existing evidence but must not require all products to be ready before one can go live.

When products share knowledge, contacts, handover teams, or integrations, the UI shows those relationships and the impact of editing/deleting them. Cross-product resource reuse does not merge usage meters or product lifecycle states.

## 13. Post-onboarding tenant experience

Dashboard is available before onboarding/configuration completion. The Configuration tab is highlighted as `Not configured`; the top status says configuration is not published; and the merchant can open the relevant full-page Studio. Dashboard and Studio always provide a direct route to each other.

### 13.1 Overview command center

The regular Overview is not the onboarding wizard. It shows:

- Product lifecycle strip for every subscribed family.
- Today/last 7 days: conversations, leads, handovers needing action, appointments/callbacks, and integration failures.
- Usage risk: meter percentage, forecast, reset, cap and overage estimate.
- Operational attention queue ordered by customer/business impact.
- Recent activity and publication/deployment changes.
- Primary action determined by state: finish setup, review handovers, resolve channel, add usage protection, or view performance.

Do not fill the page with decorative cards. Use compact summary bands, tables, and one attention list suitable for repeated daily use.

### 13.2 Inbox

Three-column desktop model: filters/conversation list, conversation timeline, customer/context panel. On mobile, each becomes a routed view with a stable back path.

Filters: assigned to me/unassigned, needs human, product, channel, status, department, language, outcome, date. Conversation list shows customer label, last message/outcome, channel/product icon, assignment, unread/attention and age.

Timeline renders canonical rich content, transcript/voice summary, bot/human/system actors, delivery state, actions and handover. The context panel shows contact, lead, qualification, tags, score, appointment/callback, consent, source and assignment.

Agent actions: accept/assign, reply where channel window permits, add note, update lead/outcome, schedule callback, resolve/reopen, return to bot if safe. Closed social reply windows disable reply and explain the allowed next action; they do not fail after typing.

For the approved website live-takeover path, the action is available only while the latest committed bot response is less than five minutes old. At exactly five minutes or later, direct takeover is replaced by saved-contact/follow-up. The server revalidates timestamp, tenant, permission and current owner atomically. Human takeover pauses automation; return to Flow restarts at its main menu, while return to Text/Voice starts a safe AI continuation boundary.

### 13.3 Leads and contacts

Leads use a table/board toggle with stages, score, source, product/channel, owner, last activity and next action. Stage changes are explicit, audited, keyboard accessible and reversible according to policy. Contacts show identities, consent, conversation/lead history, summaries, tags and possible duplicate suggestions. The platform never auto-merges contacts.

### 13.4 Appointments and callbacks

Unified queue/calendar for request-only and confirmed appointments. Clearly distinguish requested, pending confirmation, confirmed, rescheduled, canceled, failed sync, callback due, and completed. External calendar/booking truth and local state are reconciled; unknown outcomes are never shown as confirmed.

### 13.5 Analytics

Analytics defaults to business questions, not system counters:

- Are customers completing journeys?
- Which questions are unanswered?
- Which conversations become leads/bookings?
- Where do handovers fail or wait too long?
- Which channel, bot, topic, language, or CTA performs best?
- Is knowledge current and well covered?

Every chart/table shows period, timezone, filters, data freshness and comparable denominator. Advanced detail appears only with entitlement; locked marketing tiles do not dominate the operational page.

## 14. Usage, billing, and account UX

### 14.1 Usage and costs

One page contains separate meter sections per subscribed product. Each shows included amount, used, remaining, packs, forecast, projected overage, reset date, alerts, cap, recent event summary and reconciliation freshness.

Enabling overage requires a billing-authorized user, clear unit rate, estimated scenarios, hard-cap choice and explicit confirmation. Purchasing a pack shows quantity, price, validity/consumption policy and payment result. A hard-cap change that can increase cost requires recent authentication and audit.

### 14.2 Billing

Billing shows:

- Each active/scheduled/ended family subscription.
- Package, first-term/renewal contract, next invoice/renewal, payment state.
- Add-ons and packs with cadence/status.
- Billing entity/tax details.
- Invoices, receipts, credit notes, refunds/disputes.
- Customer Portal entry and plan change/cancel actions.

Upgrade compares incremental entitlement, effective date, proration/charge and next renewal. Downgrade runs preflight and lists resources that would become disabled/read-only. Cancellation states service end and data retention/export dates before confirmation.

### 14.3 Seat and workspace economics

Team management shows included administrators, used seats, invited seats, add-on seats and role meaning. Inviting beyond the entitlement offers an authorized add-on purchase; it does not create an unusable invitation. Additional workspace purchase is separate and makes its scope/starting-price quotation clear.

### 14.4 Professional setup service journey

Professional setup is a separate service workflow, not an entitlement toggle:

1. Customer chooses a published starting service or requests a complex quotation from the relevant onboarding/product context.
2. Request captures product, desired outcome, current content/connections, target date, contact and consent to review submitted business material.
3. DJAI returns a scoped quotation/SOW identifying inclusions, exclusions, customer inputs, milestones, price, payment terms and acceptance criteria.
4. Accepted/paid work creates a service engagement visible in the workspace with owner, status, next customer/DJAI action, target dates and secure input exchange.
5. Any DJAI tenant access uses a separately approved, time-limited support/professional-services grant and shows the workspace disclosure banner.
6. Draft work is demonstrated in preview/test; the customer approves publication/launch unless the SOW explicitly authorizes DJAI to perform that command.
7. Completion records deliverables, current published/deployed versions, test evidence, acceptance, remaining issues and ownership handoff.

The subscription continues to show self-service availability. Purchasing setup must not imply that future content, optimization, provider fees or custom changes are permanently included.

## 15. Website widget experience

### 15.1 Host-site integration model

The customer installs one versioned DJay Bots loader with a public deployment key. The loader verifies host origin through the API and fetches a provider-neutral widget manifest. It creates an isolated widget surface so host CSS cannot break it and the widget cannot inspect arbitrary host content.

Installation UI provides:

- Copyable script snippet.
- Allowed origin input and verification.
- Position selector using corner icons, not text pills.
- Theme controls with accessible color swatches, logo/avatar, greeting and launcher label.
- Desktop/mobile preview against light and dark sample pages.
- Automated install check and open-real-site test.
- Conflict warning if another DJay Bots launcher is already installed.

### 15.2 Multiple products on one website

Do not render three competing floating launchers. The merchant chooses one of:

1. One primary launcher opening a mode chooser for available Flow/Text/Voice experiences.
2. One primary bot with an in-conversation action to switch/escalate to another modality.
3. Explicit inline launch buttons placed by the merchant for secondary experiences.

The mode chooser uses familiar message/microphone icons plus names and indicates when Voice is unavailable. Switching modes preserves consented contact/context through server-side conversation links, but each product meter and transcript remains distinct.

### 15.3 Shared launcher/panel behavior

- Fixed 44px minimum launcher with accessible name; merchant may choose left/right bottom position and safe offsets.
- Panel is non-modal on desktop and near/full-screen sheet on small mobile, respecting safe areas and on-screen keyboards.
- Stable dimensions prevent content/buttons/status from shifting surrounding controls.
- First open shows bot identity, business identity, privacy link and relevant AI/recording disclosure without a blocking wall of text.
- Minimize preserves conversation/draft. Close ends UI presence but does not falsely close an active handover/call.
- Reopen restores durable conversation where retention/session policy allows.
- Unread badge appears only for a real unseen response.
- Offline/unavailable states show business-approved fallback CTA, not an infinite spinner.
- Branding follows entitlement and must never obscure the merchant's identity.

### 15.4 Flow widget behavior

1. Open with welcome message and top-level buttons/menu.
2. Customer chooses or types an allowed response.
3. Render text/media/cards/buttons/forms in message order.
4. Disable a submitted button/form while its idempotent event is resolving; restore safely on transport failure.
5. Show validation next to the affected field and preserve other answers.
6. External checkout/booking/site/call/LINE actions identify that they leave/open another application.
7. Handover shows requested/queued/connected/unavailable status and fallback.
8. Completion offers approved next actions and a restart-new-topic option without erasing history.

Unknown free text follows the configured fallback/clarification path and feeds unanswered-input reporting. It must not silently invoke AI.

### 15.5 AI Text widget behavior

1. Open with greeting, language state and suggested questions/CTAs.
2. Customer types natural language; composer remains usable unless a turn/action is actively constrained.
3. Show sending/response progress without fake typing claims. Stream only if durable ordering/recovery remains correct.
4. Render grounded response and typed CTA/cards. Source links appear only where the tenant allows and are safe destinations.
5. Low confidence or refusal produces the configured clarification/handover response.
6. A proposed booking, checkout, CRM or other external action requires confirmation when policy says so and displays pending/succeeded/failed honestly.
7. Capture contact details conversationally or through a compact form; do not ask again when verified context already exists unless correction is needed.
8. Allow human handover with transcript context and clear bot/human actor state.

Rate/usage/cap exhaustion uses a business-approved fallback: Flow path, contact form, LINE/call link, or human handover if available. It must not mention OpenAI, tokens, models, or internal quota codes.

### 15.6 Voice widget behavior

Pre-call state shows agent/business identity, language, privacy/transcription disclosure, microphone requirement, and start call. The browser asks microphone permission only after explicit Start.

Active call has stable controls: end, mute/unmute, current listening/speaking/connecting state, elapsed connected time, optional live transcript toggle, and handover state. Interruption is natural; no separate “interrupt” control. Avoid visual audio decoration that conveys false certainty.

States:

- Requesting microphone permission.
- Connecting.
- Listening.
- Agent speaking.
- Customer interrupted agent.
- Reconnecting with bounded timer.
- Scheduling/action pending.
- Transfer pending/connected/failed.
- Usage/time warning.
- Ended with outcome/next action.

Denied microphone offers browser-specific neutral guidance and text/call alternatives. Abrupt disconnect finalizes usage server-side and offers resume only when valid. Voice capacity/cap/provider unavailability appears before microphone allocation when known.

## 16. Social messaging experience

### 16.1 Connection setup for merchant

The channel wizard:

1. Select eligible bot/agent.
2. Select included or paid channel slot.
3. Authenticate/connect the business account using the provider-approved flow.
4. Confirm external account/page/OA identity and required scopes.
5. Choose greeting, language, business hours, handover team and reply-window fallback.
6. Preview canonical content with channel-specific limitations/fallbacks.
7. Send a provider test message and verify inbound and outbound delivery.
8. Activate and show health/reauthorization status.

Credentials are never displayed after connection. Disconnect shows effects on active conversations and preserves history.

Step 3 ("the provider-approved flow") resolves to one of three acquisition modes. Full design: `docs/superpowers/specs/2026-07-26-omnichannel-onboarding-design.md`.

#### 16.1.1 Meta — Messenger, Instagram, WhatsApp (`oauth_provider`)

Merchant actions: **two clicks and a picker. No credentials handled.**

1. **Connect channel** → choose Facebook, Instagram, or WhatsApp.
2. Facebook Login for Business consent — **one dialog covering all requested asset types**.
3. Asset picker lists Pages, Instagram Business accounts, and WhatsApp numbers with name and avatar. Tokens are staged encrypted server-side and never reach the browser.
4. Select → subscribe → connected, with health shown.

**Instagram empty-state is a designed screen, not an empty list.** When no Instagram assets are returned, show: *"No Instagram accounts found — your Instagram must be a Business account linked to this Page,"* with a link to the fix. This is the most common Instagram onboarding failure.

#### 16.1.2 LINE — assisted handoff (`assisted_handoff`, available today)

Two entry points render the **same wizard component**:
- `/workspace/{product}/connect/line` — authenticated, for self-serve merchants
- `/public/line-setup/{token}` — single-use, expiring, **no login**, so an operator can send it to whoever actually holds console access (often an agency or IT contact with no workspace account)

Merchant journey — **two copied values, ~2 minutes, no developer console**:

1. Wizard states the prerequisite up front: **Messaging API must be enabled on the OA**, and enabling it requires choosing a **Provider — a permanent, irreversible choice.** Warn before the merchant commits.
2. Thai step-by-step with screenshots: OA Manager → **Settings → Messaging API** → copy **Channel ID** and **Channel Secret**. This is the interface the merchant already uses; they never open `developers.line.biz` and never issue a token.
3. Paste the two fields. The platform then mints a token server-side (`client_credentials`), validates, creates the connection, sets the webhook, confirms it is enabled, and proves reachability with LINE's webhook test — all server-side.
4. Confirmation screen names the connected account (`displayName`, `basicId`, avatar) so the merchant can verify it is the right OA **before** committing.

An "advanced: paste a long-lived token" path stays available behind a link, for merchants whose situation requires it.

Every failure names the specific condition to change — invalid token, auto-reply still on, webhook disabled, LINE could not reach us (with HTTP status). Nothing is marked working until end-to-end reachability is proven.

#### 16.1.3 LINE — module attach (`partner_attach`, post-approval)

Identical in shape to 16.1.1: consent → OA picker → attached. The 16.1.2 wizard remains as fallback.

### 16.1A Operator connection surfaces

- **Connection health dashboard** (all tenants × channels): status, health, last inbound, last delivery, last error; default filter "needs attention" — reauthorization required, webhook inactive, `chatMode = chat`, or no inbound in N days.
- **Issue setup link**: tenant + bot + channel → single-use 72h link, with `pending` / `consumed` / `expired` state and revocation.
- **Support session**: time-boxed, reason-required, audited "act as tenant" grant that lands the operator in the *normal* studio using the *existing* UI — deliberately not a parallel operator-only write path.

### 16.2 Flow Bot in social chat

- Provider event maps to the deterministic Flow session and pinned revision.
- Buttons/quick replies, images, cards/carousels and menus use the channel-native representation where supported.
- Unsupported media/actions use pre-reviewed text/link fallback.
- Customer free text is matched only by configured input/fallback rules; it does not consume AI replies.
- Session/reply-window rules are visible to staff and enforced before reply composition.
- Human takeover stops bot responses for that conversation until release/resolution policy permits restart.

### 16.3 AI Text in social chat

- Natural-language behavior, grounding, typed actions and escalation match website policy.
- Responses adapt length and content format to channel limits.
- One customer-facing generated reply is metered once even if provider delivery retries.
- Delayed generation or channel delivery shows pending internally; the customer receives either the response or approved failure fallback, not duplicates.
- Customer identity remains channel-specific until the tenant reviews a contact match.

### 16.4 Human handover in social chat

Inbox receives channel, contact identity, transcript, bot/agent, collected fields, reason, department and reply-window deadline. Staff can accept/assign and reply only while provider policy permits. If the window closes, the UI disables the composer and offers approved template/contact/follow-up actions according to provider rules and tenant configuration.

### 16.5 Channel degradation

Reauthorization, provider outage, rate limit, invalid content, closed reply window, and delivery rejection have distinct internal states. Merchant alerts identify affected bot/channel and corrective action. The end customer receives only a safe channel-appropriate fallback when delivery is still possible.

## 17. Telephone Voice experience

### 17.0 Voice onboarding for the merchant

Voice is **website widget + telephony only** — never a social-messaging channel (`CHN-014`). The two setups differ sharply and must not share a wizard.

**Website voice** — the frictionless case. The merchant toggles voice on for an existing website deployment; the widget already carries the origin and deploy key. Prerequisites surfaced before enabling: HTTPS origin (microphone access requires it), an approved recording/transcription disclosure, and language/routing defaults. No credentials, no external console.

**Telephony** — the number is provisioned *by the operator*, never by the merchant. Merchant-facing steps are limited to what only they can decide:

1. Choose or confirm the assigned number (operator-provisioned; merchant sees inventory, not carrier APIs).
2. Confirm the recording/transcription disclosure text and consent policy for their jurisdiction.
3. Set business hours, language/routing policy, and human-transfer destinations with a fallback when transfer fails.
4. Place a **test call** and hear the opening disclosure — the voice equivalent of the green check; the connection is not "live" until this passes.

Number provisioning, carrier configuration, SIP/media bridging, and cost reconciliation are entirely operator-side and must never appear in merchant UI. Where a jurisdiction requires merchant-supplied documentation for number assignment, the wizard collects it as an upload with an explicit status ("submitted / approved / rejected + reason"), never as a silent block.

### 17.1 Inbound call flow

1. Carrier receives call on the tenant-assigned number.
2. Connection resolves tenant, number, agent, language/routing policy and admission capacity.
3. Opening identifies the business/AI agent and gives required recording/transcription disclosure.
4. Agent conducts the grounded conversation, qualification and verified actions.
5. Customer may request repetition, language change, human transfer, callback or end.
6. Live transfer packages context; failed transfer returns to callback/approved fallback.
7. Terminal state records connected time, transcript state, summary/outcome, carrier charge and customer usage separately.

### 17.2 Caller experience rules

- Opening is concise and does not front-load account/package language.
- DTMF fallback is available when required for consent/routing/accessibility.
- Silence and poor audio prompts are bounded; do not trap the caller in repeated loops.
- Never state a booking/transfer succeeded before verified result.
- Usage/platform limits must not terminate a call mid-sentence without a configured warning and safe end/transfer path, except security/emergency termination.
- Emergency or regulated requests receive approved limitations and appropriate human/emergency routing, not fabricated assistance.

## 18. DJAI Platform Master experience

### 18.1 Command center

Shows current customer impact and business risk, not only infrastructure metrics:

- Active/past-due/restricted subscriptions.
- Checkout/provisioning failures.
- Tenants blocked in onboarding or with unhealthy live deployments.
- Usage/cap anomalies and margin risk.
- Payment, invoice, credit and FlowAccount mismatches.
- AI/social/voice provider health and customer impact.
- Dead letters, oldest queue work and open incidents.
- Support cases and expiring access grants.
- Release readiness by package/environment.

### 18.2 Tenant 360

One tenant detail view contains:

- Identity, workspace, owner, contract and risk flags.
- Product lifecycle per family.
- Bots/agents/deployments/channels and health.
- Usage, forecast, packs, caps and cost.
- Billing, invoices, credits, accounting sync.
- Integrations and provider-safe health.
- Support cases/access grants and immutable audit.

Sensitive content is masked by default. Viewing permitted PII/transcript content requires purpose, tenant consent/grant where applicable, recent authentication and audit.

### 18.3 Catalogue and promotions

Draft catalogue editing is table/form based with validation and a side-by-side diff against active version. Activation requires effective date, complete Stripe mappings, price math, entitlement tests, public preview and independent approval. Existing contracts are shown as unaffected. There is no direct edit of an active version.

### 18.4 Subscription and checkout operations

Queues cover processing checkout, provisioning failed, provider/local mismatch, past due/grace, scheduled changes, cancellation, dispute/refund and orphan mapping. Each item shows evidence and only state-appropriate commands. Manual entitlement grants are time-bounded, reasoned and independently reviewed where risk requires.

### 18.5 Finance operations

Separate workspaces for invoices, credit notes, payments/refunds/disputes and FlowAccount reconciliation. Finalized documents are visibly immutable. Corrections start a credit/replacement workflow. Mismatch resolution records external evidence and never exposes direct SQL/edit controls.

### 18.6 Provider and release operations

AI routing, Voice admission, carrier/channel health and release gates remain restricted by role. Candidate/reviewer/canary/admission steps stay distinct. Provider/model identities never leak into tenant-facing screenshots, notification copy or support exports.

### 18.7 Support workflow

Support case contains tenant, reporter, severity, product/channel, customer impact, evidence, communications and status. A support-access request states scope, reason, duration and requested resources. Tenant approval or break-glass review creates a visible workspace banner. Expiry/revocation removes access automatically.

### 18.8 Owner analytics authority and navigation

The complete owner-analytics experience follows `docs/design/djay-bots-saas-owner-analytics-contract.md`. That contract controls page ownership, metric definitions, fields, filters, exports and privacy boundaries for this scope. Existing Platform Master panels are not a reduced alternative.

The persistent Platform Owner navigation separates Owner Overview, Merchants, Users, Subscriptions, Revenue, AI & Voice Usage, Models, Trials & Conversion, Reports & Alerts, Exports and Merchant 360. Operational release, recovery, finance reconciliation, provider controls, support and governance remain available as separate work areas.

Each analytics page has:

- global period, comparison, reporting-timezone and currency context where applicable;
- server-side filters represented in the URL;
- save-view and export actions where the role permits them;
- visible last refresh and reconciliation state;
- an accessible table alternative for charted data;
- explicit empty, delayed, unavailable, incomplete and zero states.

### 18.9 Owner Overview

Overview begins with merchant/subscription state, recurring revenue movement, collected/refunded value, Text/Voice variable cost and margin. The second band covers activation, trial conversion, deployment and usage. One prioritized attention queue covers expiry, renewal, cancellation, payment, quota, provider/model, deployment, support and incident risk.

Cards deep-link to a filtered source page. The UI never presents MRR, invoiced amount and cash collected as interchangeable. Metric tooltips use the exact approved definitions instead of marketing summaries.

The primary finance visualization follows the proven POS sales-trend interaction: a line chart headed `Net revenue`, a two-option `Daily` / `Monthly` segmented control, the current total and comparison, a point readout on pointer interaction, left/right keyboard traversal and a table disclosure containing the exact same values. `Net revenue` is the presentation label for approved `net_collected`, not statutory recognized revenue. The chart states selected currency, timezone, freshness and reconciliation; THB, USD and any other currency remain separate unless a future approved conversion policy applies. On mobile the chart scrolls horizontally without losing its axis or table alternative.

### 18.10 Merchant and user directories

Merchants and SaaS users are separate routes. Merchant rows represent businesses and subscriptions; user rows represent human identities and memberships. A user with access to several businesses expands into distinct membership rows/details without duplicating subscription revenue.

Both directories use a compact table with column selection, server search, combined filters, stable sorting and cursor pagination. Mobile uses a routed detail view rather than horizontally hiding identity, lifecycle or subscription facts. Filter chips show the complete active scope and can be cleared independently or together.

Merchant detail opens Merchant 360. User detail shows identity/security/legal state and a server-paginated membership table, then links to each permitted Merchant 360. For Platform Owner with recent assurance and a recorded purpose, the profile also shows the complete lawfully stored identity contact record: full name, primary email and verification state, telephone and personal contact or mailing address when supplied. Missing contact fields say `Not supplied`; they are not inferred. The page-size control includes 100 results per page. Columns show merchant name, company role, membership state, membership first-join date, merchant subscription start, merchant subscription expiry or access end, subscribed products and effective access. Membership dates and merchant-owned subscription dates remain visibly distinct. On mobile, contact details and each membership become complete stacked records without hiding any approved field. End-customer leads and conversation participants never appear in the SaaS user directory.

### 18.11 Subscriptions, revenue and trials

The Subscriptions page offers lifecycle table, timeline and cohort views. Date labels are unambiguous: created, provisioned/service start, trial start/end, original subscription start, current period start/end, renewal, scheduled cancellation, actual cancellation and service end are never collapsed into one `Date` column.

Revenue uses movement and reconciliation views. It separates invoiced, collected, refunded, credited, charged back and recurring measures and shows currency, denominator and completeness. Trials & Conversion follows the approved Flow/Text rules and never invents a Voice trial.

### 18.12 Text, Voice and model analytics

AI & Voice Usage defaults to commercial units first, then internal cost detail for authorized roles. Text shows committed replies separately from input/cached/output/reasoning tokens. Voice shows exact connected seconds separately from customer-facing billable minutes.

The Models page is absent for unauthorized roles. Owner/AI Operations views show provider/model route version, usage, latency, errors, fallback, quality status, incidents and snapshotted cost. Merchant-facing names and exports continue to hide provider/model identity.

### 18.13 Reports, alerts and exports

Saved reports preserve filters, columns, period, timezone, currency and schedule. Alert rows expose severity, affected merchant/product, authoritative trigger, owner, status and next action. Duplicate alerts group under one incident/state rather than producing notification noise.

Export begins with a scope review: data class, filters, columns, expected rows, personal/financial/provider-confidential indicators, exclusions, purpose and expiry. Large exports become jobs with progress and history. Download requires the approved assurance level; expiry is visible before creation. No UI offers password, credential, secret, raw payment-instrument, unrestricted end-customer content, transcript or recording columns.

## 19. Roles and task visibility

| Task | Owner | Admin | Operator | Analyst | Billing manager |
| --- | --- | --- | --- | --- | --- |
| Purchase/cancel/change package | Yes | Policy-controlled | No | No | Yes |
| Change tax/payment details | Yes | No by default | No | No | Yes |
| Create/publish bots | Yes | Yes | Limited operation | No | No |
| Connect channels/integrations | Yes | Yes | Health/reconnect if granted | No | No |
| Handle inbox/leads | Yes | Yes | Yes | Read-only | No |
| View analytics | Yes | Yes | Operational | Yes | Cost only as granted |
| Set overage/cap | Yes | No by default | No | No | Yes |
| Manage team/ownership | Yes | Invite role-limited | No | No | No |
| Privacy export/erasure | Yes | Policy-controlled | No | No | No |

The exact authorization model may combine billing manager with an existing role initially, but the UI and API must support the job boundary. Hidden navigation is not enforcement.

## 20. Notifications and lifecycle communication

### 20.1 Customer notification center

Notifications are grouped by Action needed, Product health, Usage and cost, Billing, Team/security and Completed. Each notification links directly to the affected object and suppresses duplicates. Email is used for time-sensitive or legally required events; in-app remains the durable activity record.

### 20.2 Required communications

- Verify account, invitation, recovery, ownership transfer.
- Checkout processing/success/failure/expiry.
- Subscription activation, renewal reminder, payment failure/grace/restriction, cancellation/end.
- Invoice/receipt/credit/refund.
- Onboarding blocked by actionable error.
- Deployment/channel/integration unhealthy or reauthorization required.
- Human handover/callback/appointment requiring action.
- Usage threshold, forecasted exhaustion, anomalous spike, cap reached, pack purchase.
- AI Text trial threshold at 100 of 500 replies remaining: in-app and account-owner email, once per threshold crossing.
- Privacy export/erasure completion.
- Support access requested/approved/active/expiring/revoked.
- Incident/status communication when customer impact is material.

Notification text must never claim a payment, deployment, booking, sync or recovery succeeded before authoritative state confirms it.

## 21. State, error, and recovery matrix

| Situation | UI treatment | Prohibited treatment |
| --- | --- | --- |
| Authoritative read unavailable | Named error, unchanged-state message, retry | Empty list or zero metric |
| Mutation transport unknown | Preserve input, resolve idempotency/status, safe retry | Automatic duplicate mutation |
| Payment pending | Processing state and status refresh | Immediate active access from return URL |
| Provider/channel degraded | Capability-specific attention and fallback | Entire workspace outage if unrelated areas work |
| Entitlement denied | State plan requirement and allowed next action | Generic server error or UI-only bypass |
| Limit reached | Meter/current/reset/pack/upgrade/fallback | Provider/token/model error |
| Trial ineligible | Preserve account and selection; show paid plan/support path | Reveal abuse-detection criteria or create a second grant |
| Trial expired/exhausted | Stop new trial service; show allowance/expiry and subscribe action; use merchant fallback for customers | Continue provider spend or imply automatic payment |
| Website URL invalid/authorization absent | Keep input; require complete HTTP/HTTPS URL and authorization, or offer manual entry | Start a crawl or discard the source page |
| Crawl partial/blocked | Show accessible/excluded pages; retry, continue accessible pages, or switch to manual | Invent extracted facts or mark all pages ready |
| Draft conflict | Compare/reload/save copy | Last-write-wins overwrite |
| Advisory configuration finding | Link to section; allow continue editing or publish with warning | Disable Publish merely because review/test is incomplete |
| Blocking publication invariant | Name exact graph/security/legal/entitlement problem and repair path | Relabel it as optional or publish an incoherent version |
| Install verification failed | Preserve snippet/domain; show missing loader/origin and retry | Enable customer traffic |
| Takeover window expired | Disable takeover and offer saved-contact follow-up | Authorize from a stale browser countdown |
| Concurrent takeover/owner change | Refresh authoritative actor/owner state | Send as the wrong actor |
| Import partially failed | Per-source status and retry failed items | Mark entire library empty/ready |
| External action unknown | Pending/unknown, reconcile | Show confirmed success |
| Closed social reply window | Disable composer before send; show alternatives | Accept text then fail silently |
| Voice reconnecting | Bounded reconnect status and end option | Frozen controls/infinite timer |
| Support access status unknown | Warning and restrict sensitive work | Assume no support access |

## 22. Visual and interaction system

### 22.1 Design character

Tenant and Platform products should feel quiet, precise and work-focused. Use full-width workspace bands, compact tables, split panes and tool surfaces. Cards are reserved for repeated selectable products/templates/items, not every section. Avoid marketing-style hero composition inside authenticated applications.

Use a balanced neutral foundation with DJAI green and yellow as product/action accents, red only for risk/destructive/blocked states, amber for attention, and blue sparingly for informational states. Do not let a single dark-blue/slate or green-only palette dominate.

### 22.2 Typography and density

- Product/workspace page title: compact, not hero scale.
- Panel headings: small and tight; no viewport-scaled fonts.
- Tables and operational lists prioritize scanability with aligned values and stable row height.
- Thai and English labels must fit without negative letter spacing or clipping.
- Use progressive disclosure for advanced configuration, not oversized explanatory cards.

### 22.3 Controls

- Icons from the existing icon library/lucide for familiar actions such as edit, duplicate, delete, publish, preview, copy, reconnect, download and filter, with tooltips where meaning is not universal.
- Segmented controls for modes/views; toggles/checkboxes for binary state; select/menu for options; steppers/inputs for limits; swatches for theme colors.
- Text buttons only for clear commands. Destructive actions are visually separated.
- Every busy control has stable dimensions and a truthful label; success/failure is announced without moving surrounding layout.

### 22.4 Responsive rules

- Support 360px mobile width through wide desktop.
- Builders may require desktop for full canvas editing, but mobile must permit review, small text edits, publish status, test, pause and operational actions; clearly communicate any desktop-only complex task before entry.
- Tables become prioritized row summaries and detail pages, not horizontally squeezed unreadable grids.
- Inbox and Platform split panes become routed stack navigation on mobile.
- Fixed widget/toolbar elements use explicit responsive constraints and safe-area insets.

### 22.5 Accessibility

- WCAG 2.2 AA for public, critical workspace, Platform and widgets.
- Keyboard-complete setup, list/table actions, inbox and builder alternative.
- Visible focus, semantic landmarks/headings, form grouping, error summary, live-region discipline.
- No color-only status; forced-colors and reduced-motion support.
- Screen-reader announcement for bot/human actor, delivery state, voice state and new messages.
- Captions/alt text required for customer-facing media; telephone/voice has text/human alternatives where possible.

## 23. Business-operating rules expressed in UX

1. Do not allocate expensive AI/Voice/channel resources to an unsubscribed workspace.
2. Do not count preview/test interactions toward customer allowance; track internal test cost separately. The anonymous AI Text builder uses a 50-request maximum per signed 30-day builder session, with no small rolling conversation throttle.
3. Do not let a user exceed seats, bots, channels, topics or concurrency and discover it only at publish/runtime.
4. Do not require support for the standard happy path; self-service must be complete.
5. Offer professional setup at high-friction points without making it appear included.
6. Show Priority support only where entitled and route it operationally to a distinct queue/SLA policy.
7. Preserve workspace data on downgrade/cancel while making disabled behavior explicit.
8. Keep third-party fees separate in checkout, usage, invoice and channel/telephone setup.
9. Treat one tenant with multiple product families as one customer relationship but separate contracts/meters/readiness.
10. Provide operator queues for exceptions so customer support does not require database changes.
11. Use the same catalogue and state-machine labels across public, tenant, Platform, email and support.
12. Make every upsell contextual to a real reached limit or requested capability; do not obstruct normal operation with generic upgrade banners.

## 24. Analytics and UX instrumentation

### 24.1 Acquisition funnel

Track anonymous events only with approved consent/privacy policy:

- Product family viewed.
- Package comparison opened.
- Package selected.
- Registration started/completed/verified.
- Checkout created/opened/completed/expired/failed.
- Time and drop-off between stages.

### 24.2 Activation funnel

Per product:

- Access activated.
- Onboarding started.
- Shared prerequisites completed.
- First draft saved.
- First content/knowledge added.
- First preview and published-version test.
- Deployment/channel connected and verified.
- First live customer conversation.
- First lead/handover/action outcome.

### 24.3 Operational UX measures

- Time to launch and first value by package.
- Step error/retry/help-request rate.
- Install/channel connection success.
- Knowledge ingestion failures and time to resolution.
- Handover wait/accept/resolution and closed-window misses.
- Usage-alert action and unexpected-overage complaint rate.
- Checkout/subscription/FlowAccount reconciliation exceptions.
- Support cases by journey and product lifecycle state.
- Accessibility defects and task completion in Thai/English.

### 24.4 SaaS Owner analytics instrumentation

Owner analytics also records immutable, privacy-bounded events needed to calculate:

- merchant and paid-subscription growth;
- new, expansion, contraction, reactivation and churned MRR;
- invoice, collection, refund, credit, chargeback and reconciliation movement;
- Flow/Text/Voice activation, trial, deployment, first-use and first-outcome funnels;
- Text replies and native token categories by snapshotted route/model;
- Voice exact seconds, billable minutes, native provider usage and outcomes;
- variable provider cost and margin by merchant, product, package and model;
- report/alert action and governed export lifecycle.

Commercial meters, provider-native cost meters and UI interaction events remain separate event families. Analytics calculations cite their source family and version.

Instrumentation uses stable event names, lifecycle/product/channel dimensions and pseudonymous identifiers. It excludes message/document content, raw contact data, payment details and secrets.

## 25. Screen and route delivery inventory

### 25.1 Public

| Priority | View | Purpose |
| --- | --- | --- |
| P0 | Business-outcome Landing | Present all three families and lead to packages |
| P0 | Family/package Pricing | Select family, tier, paid subscription or eligible trial |
| P0 | Registration/sign-in/verification/recovery | Secure identity lifecycle |
| P0 | Checkout review/return | Truthful purchase lifecycle |
| P0 | Terms/privacy/status | Trust and operational disclosure |
| P1 | Family detail pages | Deeper package suitability/features |
| P1 | Setup services/Enterprise | Qualified service/sales entry |

### 25.2 Tenant

| Priority | View | Purpose |
| --- | --- | --- |
| P0 | Unsubscribed/subscribed Overview | State-driven next action and portfolio health |
| P0 | Flow three-page onboarding | Starting journey, identity/preview, Dashboard-or-Studio summary |
| P0 | Separate Text and Voice four-page onboarding | Role, source, truthful processing, editable generated review |
| P0 | Flow full-page Studio | Deterministic map, lead/handover/widget, optional tester, publish/install |
| P0 | AI Text full-page Studio | Role-specific configuration, Text controls/tester, publish/install |
| P0 | AI Voice full-page Studio | Role-specific configuration, Voice controls/tester, publish/install |
| P0 | Dashboard/Conversations/Contacts/Leads/Appointments/Analytics | Daily customer operation and five-minute takeover |
| P0 | Usage/Billing | Cost and contract control |
| P0 | Team/Security/Data | SaaS administration and compliance |
| P1 | Channels/Integrations | Advanced connections and health |
| P1 | Appointments/Callbacks | Cross-product action workflow |
| P1 | Product/portfolio analytics | Improvement and business outcomes |
| P1 | Notifications/activity | Durable action queue/history |

### 25.3 Platform Master

| Priority | View | Purpose |
| --- | --- | --- |
| P0 | Command center/Tenant 360 | Customer impact and support context |
| P0 | Subscriptions/checkouts/provisioning | Revenue/access exceptions |
| P0 | Usage/overage/reconciliation | Cost and billable truth |
| P0 | Finance/FlowAccount | Immutable accounting operations |
| P0 | Providers/Voice/social/jobs | Runtime health and recovery |
| P0 | Support access/audit/release | Controlled operations |
| P1 | Catalogue/promotions | Versioned commercial administration |
| P1 | Quality/language reviews | Sellability and model/voice quality |
| P0 | Owner Overview | Merchant/subscription growth, revenue, provider cost, margin, conversion and attention |
| P0 | Merchant directory/User directory | Separate business and human identity search, filters, details and governed export |
| P0 | Subscriptions/Revenue | Complete lifecycle dates, recurring movement, invoice/collection/refund/credit truth |
| P0 | Text/Voice Usage | Commercial meters, native usage, allowance, reliability and economics |
| P0 | Models | Owner-only provider/model route, quality, reliability, incident and cost analytics |
| P0 | Trials & Conversion | Approved Flow/Text trial lifecycle and funnel/cohort analysis |
| P0 | Reports & Alerts/Exports | Saved and scheduled analysis, authoritative alerts and audited data delivery |

## 26. End-to-end acceptance journeys

### Journey A: Unsubscribed Flow Starter purchase to live website

1. Compare Flow Starter/Advanced and see exact first-year/renewal values.
2. Register, verify, return to preserved selection.
3. Complete Stripe payment; delayed webhook shows processing, then active.
4. Enter Flow onboarding, copy a template, customize greeting/topics/form/CTA.
5. Open Dashboard before completion and verify Configuration is highlighted, then return to the full-page Flow Studio.
6. Exercise the optional selected-path tester; publish with one advisory warning.
7. Add origin/script, automated install check, explicitly activate, then use Enter Dashboard.
8. Website visitor completes Flow and creates one lead/one conversation meter event.
9. Merchant receives lead, handles optional handover and sees usage/analytics.

### Journey B: AI Text Advanced with LINE

1. Purchase AI Text Advanced and set cap/alerts.
2. Add website/FAQ/PDF/catalogue; resolve one failed source; publish knowledge.
3. Configure Thai/English personality, qualification, CTA, escalation and CRM/Sheets.
4. Test grounded answers/actions in both languages.
5. Connect LINE OA as included channel and pass two-way test.
6. Customer asks an unanticipated question; one reply is generated/metered/delivered.
7. Low confidence routes to department handover; staff sees reply-window deadline and responds.
8. Lead/contact/summary/CRM sync and reconciliation appear accurately.

### Journey B0: AI Text website trial to quota boundary

1. Select AI Text, then Starter/Advanced comparison, then the 30-day trial; verify Voice has no trial and role has not yet been asked.
2. Complete account/legal/card evidence and provision exactly one website-only Starter trial with 500 replies and a fixed expiry.
3. Choose Sales Associate, supply an authorized website, exercise partial-crawl recovery, and edit business profile, three behavior fields and FAQs.
4. Configure role-specific sections, leave one section not reviewed and one suggested test unrun, then publish with advisory warnings.
5. Install, verify and explicitly Go live; enter Dashboard and return to Configuration.
6. Commit the 400th reply and verify one in-app and one account-owner email threshold notification at 100 remaining.
7. Exhaust the 500th reply and verify new AI replies stop, customer fallback is merchant-approved, and the merchant sees Subscribe without provider/internal details or automatic charge.

### Journey B1: AI Text/Voice role distinction

1. Repeat onboarding for Support, Sales, and Booking and verify the left sections, generated behavior, suggested tests and actions differ as specified.
2. Verify Sales can offer booking after discovery/objection handling without becoming a booking-only bot.
3. Change role in a draft; shared information remains, role sections become attention states, and the published/live version is unchanged.
4. Verify Text uses a 200-character message tester and Voice uses the distinct voice controls with written content capped before speech.

### Journey C: Voice Advanced telephone appointment and transfer

1. Purchase Voice Advanced; configure carrier fees/cap/disclosure.
2. Configure agent, knowledge, languages, business hours, scheduling, departments and transfer fallback.
3. Assign number and pass inbound test call.
4. Caller consents, asks question, books a verified appointment, then requests a human.
5. Warm transfer succeeds with context; session finalizes exactly once.
6. Connected minutes, carrier charge, transcript, summary, outcome, appointment and analytics reconcile.
7. Repeat with transfer failure and cap/provider fallback; no false success or silent downgrade.

### Journey D: Multi-product tenant

1. Existing Flow customer purchases AI Text without losing Flow contract/readiness.
2. Shared business profile/team/knowledge are available where compatible.
3. AI Text onboarding progresses independently while Flow remains live.
4. Website uses one launcher with Flow/Text chooser; meters remain distinct.
5. Overview and billing show both contracts, lifecycle states, usage and renewal correctly.
6. Take over a website conversation at 4:59, verify automation pauses and actor changes; reject takeover at 5:00; return Flow to its main menu.

### Journey E: DJAI finance/support exception

1. Stripe payment succeeds but provisioning task fails.
2. Customer sees processing/attention, not duplicate checkout.
3. Platform queue identifies durable payment and failed provisioning.
4. Authorized operator replays idempotently; entitlement becomes active once.
5. Invoice finalizes; FlowAccount sync rejects one field.
6. Finance resolves through mapped correction/retry without editing finalized invoice.
7. Support access, if needed, is consented/time-limited/visible/audited.

## 27. UX release evidence

Each sellable package requires:

- Public comparison and checkout screenshots/tests at desktop and mobile in Thai and English.
- Unsubscribed, processing, active, past-due, canceled and ended workspace-state tests.
- Product-specific onboarding happy path and all blocking/error states.
- Published-version test and actual deployed channel evidence.
- Website widget tests at supported breakpoints, host styles, keyboard/screen reader and slow/offline networks.
- Real LINE/Messenger test for applicable package and deterministic Flow/AI meter proof.
- Real telephone call evidence for Voice Advanced, including transfer/scheduling/failure.
- Role and direct-route denial tests across owner/admin/operator/analyst/billing jobs.
- Platform exception workflow evidence for checkout, subscription, usage, invoice/credit, FlowAccount, provider, dead letter and support access.
- No overflow/overlap, axe/WCAG automated gate, manual keyboard and Thai text inspection.
- Analytics event validation without prohibited data.

## 28. Review impact on current implementation

The existing UI foundation should be retained for brand tokens, fail-closed reads, safe mutations, realm-specific origins/cookies, recovery boundaries, support banner, widget accessibility geometry, immutable publication, and server-derived launch evidence.

The following current patterns require redesign:

1. Public registration currently contains a minimal plan selector but not the complete comparison, checkout review, return/resume, or unsubscribed lifecycle.
2. Workspace onboarding currently summarizes only a primary selected product; it must track and present each subscribed family independently.
3. Product Studios are long single pages; split them into job-oriented routes while sharing one product context and preserving deep-linkable state.
4. Knowledge is currently a minimal source form/list; add ingestion status, source inspection, revision publication, binding impact and refresh/review flows.
5. Tenant navigation lacks Channels, Integrations, Billing, Appointments/Callbacks, Analytics and Notifications as first-class operational areas.
6. Usage must evolve from evidence display into allowance/forecast/pack/overage/cap control.
7. Platform Master must evolve from a single anchor dashboard into route-based queues and Tenant 360 while retaining role restrictions and fail-closed gates.
8. Website widget setup must support one-launcher multi-product arbitration and real host verification.
9. Social UX is currently AI-oriented; deterministic Flow social execution and merchant/customer/handover states need equal treatment.
10. Voice deployment must add telephone-number, carrier, transfer, scheduling and cost workflows without exposing provider routing.
11. The implemented product must follow the approved page order, three separate onboarding branches, non-blocking advisory review, dedicated Configuration/Dashboard navigation, and explicit publish/install/go-live sequence in the 2026-08-13 experience contract.

## 29. Related documents

- `docs/design/djay-bots-approved-experience-contract.md`
- `docs/design/djay-bot-text-voice-configuration-flow.html`
- `docs/product/djay-bots-v1-market-release-prd.md`
- `docs/architecture/djay-bots-v1-market-release-architecture.md`
- `docs/implementation/djay-bots-v1-detailed-implementation-plan.md`
- `docs/audit/commercial-package-feature-gap-2026-07-18.md`
- `docs/audit/accepted-behavior-matrix.md`
- `docs/runbooks/ui-foundation.md`
- `docs/runbooks/onboarding-launch-readiness.md`
- `docs/validation/ui-route-matrix.md`
