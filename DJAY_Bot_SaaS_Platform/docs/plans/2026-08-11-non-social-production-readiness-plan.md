# DJAY Bots non-social production readiness plan

| Field | Value |
| --- | --- |
| Date | 2026-08-11 |
| Status | Implementation in progress; core website vertical slices pass local gates and sellability remains fail-closed |
| Runtime authority | `DJAY_Bot_SaaS_Platform` |
| Experience authority | `docs/design/djay-bots-approved-experience-contract.md` |
| Protected reference | `FlowBot_V1_App` remains read-only |
| Initial release target | Flow Bot Starter, AI Text Bot Starter, and AI Voice Bot Starter on the website channel |
| Deferred scope | LINE, Messenger, WhatsApp, Instagram, social OAuth, social webhooks, social delivery, and social add-ons |

> **2026-08-13 experience reconciliation:** This plan predates the approved package-first merchant
> journey. Statements about the 2026-08-11 goal-first implementation are historical evidence, not
> target UX authority. New work must follow Landing -> Pricing -> bot family -> package -> Subscribe
> or eligible Free trial -> account/provisioning -> family-specific onboarding. AI Text and AI Voice
> role selection follows the product/package decision.

## Core implementation checkpoint

The first core implementation checkpoint was reached on 2026-08-11. It does not complete every deliverable in this plan. The authoritative checkpoint record is
`docs/validation/non-social-production-readiness-2026-08-11.md`.

- The legacy goal-first website preference capture, legal acceptance, support access, public decision pages, and Platform support operations are implemented. The preference capture still requires reconciliation behind the approved package-first journey.
- Flow Bot has synchronized guided and editable infinite-canvas authoring with safe autosave, conflict recovery, immutable publish history, and rollback.
- AI Text Bot has guided playbook authoring, website-only merchant presentation, immutable version history, rollback-as-new-version, and current-session pinning.
- Voice Studio protects unsaved work; its runtime retains fail-closed admission, disclosure-first media, interruption, reconnect, exact settlement, capacity controls, and provider confidentiality.
- Merchants have a tenant-scoped Appointments queue for reviewing proposals, confirming a valid option, progressing outcomes, and recording notes.
- Social and telephone acquisition surfaces are deferred without deleting their separately governed regression-tested back ends.
- All six packages remain `sellable: false`. Local completion does not fabricate staging, legal, commercial, provider, browser, or named-merchant evidence.
- The requirement-by-requirement completion audit remains active. Flow history/path simulation, support attachments/feedback, entitlement-derived support service classes, expanded authoritative lifecycle notification coverage and its proposed machine-readable channel policy, customer/callback/value history, provider-confirmed appointment reconciliation with repeat rescheduling and reviewed dead-letter recovery, safe operational CSV exports, cross-bot aggregate merchant reporting, current-version bot regression evidence, role-filtered Platform routes, audited Tenant 360, tenant-linked incident operations, and the unified gate are implemented; unmocked email delivery and product/legal approval of that policy, unmocked calendar-provider acceptance, human approval of the existing executable bot quality packs/thresholds, remaining Platform component work, and browser acceptance remain work.

## 1. Outcome

Deliver one production SaaS in which a non-technical Thai merchant can:

1. Understand the exact offer and current availability.
2. Review all three bot families and their packages on Pricing, then choose the bot family and package before onboarding.
3. Choose Subscribe or an eligible Free trial, then register, verify email, accept current legal documents, and provision the tenant safely.
4. Complete the selected family-specific onboarding: deterministic template setup for Flow Bot, or role-guided setup for AI Text Bot and AI Voice Bot.
5. Test the bot in a safe environment that creates no customer side effects or billable usage.
6. Publish and install the bot on an approved website origin.
7. Receive conversations, leads, appointment requests, and handovers.
8. Operate those outcomes from Inbox, Contacts, Leads, Appointments, and a customer timeline.
9. See allowance, estimated value, service health, billing state, and support history.
10. Request help at any point and receive an accountable platform response.

The platform must prove tenant isolation, entitlement enforcement, recovery, privacy, accessibility, provider confidentiality, billing integrity, and production operations with non-skipping evidence.

## 2. Release decision and catalogue boundary

### 2.1 Starter release train

The first independent sellability targets are:

- `flowbot_basic`: website Flow Bot.
- `ai_chat_basic`: website AI Text Bot.
- `voice_basic_gen1`: website AI Voice Bot.

Each package receives its own acceptance gate. One package may become sellable without making another package sellable.

### 2.2 Advanced packages

The current Advanced catalogue promises capabilities that are outside this plan:

- `flowbot_premium` promises one social channel.
- `ai_chat_premium` promises one social channel.
- `voice_advanced_gen2` promises inbound telephone integration and has no approved carrier.

Therefore:

- Complete and test all non-social Advanced functionality behind internal or named-pilot flags.
- Keep all three Advanced packages `sellable: false`.
- Do not remove promised features silently.
- Do not advertise an Advanced package as available until its complete contracted capability passes acceptance.
- If the owner wants web-only Advanced packages earlier, create and approve a new catalogue and PRD version before changing implementation or copy.

### 2.3 Deferred social code

Existing social code remains present, disabled, entitlement-protected, and regression-tested for confidentiality. This plan does not extend, activate, submit, or market it.

## 3. Design direction

### 3.1 Design read

Reading this as a redesign of a Thai-first B2B SaaS for non-technical merchants, with a calm, trustworthy, high-clarity language and restrained product motion.

### 3.2 Taste-skill scope

Use `design-taste-frontend` for:

- Public homepage.
- Pricing and package comparison.
- Templates and educational pages.
- Registration, verification, login, legal review, and checkout-return presentation.
- Public help and status pages.
- Visual design pre-flight and anti-template review.

Do not use landing-page patterns for:

- Merchant dashboards.
- Data tables.
- Multi-step setup.
- Flow authoring.
- Platform Master operations.

For those product surfaces, extend the existing accessible DJAY product system with semantic HTML, shared CSS tokens, task-first layouts, restrained motion, and reusable components. Do not introduce a second visual system without an ADR.

### 3.3 Public-site dials

- `DESIGN_VARIANCE: 6`: distinctive but trustworthy.
- `MOTION_INTENSITY: 4`: state and hierarchy motion only.
- `VISUAL_DENSITY: 4`: concise acquisition pages with complete decision information.

### 3.4 Product UI rules

- Thai is the default; English is complete and selectable.
- Preserve the existing green and gold brand family.
- Consolidate semantic tokens for surfaces, text, borders, status, focus, spacing, radii, shadows, and layering.
- Use one radius rule: controls 8px, content panels 14px, pills only for compact state or filters.
- Use cards only for real hierarchy; use spacing and dividers for ordinary groups.
- Labels stay above fields; help precedes action; errors stay below the affected field.
- Every async surface has loading, empty, success, error, denied, stale, conflict, and retry states.
- Motion communicates feedback or state changes and honors reduced motion.
- Public pages support system light and dark themes. Product workspaces prioritize one high-contrast light theme for operational clarity unless a separate dark-theme acceptance package is approved.
- Never expose providers, models, credentials, internal cost, tenant IDs, or entitlement keys in merchant copy.
- Ban fake metrics, placeholder testimonials, fake screenshots, unsupported outcome claims, duplicate CTA intent, and ambiguous package states.

## 4. Program controls

Before feature work continues:

1. Preserve the current dirty worktree. Do not reset or bulk-revert it.
2. Inventory every modified and untracked SaaS path and assign an owner/work package.
3. Reconcile migrations `0088` and `0089` with migration invariants and rollback notes.
4. Run the current baseline on Node 24 and a disposable PostgreSQL 16 database.
5. Split work into reviewable commits by domain. Do not mix public design, tenancy, bot runtime, and release evidence in one commit.
6. Update the 297-requirement registry as work progresses. A route or component is not acceptance evidence by itself.
7. Add one work-package record for every started vertical slice that lacks one.
8. Keep package sellability fail-closed throughout implementation.

### Baseline exit gate

- `pnpm verify` passes.
- `pnpm test:db` passes from a clean database with every migration.
- Existing P4, P5, P7, P9, release-artifact, abuse, and negative suites pass or have an approved defect record.
- No test reports success because infrastructure or credentials were missing.
- Worktree ownership and commit sequence are documented.

## 5. Phase 1: shared design system and information architecture

### Deliverables

1. Audit the public site, Tenant workspace, Platform Master, widget, and all bot studios.
2. Record current brand tokens, route map, navigation, responsive behavior, analytics hooks, accessibility behavior, and content voice.
3. Create shared primitives for:
   - Page header and task header.
   - Buttons and links.
   - Form field, help, and validation.
   - Alert, notice, and status summary.
   - Dialog and confirmation.
   - Tabs and segmented controls.
   - Empty, loading, error, and denied states.
   - Data list, filter bar, pagination, and responsive table alternative.
   - Support entry point.
4. Reduce repeated CSS and component variants without changing route contracts.
5. Define a documented z-index scale and responsive breakpoints.
6. Add visual-regression baselines for the public and launch-critical product surfaces.

### Acceptance

- The same action has the same label, placement, status language, and interaction across products.
- Navigation fits one desktop line and has an explicit mobile pattern.
- Keyboard focus, contrast, zoom to 200 percent, reduced motion, and mobile reflow pass.
- Public-site taste-skill pre-flight has a machine-checkable subset for copy, CTA, typography, theme, layout, and motion rules.

## 6. Phase 2: identity, tenancy, legal, and account lifecycle

### Deliverables

1. Complete registration, email verification, resend, login, logout, password recovery, MFA, session revocation, invitation, role changes, ownership transfer, and account recovery.
2. Keep Public, Tenant, and Platform identities on separate cookies, audiences, routes, guards, and database roles.
3. Provision tenant, first workspace, owner membership, default policies, onboarding, audit records, and eligible subscription atomically.
4. Enforce exactly one active Tenant Master Admin until an approved ADR changes it.
5. Complete role and permission coverage for owner, administrator, designer, human agent, analyst, billing manager, and support grant.
6. Complete legal-document fail-closed loading, version acceptance, re-consent policy, and evidence export.
7. Complete tenant closure, paid-term end, read-only period, export window, production purge, backup expiry, and legal-hold behavior.
8. Add bounded distributed rate limiting and trusted-proxy identity handling.
9. Remove secrets and personal data from query parameters, referrers, logs, and public errors.

### Acceptance

- Cross-tenant substitutions return non-revealing not-found responses and change no data.
- Browser-supplied tenant, role, plan, and entitlement values never become authority.
- All privileged actions create immutable audit evidence.
- Registration cannot proceed with missing or stale legal authority.
- Recovery and invitation tokens do not appear in request targets after initial compatibility handling.
- Tenant deletion and export are proven on a disposable production-like database and object store.

## 7. Phase 3: catalogue, billing, usage, and finance

### Deliverables

1. Render exact first-term price, regular renewal price, currency, annual interval, allowance, limits, overage policy, tax display, exclusions, and availability from immutable catalogue authority.
2. Replace the public Pricing placeholder with authoritative values and honest package states.
3. Complete server-side purchase intent, Stripe Checkout, signed webhook inbox, idempotent subscription application, return-state reconciliation, and Portal access.
4. Complete upgrade, downgrade preflight, cancellation, paid-term retention, failed-payment recovery, refunds, disputes, credits, and invoice evidence.
5. Enforce monthly allowance periods, hard stops where overage is not approved, usage alerts, safety caps, packs only when policy is accepted, and reconciliation.
6. Make usage reservations and settlement atomic for Flow executions, AI replies, and Voice minutes.
7. Resolve Thai tax, VAT invoice, withholding, numbering, and accounting authority before paid GA.
8. Complete FlowAccount integration or retain a hard paid-GA block. A manual process is not represented as an integration.
9. Add finance and platform exception queues with separation of duties.

### Acceptance

- Price and package details match across public pages, checkout review, Stripe, confirmation, invoice, Portal, renewal notice, workspace billing, and Platform Master.
- Duplicate and reordered webhooks create one state transition.
- No package can charge while `sellable: false` or while its Stripe mapping is not `live_ready`.
- Meter events reconcile exactly to customer allowance and restricted native usage.
- A real test purchase, refund, failed payment, Portal change, and receipt pass before any live transaction.

## 8. Phase 4: package-first acquisition, family-specific onboarding, and support

### Deliverables

1. Preserve migration `0089_goal_first_onboarding` as historical preference storage while adapting its API/UI behind the approved package-first sequence.
2. Carry the chosen bot family, package, and purchase/trial intent from Pricing into account creation and successful provisioning; never ask for business goals before this decision.
3. Route Flow Bot to deterministic template setup. Route AI Text Bot and AI Voice Bot to role selection, then website/manual business learning, safe processing, editable review, and the full-page Studio.
4. Treat role-specific goals and behavior as editable configuration guidance, not as a second product selector.
5. Recommend a reversible template and next action from the selected family and role.
6. Derive progress from server-authoritative facts. Never let a browser button mark setup complete.
7. Provide skip, back, save-and-exit, resume, and change-later behavior. Suggestions, testing, and review are advisory; only structural or safety invariants block publishing.
8. Keep support access visible on every onboarding screen.
9. Finish migration `0088_customer_support_center` and its ticket repository, tenant API, platform API, merchant UI, and operator UI.
10. Add support-board guides for registration, billing, each bot, website installation, testing, publishing, leads, privacy, and troubleshooting.
11. Add in-app support conversation updates, attachments with malware scanning, ownership, priority, SLA state, notifications, audit, and closure feedback.
12. Route technical detail into optional expandable guidance. Default copy remains task-oriented.

### Acceptance

- A new merchant can leave and resume without losing valid work.
- Failed saves never advance completion.
- Analysts can view progress but cannot mutate onboarding.
- A merchant can open, read, reply to, and close a support request without email-only dependence.
- Platform support can triage, assign, request information, resolve, and audit tickets without tenant impersonation.
- A first-time Thai merchant completes the initial setup path with no provider terminology.

## 9. Phase 5: Flow Bot website production slice

### Merchant authoring

1. Keep two synchronized editing modes:
   - Visual infinite canvas for spatial users.
   - Guided outline/form editor for users who prefer a simple sequence.
2. The canvas supports create, select, move, duplicate, delete, drag-to-connect, reconnect, pan, zoom, fit, minimap, multi-select, and keyboard equivalents.
3. The guided editor supports node ordering, root selection, next-step selection, option branches, content, actions, and advanced settings.
4. Both modes edit one domain graph and never maintain competing definitions.
5. Add undo/redo, explicit save state, conflict handling, autosave after safe idle, and unsaved-navigation protection.
6. Preserve Advanced JSON as an expert repair surface, not the default experience.
7. Validate at interaction time; focus the exact invalid node or field.
8. Treat graph advisories as warnings unless the domain defines a genuine publish error.

### Test and publish

1. Simulate from any start node with deterministic sample input.
2. Overlay the traversed path on the canvas and show the equivalent outline steps.
3. Use the production Flow engine as execution authority. Do not reimplement traversal in the browser.
4. Preview lead, handover, appointment request, notification, and integration outcomes without external side effects or customer allowance use.
5. Publish immutable versions, pin active sessions, compare versions, roll back safely, and display draft/published/tested state.

### Website deployment and runtime

1. Create an exact-origin deployment with a one-time key and safe install snippet.
2. Verify host ownership or explicit approved origin control.
3. Run install health, origin, key, widget-load, CSP, and end-to-end response checks.
4. Support transcript replay, idempotent input, lead capture, human takeover, release to automation, fixed notifications, and safe typed actions.
5. Enforce bot count, topic, execution, seat, branding, analytics, and integration entitlements at every boundary.

### Acceptance

- A Thai keyboard-only merchant builds, tests, publishes, installs, and rolls back a branching website Flow Bot without JSON.
- Canvas and guided editor round-trip the same graph with no data loss.
- A wrong tenant, origin, deployment key, plan, or entitlement fails without revealing whether the target exists.
- Runtime replay produces one execution, lead, usage settlement, and notification.
- Three named pilots complete the full worksheet before self-service activation.

## 10. Phase 6: AI Text Bot website production slice

### Knowledge pipeline

1. Approve file types, file sizes, website crawl limits, OCR policy, retention, and vector-index provider policy.
2. Implement upload, object encryption, malware scan, extraction, normalization, chunking, indexing, revisioning, quarantine, retry, dead letter, deletion, and reconciliation.
3. Support PDF, DOCX, TXT, and bounded website ingestion only after their production controls pass.
4. Make citation source, freshness, failed pages, and stale revisions understandable to merchants.
5. Prevent prompt injection in documents or crawled pages from becoming system authority.

### Agent and playbook

1. Finish the guided AI Playbook editor for identity, goals, qualification, claims, objections, actions, escalation, tone, language, timezone, and knowledge pins.
2. Keep Advanced JSON optional and repairable.
3. Add draft, preview, quality test, immutable publish, rollback, and active-session pinning.
4. Add a merchant Test Center with approved question sets, expected behavior, citation inspection, unsupported-claim detection, prompt-injection tests, action previews, and regression history.
5. Use a restricted platform routing profile. Merchant DTOs never expose provider or model identity.

### Website runtime

1. Complete exact-origin deployment, widget, durable sessions, streaming, citations, lead capture, appointment request, notifications, handover, and release.
2. Reserve and settle AI allowance atomically.
3. Suppress the AI response and release usage when human takeover wins an in-flight race.
4. Add safe fallback for gateway, knowledge, action, notification, and queue failures.

### Acceptance

- Thai and English live-profile evaluations pass grounding, helpfulness, safety, sales behavior, latency, and provider-confidentiality thresholds.
- A named merchant accepts upload, crawl, editing, testing, installation, live conversations, handover, and rollback.
- Replaying a turn creates no duplicate model call, action, lead, appointment, message, or usage.
- Production uploads remain disabled until malware, extraction, deletion, and quarantine evidence passes.

## 11. Phase 7: AI Voice Bot website production slice

### Runtime and experience

1. Keep Voice admission paused by default until the release gate authorizes it.
2. Complete deployment, exact-origin grant, microphone permission, automated-agent disclosure, start, mute, interruption, silence warning, reconnect, end, and terminal settlement.
3. Complete Thai and English speech recognition, synthesis, turn planning, grounded knowledge, qualification, callback requests, appointment requests, and handover.
4. Preserve immutable agent and playbook pins through reconnect.
5. Store transcripts and summaries according to tenant retention. Keep audio recording off unless policy, consent, storage, deletion, and access controls are separately approved.
6. Complete concurrency reservation, minute rounding, usage settlement, stale-session reaping, gateway capacity, pause, resume, and emergency stop.
7. Provide merchant call history, outcomes, callbacks, transcript access, quality evidence, and safe deployment controls.

### Live acceptance

1. Define approved Thai and English thresholds for transcript accuracy, response latency, interruption, silence, noise, reconnect, disclosure, action completion, and callback handover.
2. Run controlled staging evaluation with real browsers, microphones, networks, and approved provider routing.
3. Run load, capacity, gateway restart, provider outage, and stale-session recovery tests.
4. Complete spend reservation using approved rates. Do not invent costs.

### Telephony boundary

Telephone is not social, but it has an external carrier dependency. Complete carrier selection, Thai number availability, SIP/media sandbox, transfer, DTMF, CDR, pricing, failover, and legal acceptance as a separate release train. It does not block website Voice Starter. It does block Voice Advanced.

### Acceptance

- Website Voice passes the approved Thai and English live quality thresholds.
- One interrupted, reconnected, completed call settles exactly once.
- One emergency stop terminates active and reconnecting sessions safely.
- A named merchant accepts the website installation, customer disclosure, live quality, callback workflow, retention, and rollback.

## 12. Phase 8: merchant operations and measurable value

### Inbox

- Unified website conversations across all three bots.
- Search, unread, bot, owner, priority, status, and SLA filters.
- Assignment, internal notes, human takeover, reply, release, bulk-safe actions, and pagination or virtualization.
- Clear channel and bot identity without exposing provider internals.

### Contacts and customer timeline

- Tenant-safe contact creation, duplicate suggestions, explicit merge review, export, erasure, consent, and suppression.
- One timeline for bot messages, human replies, leads, appointments, callbacks, outcomes, support-relevant events, and audit-safe references.

### Leads

- Pipeline stage, owner, priority, next action, due date, expected value, source bot, qualification evidence, won/lost reason, and notes.
- Saved filters, overdue queue, assignment, bulk-safe updates, and CSV export.
- No automatic merge based only on unverified identity similarity.

### Appointments and callbacks

- Availability profiles with IANA timezones.
- Request, merchant confirmation, reschedule, cancel, reminder, `.ics`, signed self-service link, and no-show/completed outcome.
- Email and in-app notifications. Social notification is deferred.
- DST, midnight, locale, and duplicate-request tests.

### Value analytics

- Durable definitions for qualified, booked, attended, won, lost, value, and staff time saved.
- Merchant-configurable values with effective dates.
- Conservative attribution rules and drill-down to supporting events.
- Separate operational usage from customer outcome reporting.
- Never invent revenue or savings.

### Acceptance

- A merchant handles a bot-created lead and appointment without spreadsheets or Platform intervention.
- Every dashboard total drills down to tenant-scoped durable records.
- Exports match visible filters and preserve privacy restrictions.

## 13. Phase 9: Platform Master, support, and internal operations

### Deliverables

1. Split the Platform Master monolith into role-specific routes and components without weakening guards.
2. Provide Tenant 360 with identity, subscriptions, entitlements, usage, deployments, incidents, support, privacy jobs, and audit references.
3. Complete queues for provisioning, billing, usage anomalies, reconciliation, support, privacy, provider health, dead letters, and release readiness.
4. Keep provider routing restricted to Platform Owner or delegated AI Operations with recent reauthentication and immutable audit.
5. Implement two-person support grants, scoped duration, explicit tenant approval where required, access evidence, revocation, and review.
6. Add incident creation, severity, owner, timeline, customer impact, mitigation, resolution, credit-review separation, and post-incident review.
7. Add catalogue and promotion governance with versioning, two-person approval for sensitive changes, preview, effective date, and rollback.
8. Add operational dashboards for SLO, queues, usage, costs, provider health, capacity, backups, restore age, and security evidence.

### Acceptance

- Every operator role sees only its authorized resources and commands.
- Mid-session role or identity change purges old data and drafts.
- Support never receives raw tenant database access or provider credentials.
- Sensitive finance, provider, incident-credit, and catalogue actions enforce separation of duties.
- Platform operations remain usable at desktop and tablet widths with keyboard navigation.

## 14. Phase 10: security, privacy, reliability, and observability

### Security

- Threat model each public, tenant, platform, widget, worker, provider, and voice boundary.
- Complete SAST, dependency, secret, container, IaC, and license scanning.
- Complete CSRF, origin, cookie, CSP, CORS, SSRF, upload, injection, IDOR, replay, abuse, and rate-limit tests.
- Rotate production secrets and prove old credentials fail.
- Commission an external penetration test and close every Critical and High finding.

### Privacy

- Finalize data inventory, legal basis, controller/processor roles, subprocessors, retention, consent, DSAR, erasure, export, legal hold, suppression, breach, and international-transfer evidence.
- Implement every retention claim before publishing it.
- Complete contact/lead sweeps, export-object purge, tenant closure, and backup expiry.
- Obtain counsel approval for public documents and unresolved retention conflict.

### Reliability

- Production GCP project, IAM, Secret Manager, Cloud SQL/PostgreSQL, queues, object storage, services, workers, voice gateway, domains, certificates, and recovery region.
- Health, readiness, startup, backlog, capacity, and dependency status for every service.
- Structured logs, metrics, traces, correlation IDs, SLOs, alerts, dashboards, and on-call ownership.
- Idempotent outbox/inbox, bounded retries, dead letters, replay tools, and reconciliation.
- Backup, point-in-time recovery, object restore, cross-region recovery, and documented RPO/RTO drills.
- Kill switch for charging, bot activation, AI routing, Voice admission, and external actions.

### Acceptance

- Clean restore produces a working isolated tenant and reconciled immutable evidence.
- Dependency outages degrade safely and recover without duplicate customer effects.
- Kill-switch and recovery drills have timestamps, operators, build IDs, outcomes, and follow-up actions.
- No production service starts with example, quoted, missing, or malformed secrets.

## 15. Phase 11: release gate and evidence

Build one non-skipping `release:gate` command:

```text
verify Node 24 and lockfile
-> provision clean PostgreSQL 16 and object storage fixtures
-> apply every migration and seed controlled tenants
-> start all required applications and workers
-> wait for health and readiness
-> run unit, type, lint, boundary, and contract suites
-> run database RLS, role, migration, idempotency, and recovery suites
-> run Flow, AI Text, Voice, merchant operations, billing, and Platform E2E
-> run release accessibility with AXE_REQUIRE=true
-> run visual regression, responsive, localization, and taste-skill public pre-flight
-> run performance, load, outage, backup, restore, and security gates
-> run package-specific sellability gate
-> emit a content-addressed evidence bundle
```

### Gate behavior

- Missing infrastructure fails.
- Missing credentials fail the applicable staging gate.
- Skipped required tests fail.
- Stale evidence fails.
- A passing build without database and browser evidence is not a release pass.
- Each package has an independent evidence manifest and authorized reviewers.

## 16. Phase 12: staged rollout

For each Starter package independently:

1. Internal tenant with synthetic data.
2. Named design-partner tenant with real configuration but controlled customer traffic.
3. Paid pilot with one real transaction and explicit rollback point.
4. Limited self-service cohort.
5. General availability only after soak and incident review.

### Required release evidence

- Product-owner acceptance.
- Security acceptance and pen-test disposition.
- Privacy/counsel acceptance.
- Finance and tax acceptance.
- Stripe live mapping and real receipt.
- Named merchant sign-off.
- Production provider and quota acceptance for AI or Voice.
- Kill-switch, backup, restore, and recovery drills.
- Staging soak and production-pilot soak.
- Support staffing, runbooks, escalation, and status communication.

## 17. Test matrix

Every vertical slice must cover:

| Layer | Required evidence |
| --- | --- |
| Domain | Valid, invalid, boundary, state transition, and replay tests |
| Database | Constraints, forced RLS, same-tenant references, wrong-tenant negatives, migration invariants |
| Authorization | Every role, denied mutation, stale session, privilege change, support grant |
| API | Schema, idempotency, conflict, not-found confidentiality, safe errors, rate limits |
| Async | Claim, lease, retry, dead letter, replay, reconciliation, shutdown recovery |
| UI | Loading, empty, success, validation, transport error, conflict, denied, recovery |
| Accessibility | Keyboard, screen reader semantics, axe, focus, contrast, zoom, reduced motion |
| Localization | Thai default, complete English, no leakage, locale-safe dates/numbers/currency |
| Responsive | 390px mobile, tablet, 1365px desktop, 200 percent zoom |
| Security | Tenant substitution, provider leakage, secret scan, injection, abuse, origin and token handling |
| Performance | Web Vitals, API latency, queue age, widget size, Voice latency, load and capacity |
| Operations | Metrics, alert, runbook, support diagnosis, rollback, restore, kill switch |

## 18. Requirement and work-package mapping

Use the existing work-package model. Add missing records when execution starts.

| Plan phase | Principal work packages |
| --- | --- |
| Program controls | `CTRL-01`, `CTRL-02`, `GA-01` to `GA-04` |
| Identity and tenancy | `CORE-01`, `CORE-02`, `CORE-03` |
| Commerce | `COM-01` to `COM-03`, `BILL-01`, `BILL-02`, `FIN-01`, `FIN-02` |
| Flow Bot | `FLOW-01` to `FLOW-03`, `WEB-01` |
| AI Text Bot | `AI-01` to `AI-03`, `AI-06`, `WEB-01` |
| AI Voice Bot | `VOICE-01`, `VOICE-02`, `VOICE-05`, `VOICE-06`, `WEB-01` |
| Merchant operations | `OPS-01` to `OPS-05`, `INT-01` without social notification |
| Platform operations | `PLAT-01` to `PLAT-04` |
| Cloud and release | `CLOUD-01` to `CLOUD-05`, `GA-01` to `GA-04` |

Deferred social work packages are `CHAN-01`, `FLOW-04`, and `AI-05`. Social portions of shared work packages remain blocked and are not silently marked accepted.

## 19. Definition of done

### Engineering complete

- Implementation, migration, rollback, tests, security, privacy, observability, and runbook exist.
- Clean-database and production-build gates pass.
- No placeholder, fake data, disabled required action, or undocumented manual repair remains.

### Staging verified

- Production topology, real provider sandbox or controlled live profile, browser journeys, load, outage, backup, restore, and support operations pass.
- Evidence records environment, build, commands, timestamps, results, and reviewers.

### Accepted

- Product, Security, Privacy, Finance, Operations, Support, and named merchant reviewers approve the applicable requirement set.
- No Critical or High defect remains open.
- Moderate defects have an owner, customer impact, mitigation, and approved deadline.

### Sellable

- Every shared and package-specific requirement is accepted.
- Stripe mapping is `live_ready`.
- Public copy matches the accepted capability.
- `sellable: true` is authorized explicitly and passes the package gate.
- Deferred social and Advanced packages remain unavailable without weakening Starter packages.

## 20. Immediate execution order

1. Freeze scope and reconcile the current dirty SaaS worktree.
2. Complete and test migrations `0088` and `0089` plus support/onboarding UI.
3. Run the clean baseline and repair all regressions.
4. Establish shared UI primitives and public taste-skill design baseline.
5. Complete identity, legal, tenant lifecycle, catalogue, billing, usage, and support foundations.
6. Complete Flow Bot website authoring, testing, publishing, deployment, and merchant operations.
7. Complete AI Text knowledge, playbook, evaluation, website runtime, and operations.
8. Complete AI Voice website live evaluation, operations, usage, and safety controls.
9. Complete Platform Master, privacy, security, reliability, observability, and recovery.
10. Build and enforce `release:gate`.
11. Run independent named-pilot and paid-pilot acceptance for each Starter package.
12. Flip only the package whose full evidence and approvals pass.

## 21. Owner-only and external blockers

Engineering can prepare evidence and fail-closed controls but cannot decide or fabricate:

- Thai VAT, withholding, invoice numbering, and accounting approval.
- Stripe production authority and live price mappings.
- Counsel approval and unresolved retention wording.
- OpenAI and Voice production account authority, quotas, rates, and quality thresholds.
- Telephony carrier contract and Thai number availability.
- GCP production project ownership, billing, regions, and recovery topology.
- Named merchant participation and acceptance.
- Product-owner authorization to change catalogue promises or enable sellability.

These tracks must begin in parallel with engineering because they are release dependencies, not final paperwork.
