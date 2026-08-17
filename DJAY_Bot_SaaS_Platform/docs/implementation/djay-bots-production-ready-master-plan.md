# DJAY Bots production-ready master plan

Date: 2026-08-17  
Scope: the complete approved DJAY Bots SaaS offer, including all six packages, merchant operations, Platform Master operations, Owner analytics, production infrastructure, external-provider evidence and controlled paid launch  
Starting point: local branch `agent/recovery-p6-start` at `2d6b937`, plus the current uncommitted audit/remediation work  

## 1. Purpose

This is the execution plan from the current repository state to a product that a real merchant can discover, buy, configure, deploy, operate, receive support for and be billed for without a prototype or manual engineering workaround in the critical path.

“Production ready” is an evidence state, not a description of how much code exists. The program is complete only when the approved requirements are implemented, verified in production-like staging, formally accepted by the responsible reviewers, safely enabled in production and proven during controlled live use.

This plan coordinates existing authorities; it does not replace them. Product behavior comes from the market-release PRD and approved experience contract. Owner analytics behavior comes from the approved Owner analytics contract. Detailed work-package mechanics remain in the existing V1 and Owner analytics implementation plans.

## 2. Authority and conflict order

Use this order when two artifacts disagree:

1. `docs/product/djay-bots-v1-market-release-prd.md`
2. `docs/design/djay-bots-approved-experience-contract.md`
3. `docs/design/djay-bots-approved-full-flow.html`
4. `docs/architecture/djay-bots-v1-market-release-architecture.md`
5. `docs/design/djay-bots-v1-ui-ux-and-user-flows.md`
6. `docs/implementation/djay-bots-v1-detailed-implementation-plan.md`
7. the executable requirement registry and current validation evidence
8. ADRs, historical plans and older demos

For Owner analytics, the approved V2 Owner analytics contract and its detailed implementation plan control their exact scope. They must be incorporated into the maintained repository before implementation begins.

No working-tree change becomes approved product behavior merely because its tests pass. A product-rule change requires explicit Product Owner approval and reconciliation across the PRD, experience contract, architecture, UX plan, implementation plan and executable registry.

## 3. Definition of 100% ready

The product is 100% ready only when all of the following are true:

- One maintained registry contains the complete 337-requirement baseline, including `PLT-011` through `PLT-025`.
- Every applicable requirement is `accepted`; none is `planned`, `in_progress`, `implemented`, `staging_verified` or `blocked`.
- All six package records are independently `sellable: true` after their own acceptance gates pass.
- Public discovery, package selection, purchase or eligible trial, account creation, onboarding, configuration, testing, publication, installation, verification, go-live and Dashboard operation are server-backed end to end.
- Flow, Text and Voice remain separate product experiences and satisfy every advertised Starter and Advanced capability.
- Merchant Inbox, contacts, leads, appointments, callbacks, analytics, notifications, integrations, team, billing, support and Configuration work with tenant isolation and role enforcement.
- Platform Master operations and the complete approved Owner analytics surface are implemented and accepted.
- Stripe, email, object storage, Calendar, AI Text, Voice, telephony, accounting and every released social/integration provider have unmocked staging evidence and production operational ownership.
- Security, privacy, legal, Thai tax/accounting, accessibility, performance, resilience, backup/restore, penetration testing and named-merchant usability gates pass.
- Production runs the accepted build and schema, packages are enabled only through reviewed controls, and rollback/kill switches have been exercised.
- Controlled pilots and the 30-day launch hypercare period close without an unresolved Severity 1/2 defect, material ledger mismatch, isolation failure or unowned operational exception.

The first useful commercial milestone is a production-ready **non-social release**. That milestone may launch package capabilities whose complete gates pass while social remains disabled. It is not the final “100% complete approved offer” state. The final state also requires every advertised social, telephony and advanced integration capability to be accepted, or an explicit Product Owner decision removing it from the offer and all authorities.

## 4. Current baseline

### Proven foundations

- P0-P9 local engineering established identity, tenant isolation, RLS, entitlements, usage, deterministic Flow, AI/Voice foundations, merchant operations, recovery and release-gate scaffolding.
- Version-bound legal acceptance and persistent one-time account onboarding exist outside the new Builder continuation.
- The public conversion path and package-first approved Builder are represented.
- Flow canvas editing, deterministic routes, bilingual choices, import and testing received substantial local hardening.
- Provider-neutral AI Text and Voice gateway foundations and multiple adapters exist.
- The last recorded non-social verification passed 102 migrations, database integration suites, `pnpm verify`, the release gate and diff checks.

### Material gaps

- `/build` is still a static reference projection rather than a durable production application.
- Anonymous drafts, imports, account claim, trials and deployment are not one server-authoritative lifecycle.
- Builder publication, installation, verification and go-live remain simulated.
- Live Text, Voice and external-service acceptance is not complete.
- The complete Tenant and Platform production-browser matrix is pending.
- Owner analytics is approved but not implemented; its V2 directory is not yet part of the tracked maintained source.
- The approved V2 baseline is now integrated into the maintained 337-requirement registry; none has formal acceptance.
- All six packages remain non-sellable.
- External legal, tax, security, provider, usability, staging and operational approvals remain open.

### Product Owner decisions recorded on 2026-08-17

The Product Owner approved a hard maximum of 200 locale-aware words for Text and Voice replies and 50 anonymous Builder AI test requests per signed 30-day session. Text continues to target roughly 40–80 words, Voice roughly 20–50 words, oversized output receives at most one preserving rewrite, direct string slicing is forbidden, and Voice enforcement occurs before text-to-speech.

## 5. Program controls

Every phase below uses the same delivery rule:

1. Name the owned requirement IDs and approved behavior.
2. Add or update failing tests for invariants and negative cases.
3. Implement domain, schema, RLS, API/event, service and UI changes as one vertical slice.
4. Add idempotency, audit, usage, entitlement and observability at the same time as the feature.
5. Prove loading, empty, error, conflict, denied, partial and dependency-failure states.
6. Deploy disabled to staging and exercise migration, backfill, rollback and reconciliation.
7. Record evidence against the exact build, image, schema and configuration.
8. Move registry status only as far as the evidence permits.
9. Require the named reviewer before `accepted` or `sellable: true`.

No phase may use a browser-supplied tenant, role, plan, entitlement, provider or model as authority. No provider/model identity may enter tenant or public DTOs, UI, logs, exports, invoices, notifications or customer-visible errors.

## 6. Dependency map

```text
PR-00 authority and baseline lock
  -> PR-01 working-tree recovery and repeatable CI
      -> PR-02 production application shell and durable anonymous draft
          -> PR-03 account, legal, onboarding and draft claim
              -> PR-04 catalogue, trials, Stripe and subscription lifecycle
                  -> PR-05 publish, install, verify and go-live authority

PR-02 + PR-03
  -> PR-06 Flow completion
  -> PR-07 AI Text completion
  -> PR-08 AI Voice completion

PR-03 + PR-04 + product slices
  -> PR-09 merchant operations completion
  -> PR-10 Platform operations and Owner analytics

All product and operations slices
  -> PR-11 deferred social, telephony and advanced integrations
  -> PR-12 cloud, security, compliance and operational readiness
      -> PR-13 staging acceptance and production pilot
          -> PR-14 package launch and hypercare closure
```

`PR-06`, `PR-07` and `PR-08` may run in parallel after their shared entry gates. Owner analytics data contracts and approved clickable-demo work may run in parallel with product slices, but production Owner UI cannot begin before its page-by-page demo approval.

## 7. Execution phases

### PR-00 — authority, scope and decision lock

**Outcome:** one unambiguous product baseline before more implementation accumulates.

Work:

- Record the approved 200-locale-aware-word Text/Voice policy and its preserving-rewrite behavior.
- Record the approved 50-request/30-day anonymous Builder AI test cap.
- Reconcile approved decisions across every normative artifact and the executable registry.
- Move the approved Owner analytics contract, plan and `PLT-011`–`PLT-025` registry records into the maintained tracked repository.
- Reconcile the maintained registry to exactly 337 requirements and preserve all six packages as non-sellable.
- Create an open-decision register for trial abuse/retention, alert thresholds, export retention, auto-charge, additional recipients, provider/model selection, telephony, accounting and social rollout.
- Freeze public names, package promises, prices, promotions, limits and internal compatibility aliases.

Exit gate:

- Registry validation passes at 337 unique requirements.
- No normative document disagrees about onboarding sequence, trials, reply limits, package scope or Owner analytics.
- Every open decision has an owner, due condition and safe disabled behavior.

### PR-01 — preserve and certify the current working baseline

**Outcome:** the August audit fixes become a reviewable, repeatable engineering checkpoint.

Work:

- Split the current uncommitted work into bounded commits: Flow/Builder UX, Text runtime, Voice adapter/test route, security/dependency, database reliability, documentation/registry.
- Review every change against the resolved `PR-00` authority; revert or amend unauthorized product-rule changes.
- Replace stale signup-first and legacy naming QA with tests of the approved Builder continuation.
- Add production-app identity and hydration preflight checks so dev+CSP mistakes cannot produce false browser verdicts.
- Run lint, typecheck, unit, build, full database migrations/integration, release gate and diff checks from a clean checkout.
- Run the appointment focused suite 20 consecutive times and three fresh full database suites using one database clock authority.
- Record the exact results in a new validation checkpoint.

Exit gate:

- Clean tracked baseline; no essential implementation remains only in untracked files.
- All mandatory local/CI gates pass repeatably.
- Requirement status reflects evidence without any acceptance inflation.

### PR-02 — replace the static Builder with a production application

**Outcome:** `/build` becomes a real server-backed application while retaining the approved interaction and design.

Work:

- Port the approved Builder into maintained application components with server-first locale, route-level error handling and accessible responsive states.
- Create a signed, expiring anonymous draft identity that carries no account authority.
- Add durable versioned drafts for family, package/trial intent, template/role, business profile, knowledge, translations, configuration and advisory test state.
- Implement idempotent import jobs with SSRF protection, redirect policy, allowlisted content types, limits, cancellation, retry, provenance and stale-job protection.
- Add complete EN/TH side-by-side translation resources, missing/stale states and review behavior for Flow, Text and Voice customer-facing content.
- Make test requests use one bounded, versioned contract with server-retrieved knowledge and prior-message context.
- Preserve drafts across refresh, locale switch, import failure and recoverable provider failure.
- Add accessible desktop/mobile/keyboard/reduced-motion coverage for all three onboarding branches.

Implementation checkpoint, 2026-08-17: the first server-authoritative slices are implemented in independent migrations `0107_anonymous_builder_drafts.sql` and `0108_anonymous_builder_import_jobs.sql` because Owner analytics reserves `0102`–`0106`. Signed session age is cryptographically bound, one server draft is recovered without a client-supplied draft ID, optimistic revisions preserve immutable snapshots, tenant runtime has no Builder-table access, and Text/Voice share one 50-request budget. Website imports are persisted, idempotent and bound to the exact draft revision; attempts are immutable, cancellation and retry are explicit, retry generation is bounded at three, and late or stale results cannot replace newer work. Text and Voice tests now retrieve business knowledge, role and behavior from the exact saved revision instead of accepting those authorities from the browser; translation requests are likewise exact-revision-bound and may translate only source strings present in that saved draft. Text/Voice greetings, AI disclosures, Voice opening disclosure and every FAQ question/answer now have durable side-by-side English/Thai records with missing, stale, review and current states. Missing or stale required copy blocks publication; complete but unreviewed copy remains advisory. Complete coverage of fallback, handover, booking/contact prompts and generated role messages, component extraction, account claim and authorized browser acceptance remain open; this checkpoint does not satisfy the PR-02 exit gate by itself.

Exit gate:

- A new anonymous user can configure any family, close/reopen the browser and recover the same server-owned draft.
- Cross-draft and cross-account substitution are denied without revealing resource existence.
- Import, translation, grounding and recovery matrices pass in Thai and English.

### PR-03 — account-at-deploy and one-time onboarding

**Outcome:** account creation happens at the approved moment and safely claims the configured draft.

Work:

- Connect registration, existing-account sign-in, verification resend/expiry, password recovery and MFA continuation to Deploy.
- Bind the exact server-current Terms and Privacy versions reviewed at registration.
- Atomically create the tenant, exactly one active Master Admin, membership and draft claim after verified identity.
- Preserve safe continuation through verification/login without exposing one-time values in query strings.
- Require guidelines and learner/merchant survey once per account version; save server-authoritatively and never mark completion after a failed write.
- Make duplicate registration, resend, verification and draft-claim operations idempotent.
- Add explicit recovery for conflicting ownership, expired drafts and existing emails.

Exit gate:

- New-account and existing-account E2E journeys reach the correct owned workspace with the exact draft.
- Survey completion persists once, survives logout/login and does not change on repeated completion.
- Cross-account and cross-tenant claim tests pass.

### PR-04 — catalogue, trials, payment and subscription lifecycle

**Outcome:** merchants can start an approved trial or pay under immutable commercial terms.

Work:

- Serve one immutable catalogue version to Pricing, registration, Checkout, entitlements, billing and Platform operations.
- Implement the Flow Starter trial: 30 fixed days, website only, 5,000 conversations and no card.
- Implement the Text Starter trial: 30 fixed days, website only, 500 committed AI replies, card verification at Deploy, one trial per approved payment-method fingerprint, warning at 100 remaining and no automatic end-of-trial charge.
- Keep Voice trial unavailable.
- Complete Stripe SetupIntent/Checkout, Customer, subscription, signed webhook inbox, order-independent processing, provisioning, Portal, cancellation, renewal, dunning, refund, dispute and reconciliation flows.
- Keep raw card/fingerprint data out of the platform; store only approved provider references and keyed eligibility evidence.
- Implement immutable invoices/credits and Thai accounting/FlowAccount integration after accountant/legal approval.
- Enforce entitlements, reservations, caps, packs and overages atomically at every boundary.

Exit gate:

- Test-mode purchase and trial matrices pass, including decline, 3DS, cancellation, replay, duplicate card, webhook reordering and provider outage.
- Catalogue, subscription, entitlement, usage, invoice and provider records reconcile exactly.
- No trial or billing path can enable an unaccepted package.

### PR-05 — immutable publish, installation, verification and traffic control

**Outcome:** launch steps are real, separate and reversible.

Work:

- Publish immutable, tenant-scoped configuration versions with structural/safety blocking and advisory findings that do not prevent publication.
- Generate deployment keys and exact-origin allowlists from server authority.
- Produce the correct immutable widget/snippet artifact for the selected product and version.
- Implement real installation detection and origin verification without treating either as publication or go-live.
- Make go-live an explicit, audited traffic-state transition that revalidates account, access, trial/subscription, version, origin, quotas and safety invariants.
- Provide version rollback, deployment disable, global/product/provider kill switches and customer-safe degraded states.
- Route the merchant to Dashboard after verification; keep Dashboard available while Configuration is incomplete.

Exit gate:

- Publish, install, verify and go-live can fail independently without corrupting one another.
- Prior immutable versions remain unchanged and recoverable.
- Real website installation and rollback pass in staging for Flow, Text and Voice.

### PR-06 — Flow Starter and Advanced completion

**Outcome:** the deterministic product is complete across authoring, runtime and operations.

Work:

- Finish all six approved templates, identity, bilingual translation, rich content, conditions, forms, handover and analytics.
- Preserve infinite canvas, symmetric connectors, repairable loose ends, connected-node deletion, undo/redo, autosave/conflict recovery and immutable versions.
- Prove exhaustive layer-by-layer routing for every EN/TH option and typed-intent path.
- Enforce Starter/Advanced limits and features server-side.
- Finish advanced workflow, schedule, routing, Sheets/webhook/API and reporting behavior.
- Keep Flow deterministic and free of AI/provider imports.

Exit gate:

- Flow Starter and Advanced package checklists pass locally and in staging.
- Three named isolated merchant acceptance worksheets pass before broad self-service.

### PR-07 — AI Text Starter and Advanced completion

**Outcome:** merchants can configure, test and operate a grounded AI Text Bot through a qualified live route.

Work:

- Complete safe website/document/catalogue ingestion, provenance, refresh, deletion and prompt-injection defenses.
- Enforce the `PR-00` response policy with locale-aware tests and no unsafe string slicing.
- Select one owner-controlled provider/model route, validate configuration atomically and keep provider identity confidential from merchants.
- Complete structured output validation, one bounded repair, safe fallback, citation/grounding evidence, latency/usage/cost metrics and kill switch.
- Finish Support, Sales and Booking role behavior, actions, handover, website widget and advanced integrations/analytics.
- Validate Thai and English grounding, sales behavior, safety and adversarial cases with human review.

Exit gate:

- Unmocked staging Builder → API → gateway → provider → Sales Core journeys pass.
- Customer output is grounded, bounded, provider-neutral and metered exactly once.
- Text Starter and Advanced package checklists pass.

### PR-08 — AI Voice Starter and Advanced completion

**Outcome:** merchants can configure, test and operate real web and telephone Voice Bots safely.

Work:

- Complete explicit-consent ephemeral Voice testing with microphone allow/deny, disclosure, transcription policy, streaming, interruption, reconnect and cleanup.
- Select and qualify the production realtime provider behind the provider-neutral gateway.
- Enforce response policy before TTS, exact session/minute accounting, concurrency, capacity and fail-closed admission.
- Complete action proposals, callback, appointment, transfer and handover without false success claims.
- Finish Starter web voice and Advanced telephone number/carrier, routing, live/department transfer, scheduling, CRM/Sheets/webhooks and reporting.
- Validate retention, transcript access, recording consent, privacy and emergency limitations.
- Run Thai/English human quality, latency, interruption, load, provider-outage and settlement acceptance.

Exit gate:

- Unmocked staging media and real-call journeys pass with no provider leakage.
- Voice Starter and Advanced package checklists, cost reconciliation and recovery drills pass.

### PR-09 — complete merchant operations

**Outcome:** a merchant can operate the service daily without an engineer.

Work:

- Complete Dashboard, full-page Configuration, conversations, contacts/leads, appointments/callbacks, analytics/reports, notifications, integrations, team/settings, billing and support.
- Enforce the strictly-less-than-five-minute takeover rule on the server at the moment of takeover.
- Preserve product-family independence: one product may be live while another is incomplete or degraded.
- Complete safe CSV exports, tenant audit, support access grants, notification policy and professional-setup workflow.
- Provide truthful loading/empty/partial/dependency/error states and clear recovery actions.
- Add Standard/Priority support routing and staffed escalation ownership.

Exit gate:

- Every tenant role passes its route/action matrix and negative authorization tests.
- Named Thai merchants complete the principal daily journeys without engineering intervention.

### PR-10 — Platform operations and Owner analytics

**Outcome:** authorized internal teams can operate the SaaS and understand merchants, subscriptions, revenue, usage and provider economics without crossing privacy boundaries.

Work:

- Present the complete clickable Platform Master Owner analytics experience and obtain explicit page-by-page Product Owner approval.
- Execute Owner analytics phases `OA-02` through `OA-13`, including migrations `0102`–`0106`, golden fixtures, read models, rebuild/reconciliation, APIs and role-specific UI.
- Implement Owner Overview, merchant and SaaS-user directories, subscriptions, revenue, Text/Voice usage, provider/model economics, trials, reports, alerts, Merchant 360 and governed exports exactly as approved.
- Keep merchant businesses, SaaS users and merchant end customers distinct.
- Exclude raw end-customer messages, transcripts, recordings and contacts from ordinary Owner analytics and exports.
- Restrict provider/model analytics structurally to Owner and expressly authorized AI Operations roles.
- Complete Platform incident, release, provider, finance, support, dead-letter and recovery operations.

Exit gate:

- `PLT-011` through `PLT-025` are implemented, staging-verified and formally accepted.
- Golden commercial/provider totals reconcile; role DTO and confidentiality-negative tests pass.
- Owner analytics UI matches the approved demo page by page.

### PR-11 — social, telephony and advanced integration release train

**Outcome:** every capability retained in the complete approved offer has real provider evidence.

Work:

- Keep `SOCIAL_CHANNELS_RELEASE_ENABLED=false` until this phase passes.
- Approve release order and provider accounts for LINE, WhatsApp and Messenger.
- Validate credential custody, signature/replay, ordered inbound processing, idempotent outbound delivery, media limits, policy compliance, disconnect/reconnect and merchant UX.
- Complete social Flow and Text package behavior, usage, analytics, support and incident controls.
- Complete carrier/telephone and approved CRM, Sheets, webhook and accounting production integrations.
- If any capability is no longer intended, obtain explicit Product Owner removal and reconcile the entire authority set before calling the offer complete.

Exit gate:

- Each released provider journey passes unmocked staging, failure, quota, reconciliation and kill-switch tests.
- Social remains independently disableable without breaking website products.

### PR-12 — cloud, security, privacy and business operations

**Outcome:** the accepted application can be operated safely under production load and regulation.

Work:

- Provision reviewed GCP production topology, IAM, service identities, secret custody, network boundaries, storage, databases, queues, gateways and immutable artifacts.
- Implement CI/CD promotion by digest with migration checks, canary, automatic health rollback and separation of staging/production authority.
- Finish SLOs, dashboards, alerts, error budgets, on-call schedules, status communication and cost/capacity budgets.
- Exercise backup/restore, PITR, regional recovery, queue replay, provider outage, pool exhaustion, kill switches and data reconciliation.
- Complete SAST, dependency, container and secret scans plus independent penetration testing; close all critical/high findings.
- Obtain named legal/privacy, Thai tax/accounting, provider/subprocessor, recording/transcription and retention approvals for the exact release.
- Staff support, finance, incident command, security response and provider escalation.
- Run authorized WCAG 2.2 A/AA, keyboard, screen-reader, reduced-motion and responsive acceptance in Thai and English.

Exit gate:

- Production-disabled environment runs the exact accepted artifacts and schema.
- No Severity 1/2, critical/high security issue or legally blocking exception remains.
- Restore, rollback, incident, support, finance and provider runbooks are exercised by their real owners.

### PR-13 — production-like staging acceptance and controlled pilot

**Outcome:** the complete system works with real integrations before public sale.

Work:

- Run prospect-to-customer E2E for every package: discovery, purchase/trial, account, onboarding, publish, install, verify, go-live, customer interaction, merchant operation, usage, billing and support.
- Use real sandbox/live-test providers, real website installations and real telephone/social accounts where applicable.
- Run isolation, entitlement, replay, dependency outage, accessibility, performance, load, recovery and reconciliation matrices.
- Promote the same digests to production with all packages disabled.
- Enable internal tenants, then named design partners under explicit limits and enhanced support.
- Review every pilot incident, customer complaint, provider variance, quality result and finance mismatch; repeat affected tests after correction.

Exit gate:

- Every requirement reaches `staging_verified` with current evidence.
- Named Product, Security, Privacy, Finance, Operations, Thai-language and merchant reviewers approve their gates.
- Production pilot meets its SLO, quality, margin, support and reconciliation thresholds.

### PR-14 — package launch and hypercare closure

**Outcome:** all six packages are safely available to paying customers and transferred to normal operations.

Work:

- Accept shared requirements first, then each package-specific requirement set.
- Obtain an explicit Product Owner sellability decision for each package.
- Set `sellable: true` prospectively; immediately verify public copy, price, Checkout, provisioning and entitlement.
- Increase traffic/customer volume gradually with predefined rollback thresholds.
- Reconcile commerce, usage, provider costs, invoices and accounting daily during launch.
- Review activation, customer success, quality, support, incidents, performance and margin daily during the initial 30-day hypercare period.
- Close launch-specific controls only when normal on-call, support and finance owners accept ongoing responsibility.

Exit gate:

- All 337 requirements are formally accepted.
- All six packages are sellable and their live journeys pass.
- Thirty days of hypercare close without an unresolved blocking defect or material reconciliation error.
- The final production readiness certificate names the released digests, schema, configuration versions, evidence and accountable owners.

## 8. Mandatory evidence matrix

| Area | Minimum evidence before acceptance |
| --- | --- |
| Source | Clean commit, generated registry, lockfile, `git diff --check` |
| Static/CI | Node 24, pnpm 11.12.0, lint, typecheck, unit, build, dependency/secret/container scans |
| Database | Fresh 102+ migration run, RLS/cross-tenant denials, concurrency, rollback/forward-fix, restore |
| Product E2E | All three family onboarding branches and all six package sellability journeys |
| Commerce | Stripe test/live-mode readiness, webhook reorder/replay, trial eligibility, subscription, invoice/credit/accounting reconciliation |
| Flow | Six templates, exhaustive EN/TH routes, canvas/edit/version/runtime/deployment/recovery |
| Text | Grounding, citations, history, role behavior, output policy, action integrity, live provider, usage/cost |
| Voice | Consent, media, disclosure, Thai/English, interruption, reconnect, capacity, tool actions, settlement, real telephone where promised |
| Merchant | Dashboard, Configuration, takeover boundary, contacts/leads/inbox/appointments/reports/support |
| Platform | Role-specific operations, Owner analytics, Merchant 360, alerts, exports, provider confidentiality |
| Security/privacy | Isolation, privilege, SSRF/upload/prompt/action, pen test, retention, DSAR, breach and legal approval |
| Accessibility | WCAG 2.2 A/AA automated and manual keyboard/screen-reader/responsive Thai/English acceptance |
| Reliability | Load, SLO/error budget, outage, queue replay, backup/restore, regional recovery, kill-switch and rollback |
| Human/business | Named Thai merchant acceptance, support/on-call drill, finance/accounting, Product Owner acceptance |

Evidence must name the exact commit/image/widget digest, migration set, environment, provider mode, command or journey, result, reviewer and expiration/revalidation trigger. Screenshots or videos alone do not prove server authority, isolation, persistence, billing or recovery.

## 9. Release-blocking defect policy

The following always block the affected release:

- cross-tenant or cross-realm authorization failure;
- secret/provider identity leakage outside an authorized Platform projection;
- incorrect charge, allowance, invoice, credit, revenue or provider-cost attribution;
- duplicate or falsely confirmed external action;
- loss/corruption of published configuration, customer state or immutable evidence;
- bypass of trial eligibility, entitlement, quota, publication or go-live authority;
- critical/high security finding or legally blocking privacy/tax/accounting issue;
- inaccessible critical journey with no equivalent path;
- unbounded provider cost, unsafe AI action behavior or Voice consent failure;
- missing rollback, recovery, on-call or accountable owner for a released dependency.

Advisory configuration findings do not block publication when structural, safety, legal, entitlement and external-action invariants pass.

## 10. Program dashboard

Maintain one weekly table generated from the registry and evidence:

| Measure | Starting value | Completion target |
| --- | ---: | ---: |
| Requirements in maintained registry | 337 | 337 |
| Formally accepted requirements | 0 | 337 |
| Sellable packages | 0 of 6 | 6 of 6 |
| Open authority conflicts | 0 for reply length and Builder test cap; others remain decision-gated | 0 |
| Untracked essential implementation files | Present | 0 |
| Critical/high security defects | Not yet finally assessed | 0 |
| Package E2E journeys accepted | 0 of 6 | 6 of 6 |
| External production integrations accepted | Incomplete | Every released dependency |
| Named merchant acceptance | Incomplete | Passed for every package family |
| Production hypercare | Not started | 30 days closed |

The dashboard must never turn local implementation counts into acceptance counts. A mocked test, clickable demo, committed adapter or passed build is progress, not proof that a merchant can safely use the corresponding production feature.

## 11. Immediate execution backlog

Start in this order:

1. Reconcile the approved 200-word reply policy and 50-request Builder test cap across all authorities and code.
2. Bring the approved 337-requirement Owner analytics authority into the maintained tracked repository.
3. Review and checkpoint the current uncommitted audit/remediation work as bounded commits.
4. Establish a clean, repeatable local/CI baseline and record fresh evidence.
5. Replace the static `/build` state with durable anonymous server drafts and imports.
6. Connect account-at-deploy, verification, legal acceptance, one-time onboarding and atomic draft claim.
7. Implement real trials/Stripe provisioning and immutable deployment lifecycle.
8. Complete Flow, Text and Voice vertical slices against their package gates.
9. Finish merchant operations and, after clickable-demo approval, Owner analytics.
10. Execute cloud, external-provider, security, legal, accessibility, named-merchant, staging, pilot and hypercare gates.

Do not set any package sellable during steps 1–9. The first sellability change belongs to `PR-14` and requires package-specific accepted evidence.

## 12. Planning assumptions

The existing detailed estimate of roughly 100–160 engineer-weeks plus external approval remains a reasonable order-of-magnitude baseline for the complete market-release scope, not a delivery promise. The critical path is driven less by raw coding than by production application migration, commerce, live AI/Voice/telephony qualification, Owner analytics, security/compliance evidence and named human acceptance.

With a parallel team, the three product slices, cloud foundation, commerce and Owner analytics contracts can overlap after their shared gates. With a smaller team, preserve the same order and reduce work in progress; never compress the schedule by reclassifying unverified behavior as complete.
