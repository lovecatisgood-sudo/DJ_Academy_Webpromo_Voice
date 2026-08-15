# DJBOT Approved Experience Contract

| Field | Value |
| --- | --- |
| Status | Approved interaction and product-flow baseline |
| Effective date | 2026-08-13 |
| Product | DJBOT by DJAI |
| Applies to | Public acquisition, trials, merchant onboarding, configuration, website launch, merchant operations, and customer handover |
| Approved visual reference | `docs/design/djay-bot-text-voice-configuration-flow.html` |
| Commercial authority | `docs/product/djay-bots-v1-market-release-prd.md` |

## 1. Why this contract exists

This document records the product decisions approved through the page-by-page design process. It is the normative source for experience order, page ownership, cross-product differences, optional versus blocking checks, and the state transitions represented by the approved clickable demo.

The HTML demo is the approved visual and interaction reference. Its sample merchant, customer, conversation, and usage records are illustrative data, not production requirements. This contract states which behavior is intentional so implementation does not mistake demo content for business policy.

## 2. Authority and conflict rules

Use the following order when documents appear to disagree:

1. The market-release PRD controls package keys, paid prices, paid allowances, billing terms, entitlements, and normative product requirements.
2. This contract controls page order, navigation, onboarding, configuration, testing, publishing, installation, dashboard behavior, and product-specific UX.
3. The market-release architecture and system map control technical boundaries and realization of the approved behavior.
4. The UI/UX plan expands responsive, accessibility, and detailed interaction requirements without changing this contract.
5. The implementation plan controls delivery sequencing, not product behavior.
6. ADRs control an accepted technical decision within their stated scope.
7. Audits, validation reports, dated plans, checkpoints, and older HTML demos are historical evidence. They cannot override an approved requirement.

No team member or agent may silently fill a product gap by improvising. A new behavior must be labelled `Proposed` until the product owner explicitly approves it. Clear approval must identify the changed behavior; generic permission to continue is not product approval.

## 3. Product families and the first irreversible choice

DJBOT has three separate product families:

| Product | Customer interaction | Configuration model | Primary usage meter |
| --- | --- | --- | --- |
| Flow Bot | Deterministic guided journeys | Template plus visual flow editor | Customer conversations |
| AI Text Bot | Grounded natural-language website chat | Role-led AI-assisted configuration | AI-generated replies |
| AI Voice Bot | Grounded spoken conversations | Role-led AI-assisted configuration with voice controls | Connected voice minutes |

The public landing page and subscription page show all three families. The merchant chooses the bot family and package before any business goal, role, or bot-specific setup question appears. The selected family determines the onboarding and configuration that follows.

Flow Bot, AI Text Bot, and AI Voice Bot are separate configuration flows. Shared public pages and the common merchant operating shell do not merge their product-specific setup.

## 4. Complete public acquisition and account flow

### 4.1 Landing page

The landing page must:

- explain the business problem and sales/service outcomes before technical features;
- present Flow Bot, AI Text Bot, and AI Voice Bot together;
- explain the lead journey from customer conversation to merchant follow-up;
- show use cases, setup expectations, business control, and a clear package action;
- lead to package comparison instead of placing registration on the homepage;
- preserve explicit Thai and English presentation through the shared public locale system.

Primary sequence:

`Landing page -> View packages -> Choose bot family -> Choose Starter or Advanced -> Subscribe or eligible free trial -> Account step -> Product-specific onboarding`

### 4.2 Subscription and package selection

The subscription page shows family tabs for all three products. Within the selected family it shows Starter and Advanced plans, the first-year annual amount, annual renewal amount, included features, usage, channels, and relevant trial terms.

Rules:

- Bot family selection comes before role selection.
- Selecting a family resets the package choice to that family's available default; the merchant may then choose Starter or Advanced.
- Paid subscription is available for all sellable families.
- Free trial is shown only for Flow Bot and AI Text Bot.
- AI Voice Bot is subscription-only.
- Trial access uses Starter capabilities even if the merchant had highlighted an Advanced package.
- A real implementation must use the active server-side catalogue. The demo's values are a visual snapshot.

### 4.3 Account and order step

The account step does not follow the commercial choice immediately. The merchant first completes the selected product's onboarding, editable configuration, testing, and publication flow without an account. Account creation appears only when the merchant presses `Deploy Bot`; it presents the selected product, access type, amount due now, and the applicable term or trial limit while preserving the completed anonymous draft.

The production deployment account flow requires identity, legal acceptance, and authoritative server-side provisioning. The standalone design demo deliberately simulates this deployment-only page without creating an account, charging a card, or requiring login.

For paid subscriptions, payment confirmation and entitlement provisioning must be authoritative and idempotent. A trial choice creates a pending trial intent so the merchant can configure and test without consuming trial time. The 30-day clock begins only when deployment provisioning succeeds. Flow deployment requires a verified account email. Text deployment first opens Stripe card setup, and the deployment continues only after the SetupIntent succeeds and the server confirms that the card fingerprint has not previously received a Text trial.

## 5. Approved free-trial policy

| Rule | Flow Bot trial | AI Text Bot trial | AI Voice Bot |
| --- | --- | --- | --- |
| Eligibility | One trial per verified account email | One trial per verified card fingerprint | No trial |
| Duration | 30 fixed days | 30 fixed days | Not applicable |
| Package basis | Starter settings | Starter settings | Not applicable |
| Channel access | Website only | Website only | Not applicable |
| Card required | No | At Deploy Bot only | Not applicable |
| Included allowance | 5,000 customer conversations | 500 AI-generated replies, equal to 25% of the 2,000-reply Starter allowance | Not applicable |
| Warning | Usage shown in platform | At 100 replies remaining, equal to 20% of the trial quota, warn in platform and by email | Paid-plan policy only |
| Exhaustion | Stop new trial service and prompt subscription | Stop new AI replies and prompt subscription | Paid-plan policy only |
| Expiry | Stop new trial service and prompt subscription | Stop new AI replies and prompt subscription | Not applicable |
| Social access | None | None | Not applicable |

The AI Text warning recipient is the account owner. Additional configurable recipients may be added only through a separately approved notification decision.

Flow trial matching uses only the normalized verified account email. Text trial matching uses only the Stripe card fingerprint returned after successful card setup; Deejai stores a keyed hash of that fingerprint, not the full card number. Company registration, business-domain verification, telephone verification, IP address and device identity are not eligibility requirements. IP/device signals may be logged under the security policy but cannot reject a trial.

The Text card setup validates and saves the card without creating a DJBOT charge. Any temporary verification entry is controlled by Stripe, the card network and the issuing bank and must not be advertised as an exact USD 1 charge. Automatic conversion, automatic charging at expiry, and additional warning recipients remain prohibited unless separately approved. Ordinary approved retention controls apply to trial data.

## 6. Flow Bot onboarding

Flow Bot does not ask the AI Text/Voice role question. It begins with a deterministic starting journey.

### 6.1 Page F1: choose a starting journey

The merchant chooses one of six editable starting points:

1. **FAQ and contact:** welcome, main menu, approved answers, lead form, and human handover.
2. **Capture leads:** understand the enquiry, choose follow-up, collect consent/contact details, and confirm receipt.
3. **Appointment request:** choose service, collect preferred time and contact details, and record a request without claiming confirmation.
4. **Product or service guide:** browse approved categories/options, open a CTA, ask a question, or request help.
5. **Support routing:** identify the issue, collect context, show approved guidance, and hand unresolved cases to a person.
6. **Start from blank:** one welcome step from which the merchant builds the complete flow.

Selecting a template updates a visible path preview and description before the merchant continues. Every template is copied into the merchant's own editable draft; none is a locked example that can only be accepted.

### 6.2 Page F2: identity and website experience

Editable fields:

- bot name;
- default language: English, Thai, or English and Thai;
- English greeting;
- Thai greeting;
- brand colour;
- widget position: bottom right or bottom left;
- business hours;
- handover contact;
- privacy-policy URL.

The page includes a live widget preview reflecting name, greeting, colour, language, and launcher position.

### 6.3 Page F3: draft prepared

The summary shows the selected template, bot name, and number of editable steps. It provides both:

- **Open Dashboard**, because dashboard access is never held hostage by configuration completion; and
- **Open Flow Studio**, the normal next action.

## 7. Flow Bot Configuration Studio

### 7.1 Studio shell

Flow configuration is a full-page workspace, not a small dashboard card. It contains:

- top bar with bot/draft context, published-version state, local save state, Dashboard, Undo, Redo, and Reset demo controls;
- left navigation with a persistent Dashboard return and editable sections;
- central task surface;
- right panel with **Edit selected step** and **Test flow** tabs;
- responsive mobile behavior where the right panel opens as a focused surface and provides **Return to canvas**.

The left navigation is the configuration guide. Do not duplicate it with a second readiness checklist that repeats the same sections. Each navigation item may show `Ready`, `Needs attention`, `Optional`, `Not published`, `Install pending`, or `Traffic off` without preventing the merchant from moving freely between sections.

### 7.2 Flow sections

1. **Bot identity:** customer-facing name, language, greetings, brand, business hours, handover contact, privacy link, and preview.
2. **Flow map:** visual journey authoring, graph checks, and advisory suggestions.
3. **Lead capture:** fields, input types, required/optional state, and consent wording.
4. **Fallback and handover:** destination team, business hours, English/Thai fallbacks, outside-hours response, handover contact, and preserved context.
5. **Widget appearance:** website domain, position, colour, open-on-load choice, and widget preview.
6. **Publish and install / Install and go live:** publication state, snippet, domain verification, and explicit traffic control.

### 7.3 Visual flow map

The map supports:

- selecting and dragging steps;
- adding a message step;
- duplicating a selected step;
- removing a selected step when it is not the entry and has no unresolved incoming reference;
- choosing another entry step;
- fitting/returning the map viewport;
- undo and redo for draft changes;
- opening the selected path in the tester.

Supported baseline step types:

- message;
- options/buttons;
- typed input;
- form;
- card;
- human handover;
- end.

The selected-step editor supports title, English customer copy, Thai customer copy, next destination, button labels/destinations, form fields, typed-message keywords, and entry-step selection as appropriate to the type.

Flow execution remains deterministic. Typed input matches configured keywords. Unmatched text follows the configured fallback or human-handover route; it never silently invokes an AI model. Runtime protects against missing references and unbounded loops.

### 7.4 Lead capture and handover context

Lead fields support text, email, telephone, and textarea input, plus required/optional state. Optional details do not prevent continuation. Form definitions update the Flow draft and remain editable.

Human handover carries:

- transcript;
- selected path;
- collected fields;
- pinned Flow version;
- handover reason;
- configured destination.

The UI must not claim a person received or accepted a handover until authoritative confirmation exists.

### 7.5 Flow test panel

The tester runs the actual draft structure without creating billable customer usage or external side effects. It supports:

- starting at the entry step or selected step;
- English/Thai test language;
- button paths;
- form submission simulation;
- typed keyword matching;
- fallback behavior;
- restart;
- end and handover outcomes.

Testing is recommended and always optional.

### 7.6 Flow publication and website activation

Publication, installation, verification, and live traffic are four separate states:

1. Publish an immutable Flow version.
2. Copy/install the website snippet.
3. Verify a complete HTTPS website domain and widget loader.
4. Explicitly turn customer traffic on.

Content, language, lead-form, handover, and test findings are advisory warnings. The merchant may publish with them. Only conditions that make a coherent or safe version technically impossible may block publication, including a missing entry step, duplicate step identifiers, references to missing steps, an options step with no option, or a form step with no field.

Publishing does not silently install the bot or enable traffic. A subsequent draft change does not alter the published version and resets installation/live readiness where the deployed artifact would no longer match. Previous immutable versions remain available for controlled rollback.

## 8. AI Text and AI Voice shared onboarding

Text and Voice follow the same onboarding structure until modality-specific configuration. They do not share one combined configuration flow.

### 8.1 Page A1: choose the bot's role

Roles:

1. **Customer Support:** answer common questions, guide issue resolution, collect relevant context, and hand complex cases to the team.
2. **Sales Associate:** discover needs, qualify fit, recommend approved products/services, handle objections, capture leads, and offer appointments.
3. **Appointment Booking:** explain approved services, collect necessary details, use valid availability, and distinguish a request from a confirmed booking.

Role selection changes the onboarding questions, generated configuration sections, suggested test cases, permitted actions, and operational reporting. A Sales Associate may also book appointments; its primary behavior remains sales discovery and objection handling rather than a booking-only script.

### 8.2 Page A2: supply business information

The heading confirms the selected role. The merchant chooses either:

- **Website:** enter a public business URL and confirm authorization to use the public content; or
- **Tell us about the business:** enter the business information manually in plain language.

Website learning is limited to approved public content. Login/account pages, checkout, private areas, form submissions, and unrelated pages are excluded. Invalid URL and missing-authorization states must explain how to recover or use manual entry.

### 8.3 Page A3: AI-assisted preparation

The interface shows truthful task-level progress such as:

- checking the public website;
- reading accessible public pages;
- identifying business facts;
- organizing facts for the selected role;
- drafting editable behavior and FAQ material.

It may use varied human-friendly status copy, but it must not reveal or fabricate hidden chain-of-thought. The merchant may cancel back to the source page. Partial crawl failure offers retry, continue with accessible public pages, or switch to manual entry.

### 8.4 Page A4: review the generated draft

Everything generated is editable before entering Configuration Studio.

Business profile fields:

- business name;
- business type;
- business summary;
- products and services;
- business hours;
- primary contact;
- sources used and excluded-source explanation.

Agent behavior fields:

- agent objective;
- conversation behavior;
- boundaries and human-handover rules.

FAQ fields:

- customer question;
- approved answer;
- add, edit, and remove controls.

The merchant is never forced to accept a generated sample unchanged.

## 9. AI Text and AI Voice Configuration Studio

### 9.1 Shared shell and navigation

Configuration is a full page with:

- a direct Dashboard action in the left navigation;
- grouped, role-specific configuration sections;
- autosave, previous/next navigation, and return to any section;
- an expandable right test panel available throughout configuration;
- product and role context in the top bar;
- undo, redo, change role, review/publish, and reset controls.

The navigation is the main readiness guide. Status labels such as `Configured`, `Needs attention`, `Not reviewed`, or `Not tested` are informational. There is no separate duplicated readiness panel.

The merchant may skip, revisit, or publish without completing every category, reviewing every section, or running every suggested test. Warnings remain visible and actionable but do not substitute DJBOT's judgment for the merchant's decision. Technical, security, legal, entitlement, and external-action invariants may still block the affected operation.

### 9.2 Shared business and knowledge sections

All roles include:

- editable business profile and customer-facing identity;
- bot name, primary language, greeting, tone, and disclosure;
- connected knowledge sources with status and approved use;
- editable FAQs;
- conflict policy, source visibility, and information the bot must never invent;
- generated agent objective, conversation behavior, and boundaries.

### 9.3 Customer Support configuration

Left navigation:

1. Business profile and identity.
2. Support knowledge and FAQs.
3. Issue-handling behavior.
4. Customer details and handover.
5. Text experience or Voice experience.
6. Test your bot.
7. Publish, then install and verify.

Behavior path:

`Identify issue -> Collect context -> Check policy -> Guide resolution -> Confirm or escalate`

Controls include question limit before handover, failed-resolution escalation threshold, prohibited automated cases, customer information purpose, handover trigger, route, hours, and preserved context.

### 9.4 Sales Associate configuration

Left navigation:

1. Business profile and identity.
2. Products, services, and FAQs.
3. Sales behavior and objections.
4. Leads and appointments.
5. Human handover.
6. Text experience or Voice experience.
7. Test your bot.
8. Publish, then install and verify.

Behavior path:

`Discover need -> Qualify fit -> Recommend -> Handle objection -> Book or hand over`

Controls include discovery depth, recommendation count, sales boundaries, customer concerns and approved responses, lead qualification fields/rules, appointment actions, and human-handover routes.

### 9.5 Appointment Booking configuration

Left navigation:

1. Business profile and identity.
2. Services and FAQs.
3. Booking behavior and rules.
4. Availability and customer details.
5. Changes, fallback, and handover.
6. Text experience or Voice experience.
7. Test your bot.
8. Publish, then install and verify.

Behavior path:

`Choose service -> Collect details -> Check availability -> Confirm summary -> Create appointment`

Controls include bookable service/duration, request-versus-confirmation policy, timezone behavior, minimum notice, booking window, calendar authority, customer details, rescheduling, cancellation, provider failure, and handover.

The bot may show `Confirmed` only after authoritative calendar/provider success. Otherwise it records an appointment request for merchant confirmation.

### 9.6 AI Text modality controls

Text experience controls include:

- suggested replies;
- business-link behavior;
- conversational versus compact-form data capture;
- response formatting;
- customer/source-link visibility;
- customer-facing reply limit.

Every AI Text customer reply is limited to 200 visible characters, not 200 words. The runtime validates/truncates safely before delivery. This limit also applies to configured greetings and disclosures where shown as customer-facing messages.

### 9.7 AI Voice modality controls

Voice experience controls include:

- provider-neutral voice choice;
- speaking speed;
- interruption behavior;
- silence handling;
- name/number readback;
- maximum call duration;
- AI/transcription/recording disclosure;
- low-transcription-confidence behavior;
- repeated-misunderstanding recovery;
- transfer-unavailable fallback;
- recording choice with required consent.

The Voice runtime first generates/validates written content within 200 visible characters, then produces speech. Voice testing uses a voice-call simulation or approved microphone test rather than a text-only chat pretending to be voice. The visual demo never requests microphone permission.

### 9.8 Role changes after onboarding

Changing the draft role opens an impact dialog. Shared identity, language, knowledge, privacy, and handover contacts are retained. Role behavior, information fields, suggested tests, reports, and permitted actions use the new role defaults and are marked for attention. The currently published version and live traffic do not change until a new version is explicitly published and deployed.

## 10. Testing, review, publishing, and deployment rules

### 10.1 Persistent tester

The right panel may switch between draft and published configuration where supported. It shows the simulated/real response, configuration evidence, role behavior, length evidence, and a clear statement that no external action occurred.

Text uses a message composer. Voice uses a voice control and transcript/evidence. Mobile uses a full-width/focused test panel with a stable return path.

### 10.2 Optional quality work

- Suggested tests are optional.
- Custom tests are optional.
- Reviewing every section is optional.
- Resolving every content warning is optional.
- The merchant may publish whenever the bot performs well enough for their business.

The UI must say what remains untested or needs attention without using disabled progress gates that force compliance with recommendations.

### 10.3 Publish review

The publish dialog states:

- current warnings and suggested tests;
- the 200-visible-character runtime rule for Text/Voice;
- that publishing creates an immutable version;
- that publishing does not install the bot, send customer messages, or enable traffic;
- that the merchant may continue editing or publish with warnings.

### 10.4 Website installation

After publication:

1. display the tenant/deployment-specific snippet;
2. collect the website domain/allowed origin;
3. require the snippet action before verification;
4. verify the installation and origin;
5. offer an explicit **Go live** action;
6. allow traffic to be turned off again;
7. provide a clear **Enter Dashboard** action after verification.

No social connection is available in either free trial. Social remains a separate, release-gated Advanced setup.

## 11. Merchant dashboard

### 11.1 Access and relationship to configuration

The dashboard is available even when configuration is incomplete. In that state:

- the Configuration navigation item is highlighted;
- its state says `Not configured`;
- the top status says configuration is not published;
- Configure remains available as a direct action.

Configuration stays a dedicated full-page workspace. Both the dashboard and Configuration Studio provide a direct route to each other. Publishing or installation is never required merely to inspect the dashboard.

### 11.2 Dashboard navigation

Operate:

- Overview;
- Conversations;
- Contacts;
- Leads and follow-up;
- Appointments;
- Analytics.

Your bot:

- Configuration;
- Usage and plan.

The responsive dashboard uses a mobile navigation drawer and routed/focused content without losing the current product context.

### 11.3 Overview

The overview shows operational work, not decorative empty metrics:

- conversations;
- captured leads and capture rate;
- follow-up queue;
- Flow fallbacks or AI high-interest conversations;
- appointments;
- recent customer activity;
- owner follow-up actions;
- product/trial usage and remaining allowance.

### 11.4 Conversations and conversation detail

Conversation list supports search and filters for all, live now, leads, no lead, starred, and high interest. Rows show customer, company/time, Flow path/outcome or AI summary/next action, interest, lead stage, channel, saved state, and live takeover availability.

Conversation detail shows:

- transcript with customer, bot, and merchant actors;
- product/channel and pinned version;
- customer need, outcome/path, fallback or AI insight;
- contact and consent;
- lead stage and private merchant notes;
- appointment/follow-up context;
- star/save action;
- live takeover state.

### 11.5 Five-minute live takeover

The merchant may take over a conversation only when the most recent bot response is less than five minutes old. At exactly five minutes or later the live takeover action is unavailable and the merchant uses saved contact/follow-up instead.

On takeover:

- bot automation pauses;
- merchant messages have a distinct actor identity;
- the merchant can return control explicitly;
- AI Text/Voice returns to AI according to safe policy;
- Flow Bot returns to its main menu rather than guessing the prior branch.

The server, not the browser, authoritatively checks the timestamp and current conversation owner before accepting takeover or release.

### 11.6 Contacts, leads, and appointments

Contacts show identity, contact methods, preference, consent, and last activity.

Leads show goal, next action, interest, stage, and source. Stages include New, Follow up, Appointment, Keep nurturing, Won, and Not a fit. The merchant controls stage changes. Flow paths and AI analysis may inform but never automatically declare a won deal.

Appointments remain linked to the originating conversation and distinguish requested, confirmed, rescheduled, cancelled, and failed/unknown synchronization. Confirmation requires authoritative calendar success or an explicit merchant confirmation appropriate to the configured policy.

### 11.7 Analytics

Analytics supports 7-, 30-, and 90-day periods and reports conversations, lead capture, Flow fallback rate or AI interest, appointments, merchant-confirmed wins, top customer goals, and lead-pipeline outcomes.

Flow analytics comes from deterministic paths, button selections, forms, fallbacks, and pinned versions. AI interest and goals are analysis, not merchant decisions. Revenue must not be invented from conversation activity.

### 11.8 Usage and plan

Usage remains product-specific:

- Flow: customer conversations;
- Text: committed AI replies;
- Voice: connected minutes.

The page shows plan/trial, used, remaining, allowance, period, and applicable warning/fallback policy. It must not merge meters across products or expose provider/model/token identifiers.

## 12. End-customer behavior

### 12.1 Flow Bot customer

The customer opens the website widget, reads the merchant-approved greeting, chooses buttons or enters allowed text, moves through ordered messages/cards/forms, and receives an honest completion, fallback, or handover state. Forms preserve entered values on recoverable error. An appointment request is not presented as confirmed without authority.

### 12.2 AI Text customer

The customer asks a natural-language question. The bot answers from approved business knowledge within 200 visible characters, follows the selected role, handles low confidence through clarification/fallback/handover, and asks for customer details only when useful and consented. When a Text trial is exhausted or expires, it stops generating new AI replies and uses the approved subscribe/business-contact fallback without exposing internal quota/provider details.

### 12.3 AI Voice customer

The customer explicitly starts the voice experience before microphone permission is requested. The interface exposes connecting, listening, speaking, interruption, mute, end, recovery, transfer, usage/time warning, and ended states. Spoken replies follow the same role, knowledge, action-integrity, and 200-visible-character written-response rule.

## 13. Errors, dialogs, and recovery states

The maintained implementation must cover these states even if production wording is refined:

| Surface | State | Required recovery |
| --- | --- | --- |
| Account | Required identity/legal field missing | Identify fields; retain valid values |
| Account | Card missing/invalid when required | Explain required card fields; do not submit |
| Trial | Ineligible/repeated trial | Preserve account; offer paid plan/support without leaking abuse signals |
| Trial | 20% Text allowance remaining | In-platform warning plus owner email |
| Trial | Allowance exhausted or 30 days elapsed | Stop new trial service; preserve merchant access according to approved retention policy; show subscription action |
| Website source | Invalid URL | Ask for a complete public HTTP/HTTPS address or manual entry |
| Website source | Authorization not confirmed | Require confirmation or manual entry |
| Crawl | Running | Durable task progress and cancel/back behavior |
| Crawl | Partial/blocked pages | Retry, use accessible public pages, or manual entry |
| Crawl | Failed | Preserve source input and manual alternative |
| Configuration | Draft autosave succeeds | Visible saved state |
| Configuration | Autosave/network conflict | Preserve local work; compare/reload/retry without silent overwrite |
| Role change | Different role selected | Show kept, attention, and protected impacts before confirmation |
| Test | External action proposed | Simulation only; no production side effect |
| Publish | Advisory warnings | Continue editing or publish with warnings |
| Publish | Structural/safety invariant fails | Identify exact blocking item and link to repair surface |
| Install | Snippet not copied/present | Keep verification unavailable or report missing loader |
| Install | Domain invalid | Require a complete HTTPS origin |
| Install | Verification fails | Preserve domain and snippet; explain retry |
| Go live | Not published or not verified | Do not enable traffic; show missing prerequisite |
| Takeover | Latest bot response is 5 minutes old or older | Disable live takeover; direct to follow-up |
| Takeover | Ownership changed concurrently | Refresh authoritative owner/state; do not send as wrong actor |
| Appointment | Provider result unknown | Show pending/failed sync, never confirmed |
| Usage/provider | Limit, cap, or provider failure | Use merchant-approved fallback; hide internal provider details |
| Reset | Merchant requests local/demo reset | Confirm scope before clearing local demo state |

Dialogs include role-change impact, publish review, Flow publish review, and destructive/reset confirmation. Toasts may confirm reversible local actions but cannot be the only record of a consequential production result.

## 14. Responsive and accessibility contract

- All critical flows support desktop, tablet, and mobile without overlapping controls.
- Desktop Configuration Studio uses left navigation, central task surface, and expandable right tester/editor.
- Mobile configuration turns navigation and tester into focused drawers/sheets with explicit close/back controls.
- Dashboard tables transform to readable routed/cards or scroll-safe layouts; no critical action exists only on hover.
- Keyboard users can navigate templates, configuration sections, controls, dialogs, Flow nodes through an accessible alternative, and dashboard actions.
- Focus is trapped/restored correctly in dialogs.
- Status is not communicated by colour alone.
- Errors are associated with fields and summarized where needed.
- Thai and English text, dates, numbers, and line breaking are locale-aware.
- Progress animation respects reduced-motion preferences and never represents fabricated internal reasoning.
- Customer widgets and critical merchant workflows target WCAG 2.2 AA.

## 15. Approved demo versus production implementation

The approved demo intentionally simulates:

- registration, login, card entry, checkout, and trial provisioning;
- website crawling and AI draft generation;
- draft and published bot responses;
- microphone/voice interaction;
- snippet verification and go-live;
- conversations, CRM records, appointments, analytics, usage, and merchant replies.

Production must replace each simulation with tenant-scoped, server-authoritative behavior. It must preserve the approved screens, choices, separation of states, optional quality checks, and error recovery. Production may refine copy and visual spacing, but it may not reorder the product choice, merge the three onboarding flows, force optional review/testing, hide dashboard access, or remove explicit publish/install/go-live controls without new approval.

## 16. Decision-gated items

These are not approved merely because a related screen exists:

- automatic paid conversion or charge after the AI Text trial;
- trial-data retention/deletion periods;
- repeat-trial and abuse-prevention thresholds;
- additional Text-trial warning recipients beyond the account owner;
- social-channel general release timing;
- SMS or push delivery where the notification policy does not approve it;
- production provider/model choice visible to merchants;
- exact legal, tax, refund, dunning, overage, and carrier terms still awaiting the designated approval gate.

When one of these decisions is approved, update this contract, the PRD, the relevant architecture section, the UI/UX plan, the implementation work package, and acceptance evidence in the same change.
