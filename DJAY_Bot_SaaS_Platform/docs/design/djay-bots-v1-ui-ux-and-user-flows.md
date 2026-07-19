# DJay Bots V1 UI/UX and User-Flow Plan

| Field | Value |
| --- | --- |
| Status | Target experience specification for V1 Market Release |
| Date | 2026-07-18 |
| Product authority | `docs/product/djay-bots-v1-market-release-prd.md` |
| Architecture authority | `docs/architecture/djay-bots-v1-market-release-architecture.md` |
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
3. **Progress is evidence.** A checklist completes only from server-observed facts, never a browser checkbox.
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
 -> published_not_tested
 -> tested_not_deployed
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

The first screen is the usable product/pricing experience, not a separate marketing splash. The public site may retain the brand and concise value proposition, but package selection, exact prices, comparison, and next action must be available without navigating through a long campaign page.

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

On mobile, use a stable top bar with workspace switcher and a drawer/bottom destination mechanism. Do not compress the desktop sidebar until labels become unreadable.

### 6.3 Product workspace pattern

Each product uses the same top-level structure:

```text
Product overview
Bots/agents
Builder or playbook
Knowledge/content (when applicable)
Actions and handover
Channels/deployments
Test
Analytics
Settings and versions
```

The selected bot/agent persists across these views. The header shows name, plan, lifecycle status, published version, live channels, usage status, and one context-appropriate primary command.

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

The public product chooser asks one optional business-oriented question: “How do customers contact you?” with options guided website steps, open text questions, phone/voice, or multiple. This can recommend a family but must not hide other packages.

Each family view shows:

- Literal product name and short outcome statement.
- Starter and Advanced in one scannable comparison.
- First-year annual amount, regular annual renewal, saving, and informational monthly equivalent.
- Included bots/agents, channels, usage, admins, integrations, branding, and overage.
- Third-party exclusions directly beside channel/telephone claims.
- Optional setup services separated from subscription inclusions.
- “Choose [package]” and “Talk to DJAI” actions.

Do not default-select the most expensive plan or use visual tricks that obscure renewal price. “Recommended” may be used only when driven by stated needs or an approved general recommendation with clear reasoning.

### 7.2 Package comparison interaction

- Tabs switch Flow/Text/Voice families; a second segmented control switches concise/full comparison.
- Sticky comparison header on long desktop tables; stacked feature groups on mobile.
- Differences are grouped by Capacity, Channels, Conversation behavior, Lead operations, Integrations, Analytics, Team/support, and Costs.
- Exact offer terms come from the active catalogue API; public copy does not maintain a separate price constant.
- Unavailable catalogue state preserves descriptive product content but disables checkout and identifies retry/contact paths.

### 7.3 Registration strategy

Registration and purchase are related but separate. A prospect may:

1. Choose a package, then register/sign in and return to checkout.
2. Register first, create a workspace, then choose a package inside the workspace.
3. Receive an invitation and join a workspace without being offered owner checkout.

Preserve an opaque server-side purchase intent across email verification/sign-in. Do not place a trusted plan, price, promotion, or tenant identifier in an editable browser parameter.

Registration asks only name, work email, business name, password/confirmation, preferred UI language, timezone confirmation, and current legal acceptance. Detailed business profile belongs in onboarding.

### 7.4 Unsubscribed workspace experience

After verification and workspace provisioning, an unsubscribed owner lands on a real workspace, not an empty dashboard or blocked product Studio.

The Overview shows:

- “Choose your first bot” as the primary task.
- Saved/recommended package if one exists, with exact price and renewal.
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

## 8. First session after subscription

### 8.1 Subscription success landing

After authoritative activation, the owner sees:

- Package and access-active confirmation.
- Paid term and regular renewal amount/date.
- Included allowance and current safety-cap/overage mode.
- Invoice/receipt status.
- Product-specific onboarding with estimated task count, not an unverifiable completion-time promise.
- Choice between self-service and purchased/requested professional setup.

Do not drop the customer into a complex builder. The primary action is “Set up [product]”. Secondary actions are invite team, view billing, or set up later.

### 8.2 Onboarding shell

Every product onboarding uses a persistent step navigator and a main task surface. Desktop uses a narrow left progress rail; mobile uses a current-step header and step list drawer. Each step has:

- One outcome-oriented title.
- Current authoritative status.
- Required fields first; advanced settings collapsed into named groups.
- Save-and-exit.
- Back and continue without losing valid draft data.
- Preview/test where meaningful.
- Error summary linked to fields.
- “Get setup help” that creates a scoped support/professional-services request.

The onboarding shell records evidence but never permits manual completion. Returning customers resume the first incomplete or attention step. Users can navigate completed steps without being forced through the wizard again.

### 8.3 Shared prerequisite steps

1. **Business profile:** legal/display name, industry, website, contact information, timezone, default language, business hours.
2. **Lead destination:** notification recipients, inbox ownership, handover availability, callback expectation.
3. **Privacy and disclosure:** privacy URL, consent wording, retention, AI/transcription disclosure as applicable.
4. **Usage protection:** threshold recipients, overage opt-in, pack, safety cap, and fallback behavior.

If multiple products are purchased, shared steps are completed once and referenced by each product. Product-specific readiness still remains independent.

## 9. Flow Bot onboarding

### 9.1 Flow Starter path

1. **Choose a starting point**
   Select blank bot or an industry template. Preview template topics before copying.
2. **Name and greeting**
   Bot name, Thai/English/default language, welcome message, fallback/handover message.
3. **Build topics**
   Visual topic list plus canvas/step editor. Create FAQ, message, buttons, image/card, form, CTA, branch, and handover steps.
4. **Capture leads**
   Choose fields, required/optional state, consent, lead title/source, notification recipient.
5. **Test conversation**
   Test panel beside builder on desktop and full-screen mode on mobile. Test evidence must use the published candidate revision without creating billable customer usage.
6. **Install on website**
   Add allowed website origin, choose appearance/position, copy installation snippet, run automated install check, then open real-site test.
7. **Launch**
   Publish immutable version and activate deployment only after graph validation, current-version test, origin check, and entitlement.

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

- Left: topics and reusable blocks.
- Center: stable graph/canvas with zoom, selection, keyboard alternatives, validation markers.
- Right: selected-step settings using the appropriate control: text editor, media picker, button list, field list, condition builder, routing menu, integration action.
- Bottom/right preview: optional, resizable, never covering node controls.
- Top bar: Draft saved state, Validate, Preview, Publish. Publish is the only visually primary command.
- Version conflict opens a compare/reload flow and never silently overwrites another editor.
- JSON is an advanced import/export/repair surface, not the primary authoring experience.

## 10. AI Text onboarding

### 10.1 AI Text Starter path

1. **Agent identity**
   Agent name, greeting, Thai/English/default language, tone, business role.
2. **Add business knowledge**
   Website import, FAQ, PDF, DOCX, TXT, and manual product/service information. Show each source's scan/extract/index state and any excluded pages.
3. **Set sales behavior**
   Goals, answer boundaries, recommendation behavior, prohibited claims, escalation, and CTA priorities through structured controls plus concise instruction fields.
4. **Lead and actions**
   Contact fields, booking request, call, LINE, and website actions; validate every destination.
5. **Quality test**
   Curated suggested questions plus custom questions in Thai and English. Show answer, source coverage, action proposal, confidence/escalation, and whether it would count in production. No external side effect in preview.
6. **Install and launch**
   Website origin, appearance, snippet, install check, current-version published test, activation.

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

## 11. AI Voice onboarding

### 11.1 Voice Starter path

1. **Agent and voice**
   Name, language, approved voice choices presented without provider/model identity, greeting, speaking style.
2. **Knowledge**
   Select/create one knowledge base and test spoken answers.
3. **Conversation behavior**
   Opening, qualification questions, interruptions, silence handling, maximum duration, callback and appointment-request behavior.
4. **Privacy and disclosure**
   AI identity, transcription/recording policy, consent wording, privacy link, retention.
5. **Lead and callback**
   Required contact fields, callback recipients/hours, outcomes.
6. **Voice quality test**
   Browser microphone test for Thai and English, interruption, silence, noisy input, contact capture, end call, transcript/summary. Display current connected test time without charging customer allowance.
7. **Website deployment**
   Origin, appearance, snippet, install/microphone check, concurrency/usage fallback, activate.

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

Voice cannot activate until disclosure, maximum call duration, usage cap/fallback, end-call behavior, current-version test, and deployment/number health are verified. If Advanced provider admission is globally paused, the merchant sees “Voice launch temporarily unavailable” with saved setup intact, never provider/model names or a silent downgrade.

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
| Draft conflict | Compare/reload/save copy | Last-write-wins overwrite |
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
2. Do not count preview/test interactions toward customer allowance; track internal test cost separately.
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

Instrumentation uses stable event names, lifecycle/product/channel dimensions and pseudonymous identifiers. It excludes message/document content, raw contact data, payment details and secrets.

## 25. Screen and route delivery inventory

### 25.1 Public

| Priority | View | Purpose |
| --- | --- | --- |
| P0 | Product chooser/pricing | Compare and select exact packages |
| P0 | Registration/sign-in/verification/recovery | Secure identity lifecycle |
| P0 | Checkout review/return | Truthful purchase lifecycle |
| P0 | Terms/privacy/status | Trust and operational disclosure |
| P1 | Family detail pages | Deeper package suitability/features |
| P1 | Setup services/Enterprise | Qualified service/sales entry |

### 25.2 Tenant

| Priority | View | Purpose |
| --- | --- | --- |
| P0 | Unsubscribed/subscribed Overview | State-driven next action and portfolio health |
| P0 | Product onboarding shell | Shared evidence-based setup framework |
| P0 | Flow Builder/Test/Deploy | Complete Flow launch path |
| P0 | AI Playbook/Knowledge/Test/Deploy | Complete AI Text launch path |
| P0 | Voice Studio/Test/Deploy | Complete web Voice launch path |
| P0 | Inbox/Leads/Contacts | Daily customer operation |
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

## 26. End-to-end acceptance journeys

### Journey A: Unsubscribed Flow Starter purchase to live website

1. Compare Flow Starter/Advanced and see exact first-year/renewal values.
2. Register, verify, return to preserved selection.
3. Complete Stripe payment; delayed webhook shows processing, then active.
4. Enter Flow onboarding, copy a template, customize greeting/topics/form/CTA.
5. Publish candidate, complete current-version test.
6. Add origin/script, automated install check, activate.
7. Website visitor completes Flow and creates one lead/one conversation meter event.
8. Merchant receives lead, handles optional handover and sees usage/analytics.

### Journey B: AI Text Advanced with LINE

1. Purchase AI Text Advanced and set cap/alerts.
2. Add website/FAQ/PDF/catalogue; resolve one failed source; publish knowledge.
3. Configure Thai/English personality, qualification, CTA, escalation and CRM/Sheets.
4. Test grounded answers/actions in both languages.
5. Connect LINE OA as included channel and pass two-way test.
6. Customer asks an unanticipated question; one reply is generated/metered/delivered.
7. Low confidence routes to department handover; staff sees reply-window deadline and responds.
8. Lead/contact/summary/CRM sync and reconciliation appear accurately.

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

## 29. Related documents

- `docs/product/djay-bots-v1-market-release-prd.md`
- `docs/architecture/djay-bots-v1-market-release-architecture.md`
- `docs/implementation/djay-bots-v1-detailed-implementation-plan.md`
- `docs/audit/commercial-package-feature-gap-2026-07-18.md`
- `docs/audit/accepted-behavior-matrix.md`
- `docs/runbooks/ui-foundation.md`
- `docs/runbooks/onboarding-launch-readiness.md`
- `docs/validation/ui-route-matrix.md`
