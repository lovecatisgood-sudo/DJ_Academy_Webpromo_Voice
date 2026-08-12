# DJay Bots V1 Detailed Implementation Plan

| Field | Value |
| --- | --- |
| Status | Execution plan for the V1 Market Release |
| Date | 2026-07-18 |
| Product authority | `docs/product/djay-bots-v1-market-release-prd.md` |
| Experience authority | `docs/design/djay-bots-v1-ui-ux-and-user-flows.md` |
| Architecture authority | `docs/architecture/djay-bots-v1-market-release-architecture.md` |
| Current PRD baseline | 297 normative requirements in 35 requirement families |
| Delivery approach | Dependency-ordered vertical slices with package-by-package sellability gates |

## 1. Purpose

This plan turns the complete product, experience, and architecture specifications into an implementation program that can be executed without losing scope. It is intentionally more detailed than the architectural roadmap. Every work package identifies:

- Required product behavior and PRD coverage.
- Existing code that can be extended.
- Required schema, API, events, UI, providers, security, telemetry, migrations, and documentation.
- Entry dependencies and exit evidence.
- Test, rollout, and rollback obligations.

The commercial offer remains authoritative. Existing P1-P9 documents describe delivered foundations and earlier phase gates; they do not establish that the expanded market-release package is complete.

## 2. Non-negotiable delivery rules

1. No requirement is considered implemented only because a component, route, or UI exists.
2. Every normative PRD ID must have one accountable work package, implementation status, test IDs, and release-evidence path.
3. A requirement may have supporting work packages, but exactly one package owns final acceptance.
4. No public package becomes `sellable=true` until all shared and package-specific requirements pass in production-like staging.
5. Implement complete vertical slices: domain, database/RLS, API, UI, entitlement, usage, audit, notifications, telemetry, tests, runbook, and failure recovery where applicable.
6. Browser-supplied tenant, role, plan, price, promotion, entitlement, provider, model, usage, and action identifiers are never authority.
7. Every new tenant-owned table receives tenant constraints, forced-RLS policies, least-privilege grants, isolation tests, retention classification, and backup/erasure treatment.
8. Every durable external or asynchronous effect receives idempotency, outbox/inbox handling, retry classification, dead-letter recovery, reconciliation, and observability.
9. Published bots, catalogue contracts, usage events, finalized finance records, and audit facts are immutable.
10. Preview/test environments cannot perform production side effects or consume customer allowance; internal provider cost is still measured.
11. Feature flags control rollout, not authorization. Entitlements remain enforced even when the UI is hidden.
12. Migrations use expand/backfill/switch/contract. Application releases stay compatible with the previous and next schema during rolling deployment.
13. No task is closed without negative tests for role, tenant substitution, entitlement denial, duplicate/reordered delivery, and dependency failure where applicable.
14. No production provider is enabled from a sandbox-only test. Live credentials, account modes, quotas, callbacks, terms, and reconciliation must be verified.
15. Do not modify or migrate behavior inside `../FlowBot_V1_App/`; use it only as a protected behavior reference.

## 3. Scope control and traceability

### 3.1 Requirement baseline

| Family | Count | Principal scope |
| --- | ---: | --- |
| `COM`, `ADD`, `MET`, `OVR` | 37 | Catalogue, prices, contracts, add-ons, meters, packs, forecasts and caps |
| `IDN`, `TEN`, `SEC` | 17 | Identity, tenancy, roles, isolation, security and compliance |
| `BOT`, `LEAD`, `NOT`, `SUP`, `PRO` | 20 | Shared bot lifecycle, customers, notifications, support and professional services |
| `FLS`, `FLA` | 32 | Flow Starter and Advanced |
| `AIT`, `KNO`, `ATS`, `ATA` | 40 | AI behavior, knowledge, Text Starter and Advanced |
| `VOI`, `VOS`, `VOA`, `TEL` | 34 | Voice runtime, Starter, Advanced and telephone behavior |
| `CHN`, `INT`, `SOC`, `WEB` | 34 | Website, social channels, integrations and actions |
| `BIL`, `FIN` | 17 | Stripe lifecycle, invoices, credits and accounting |
| `ANA`, `REL`, `UX` | 25 | Analytics, reliability, performance and accessibility |
| `EXP`, `ONB`, `OPS`, `PLT` | 41 | Public purchase, onboarding, merchant operations and Platform Master |
| **Total** | **297** | Complete market-release baseline |

### 3.2 Executable requirement registry

The first implementation deliverable is `requirements/market-release-v1.yaml`. It is a machine-readable derivative of the PRD and contains one record per normative ID:

```yaml
- id: FLS-001
  title: One Flow Bot in one workspace
  packages: [flow_starter]
  owner_work_package: FLOW-01
  supporting_work_packages: [COM-02, EXP-03]
  implementation_paths: []
  migration_ids: []
  api_contracts: []
  ui_routes: []
  entitlement_keys: []
  meter_keys: []
  test_ids: []
  runbooks: []
  evidence: []
  status: planned
  accepted_by: null
```

Allowed statuses: `planned`, `in_progress`, `implemented`, `staging_verified`, `accepted`, `blocked`, `not_applicable`. `not_applicable` requires product-owner approval and cannot be used for an advertised package requirement.

CI checks must prove:

- The registry contains exactly the PRD IDs with no missing, duplicate, or unknown ID.
- Every record has one valid owner work package.
- Every `implemented` record has implementation paths and tests.
- Every `staging_verified` record has time-stamped evidence and environment/build identity.
- Every `accepted` record identifies the authorized reviewer.
- A sellable package has no required record below `accepted` and no expired operational evidence.

### 3.3 Work-package records

Each work package gets `docs/implementation/work-packages/<id>.md` when started, using this template:

1. Scope and owned PRD IDs.
2. Explicit non-goals.
3. Existing behavior and reuse boundary.
4. Domain/schema/API/event/UI/provider impact.
5. Security, privacy and provider-confidentiality impact.
6. Entitlement, usage, billing and analytics impact.
7. Migration/backfill and rollback.
8. Unit/database/contract/E2E/negative/non-functional tests.
9. Observability, alerts, runbook and support impact.
10. Staging evidence and acceptance.

### 3.4 Change control

- New or changed commercial scope first changes the offer/PRD through product-owner approval, then architecture/UX, registry, work packages, tests, and customer communication.
- Implementation discoveries cannot silently reduce the offer. A provider constraint produces a design/vendor decision or a release blocker.
- Requirement text is never edited to mark implementation easier. Historical PRD versions/checksums remain retained.
- Architecture deviations require an ADR with migration, security, cost and rollback analysis.

## 4. Program structure

### 4.1 Delivery streams

| Stream | Responsibility |
| --- | --- |
| Program control | Requirements registry, ADRs, evidence, dependency/risk/change management |
| Platform foundation | Identity, roles, tenant data, shared lifecycle, UI shell, notifications |
| Commerce | Catalogue, Stripe, subscriptions, usage, overages, finance, FlowAccount |
| Flow | Domain/editor/runtime, website, social, integrations and analytics |
| AI Text | Knowledge, model gateway/runtime, website/social, actions and analytics |
| Voice | Realtime web voice, telephony, transfer, scheduling, analytics and cost |
| Merchant operations | Inbox, contacts, leads, appointments, analytics, billing and team |
| Platform operations | Tenant 360, queues, provider/release/support/finance operations |
| Cloud/SRE/security | GCP, CI/CD, IAM, secrets, observability, resilience and security assurance |
| Release/quality | End-to-end package evidence, language/provider acceptance, controlled GA |

### 4.2 Dependency graph

```text
CTRL-01/02
  -> CORE-01 identity/roles/security
  -> CORE-02 lifecycle/onboarding/read models
  -> COM-01 catalogue/contracts
      -> COM-02 entitlements/resources
      -> COM-03 usage/reservations
      -> BILL-01 checkout/subscriptions
          -> BILL-02 portal/dunning/change lifecycle
          -> FIN-01 invoices/credits
              -> FIN-02 FlowAccount

CORE + COM foundations
  -> FLOW-01..05
  -> AI-01..06
  -> VOICE-01..06
  -> OPS-01..05

Channel/action foundations
  -> Flow Advanced social/integrations
  -> AI Text Advanced social/integrations
  -> Voice Advanced CRM/Sheets/webhooks/scheduling

All product/commerce/operations slices
  -> PLAT-01..04
  -> CLOUD-01..05
  -> GA-01..04
```

### 4.3 Environment progression

| Environment | Purpose | Data/providers | Promotion requirement |
| --- | --- | --- | --- |
| Local | Fast unit/integration/browser development | Synthetic data, PostgreSQL container/test doubles | Focused tests pass |
| CI ephemeral | Repeatable PR validation | Isolated database, contract fixtures, no shared secrets | All mandatory PR gates pass |
| GCP staging | Production topology and provider sandbox/live-test acceptance | Synthetic/design-partner test data, Stripe test, provider sandboxes/test accounts | Staging evidence signed |
| Production disabled | Live infrastructure with packages not sellable | Live accounts, internal tenants only | Operational/security gates pass |
| Production pilot | Named internal/design-partner tenants | Real low-volume traffic/payment | Pilot exit and incident review pass |
| Paid GA | Independently approved sellable packages | Live customer traffic | Gate D package approval |

## 5. Standard implementation sequence for every vertical slice

1. Confirm owned PRD IDs and current code/evidence.
2. Write/approve ADR if the slice changes architecture or commercial policy.
3. Define domain types/state machine and error vocabulary.
4. Design schema, constraints, RLS, indexes, role grants and retention.
5. Define API/event/action contracts and idempotency.
6. Write database/domain tests first for invariants and negative cases.
7. Apply additive migration and repository/service implementation.
8. Add entitlement, resource limit, usage reservation/event and audit hooks.
9. Implement task-oriented UI and all loading/empty/error/conflict/denied/partial states.
10. Implement async workers/provider adapter, retry/dead-letter/reconciliation where relevant.
11. Add structured logs, metrics, traces, dashboards and alerts.
12. Add contract, integration, E2E, accessibility and dependency-failure tests.
13. Write/update runbook, support and release evidence documentation.
14. Deploy disabled to staging, migrate/backfill, verify data and rollback path.
15. Run production-like acceptance; update registry to `staging_verified`.
16. Product/security/finance/operations reviewers accept applicable requirements.
17. Enable for internal tenant, observe, then controlled package rollout.

## 6. Work-package summary

| ID | Work package | Dependencies | Relative size | Primary requirement families |
| --- | --- | --- | --- | --- |
| `CTRL-01` | Requirement registry and CI gates | None | M | All |
| `CTRL-02` | Decision closure and vendor readiness | None | M/Ongoing | COM, OVR, FIN, ATA, VOA, TEL |
| `CORE-01` | Identity, roles, billing permission, MFA and tenant security | CTRL-01 | L | IDN, TEN, SEC, UX |
| `CORE-02` | Lifecycle projections, onboarding coordinator and application read models | CORE-01, COM-01 | L | EXP, ONB, OPS, UX |
| `CORE-03` | Shared UI shell, design system, route restructuring and notification center | CORE-01/02 | L | UX, NOT, OPS, PLT |
| `COM-01` | Immutable catalogue, promotion and contract snapshots | CTRL-01/02 | L | COM, ADD |
| `COM-02` | Entitlements, resources, downgrade and multi-product contracts | COM-01, CORE-01 | L | COM, ADD, BOT, TEN |
| `COM-03` | Meter ledger, allowance periods, reservations, packs and reconciliation | COM-01/02 | XL | MET, OVR, BIL |
| `BILL-01` | Purchase intents, Stripe Checkout and webhook application | COM-01/02, CORE-01 | XL | EXP, BIL, COM |
| `BILL-02` | Portal, renewal, dunning, plan/add-on changes and cancellation | BILL-01, COM-03 | L | BIL, OPS, ADD |
| `FIN-01` | Immutable invoices, credits, payments/refunds/disputes | BILL-01 | XL | FIN, BIL, SEC |
| `FIN-02` | FlowAccount sync and finance reconciliation | FIN-01, vendor contract | L/External | FIN, PLT |
| `FLOW-01` | Flow schema, rich content, conditions and deterministic runtime | CORE-02, COM-02/03 | XL | FLS, FLA, BOT |
| `FLOW-02` | Visual builder, templates, versions and Flow onboarding | FLOW-01, CORE-03 | XL | FLS, FLA, ONB, UX |
| `FLOW-03` | Flow website widget, install and multi-product entry | FLOW-01, WEB-01 | L | WEB, FLS, FLA |
| `FLOW-04` | Deterministic social channels and handover | FLOW-01, CHAN-01, OPS-01 | XL | FLA, SOC, CHN |
| `FLOW-05` | Flow integrations, business workflows and analytics | FLOW-01, INT-01 | XL | FLA, INT, ANA |
| `AI-01` | Knowledge ingestion, crawling, catalogue and revision pipeline | CORE-02, CLOUD-02 | XL | KNO, ATS, ATA, SEC |
| `AI-02` | Strict Responses gateway, grounded runtime and safety | AI-01, COM-03 | XL | AIT, ATS, ATA |
| `AI-03` | AI Text Studio, onboarding, quality tests and website widget | AI-01/02, CORE-03, WEB-01 | XL | ATS, ATA, ONB, WEB |
| `AI-04` | Advanced customer intelligence, actions and routing | AI-02, INT-01, OPS-01 | XL | ATA, LEAD, INT |
| `AI-05` | AI social channels, handover and delivery | AI-02/04, CHAN-01 | L | ATA, SOC, CHN |
| `AI-06` | AI analytics, summaries and knowledge review | AI-01/02/04 | L | ATA, ANA, KNO |
| `VOICE-01` | Web realtime gateway productionization | COM-03, CORE-02 | XL | VOI, VOS, REL |
| `VOICE-02` | Voice Studio/onboarding, widget and web launch | VOICE-01, CORE-03, WEB-01 | XL | VOS, ONB, WEB |
| `VOICE-03` | Telephony provider, number and carrier lifecycle | VOICE-01, vendor contract | XL/External | VOA, TEL, CHN |
| `VOICE-04` | Live/department transfer, callback and scheduling | VOICE-03, INT-01, OPS-02 | XL | VOA, TEL, INT |
| `VOICE-05` | Voice analysis, languages, sentiment and reporting | VOICE-01/03/04 | L | VOA, ANA |
| `VOICE-06` | Voice metering, carrier cost and reconciliation | VOICE-01/03, COM-03 | L | VOI, VOA, MET, OVR |
| `WEB-01` | Shared widget loader, manifest, theme, accessibility and host verification | CORE-01/03, COM-02 | L | WEB, UX, SEC |
| `CHAN-01` | Common channel connection, capability, delivery and health framework | CORE-01, COM-02 | XL | CHN, SOC |
| `INT-01` | Action gateway, webhooks, Sheets, CRM and scheduling framework | CORE-01, CTRL-02 | XL | INT, SEC |
| `OPS-01` | Unified Inbox, handover and staff reply operations | CORE-02/03, CHAN-01 | XL | OPS, LEAD, SOC |
| `OPS-02` | Contacts, leads, appointments/callbacks and customer intelligence | OPS-01, INT-01 | XL | LEAD, OPS, ANA |
| `OPS-03` | Merchant Overview, usage, billing, team and portfolio operations | CORE-02/03, COM/BILL | XL | OPS, ONB, EXP |
| `OPS-04` | Notifications, support and professional-services workflow | CORE-03, PLAT-01 | L | NOT, SUP, PRO, PLT |
| `OPS-05` | Cross-product analytics and export | Product analytics, COM-03 | L | ANA, OPS, SEC |
| `PLAT-01` | Platform Master route shell, command center and Tenant 360 | CORE-02/03 | XL | PLT, SEC |
| `PLAT-02` | Commerce, usage and finance exception queues | COM/BILL/FIN | XL | PLT, BIL, FIN, OVR |
| `PLAT-03` | Provider, Voice, channel, job recovery and release operations | Product runtimes, CLOUD-03 | XL | PLT, REL, SEC |
| `PLAT-04` | Catalogue/promotion governance, support access and audit | COM-01, OPS-04 | L | PLT, COM, SUP |
| `CLOUD-01` | GCP account/project, IAM, network, DNS and certificates | CTRL-02 | XL | SEC, REL |
| `CLOUD-02` | Cloud SQL, storage/CDN, queues/schedules, KMS/secrets | CLOUD-01 | XL | SEC, REL, KNO, WEB |
| `CLOUD-03` | Cloud Run services, images and CI/CD | CLOUD-01/02 | XL | REL, SEC |
| `CLOUD-04` | Observability, budgets, quotas, capacity and cost controls | CLOUD-03, products | L/Ongoing | REL, MET, OVR |
| `CLOUD-05` | Backups, restore and regional recovery | CLOUD-02/03 | L | REL, SEC |
| `GA-01` | Security, privacy, legal and accounting acceptance | All relevant | XL/External | SEC, FIN, COM |
| `GA-02` | Package E2E, language, channel and provider acceptance | All products | XL | All package families |
| `GA-03` | Pilot, incident review and production readiness | GA-01/02, CLOUD | L | REL, PLT |
| `GA-04` | Package-by-package paid GA and post-launch control | GA-03 | Ongoing | All |

Relative size is planning complexity, not a time commitment: M, L and XL indicate increasing coordination, risk and verification. External denotes vendor/approval dependency.

## 7. Control and foundation work packages

### CTRL-01: Requirement registry and delivery gates

**Deliver:**

- Create the 297-record YAML registry and JSON Schema.
- Add parser/check script and `pnpm` lint command.
- Map existing tests/evidence without claiming missing features complete.
- Add package-to-requirement rules for all six plans and shared requirements.
- Generate a human-readable progress report and missing-evidence report.
- Add CI gate to pull requests and release packaging.

**Tests/evidence:** parser unit tests for missing/duplicate/unknown IDs, invalid transitions, incomplete acceptance and package sellability denial. Evidence: `docs/validation/market-release-requirements.md`.

**Exit:** PRD and registry sets match exactly; every record has an owner work package; no plan is sellable.

### CTRL-02: Decision and vendor readiness closure

Create an owner, deadline, evidence and fallback for each decision:

- Thai telephony/SIP carrier, number availability, media stream, transfer, DTMF, CDR and cost.
- First CRM connector.
- FlowAccount API/sandbox, accounting numbering and tax workflow.
- Additional Text/Voice languages and quality thresholds.
- Stripe tax/discount/proration/add-on/refund/dunning/dispute policy.
- Pack expiry/consumption, overage opt-in and safety-cap policy.
- File sizes/types/scanner/extractor and vector-index decision.
- Data retention, Voice audio default, support access and MFA policies.
- Separate production GCP project and recovery topology.
- LINE/Meta/Google/email/OpenAI/Stripe/provider production accounts, reviews and quotas.

**Exit:** each critical-path decision has an accepted ADR/contract or is an explicit release blocker; no implementation relies on an unverified API behavior.

### CORE-01: Identity, roles and tenant security completion

**Extend existing:** `packages/auth`, `authorization`, `tenancy`, `platform-auth`, API auth routes, tenant and Platform session UIs.

**Implement:**

- Billing permission bundle/role boundary for checkout, tax details, Portal, overage/cap, packs, plan changes and cancellation.
- MFA availability for tenant admins and required MFA/recent auth for sensitive billing/integration/privacy actions.
- Complete role matrix for owner/admin/operator/analyst and billing job.
- Support/professional access purpose, scope, expiry, tenant disclosure and break-glass review.
- Session/access review and ownership-transfer impacts on billing and integrations.
- Tenant isolation for all new schema paths; platform sensitive-read audit.

**Security tests:** direct route denial, stale/revoked session, cross-workspace substitution, last-owner invariant, recent-auth timeout, MFA recovery, support expiry, platform/tenant cookie and audience separation.

**Exit:** identity and authorization support every planned job without overloading owner access or exposing platform operations.

### CORE-02: Lifecycle, onboarding and read models

**Schema:** onboarding definitions/evidence/blockers, product lifecycle projection, install/test evidence, purchase continuation references, projection version/freshness.

**Services:**

- Shared prerequisite evidence.
- Independent lifecycle per family and contract.
- Invalidation on publication/deployment/entitlement/health changes.
- Transactional launch preflight.
- Task-oriented public/tenant/platform read models with partial-panel availability.

**APIs:** portfolio lifecycle, onboarding steps/status/allowed commands, refresh/recalculate, product blockers, next action. Browser may request refresh but cannot set completion.

**Exit:** multi-product tenant can show Flow live, Text onboarding and Voice processing truthfully; stale evidence cannot authorize launch.

### CORE-03: Shared UI architecture

**Implement:**

- Route-based public, tenant and Platform information architecture from the UX plan.
- Shared authenticated shell, mobile navigation, product context and workspace switcher.
- Loading/empty/unavailable/partial/denied/conflict/pending/success components.
- Onboarding shell and product portfolio component.
- Notification/activity center.
- Standard table/filter/detail/split-pane patterns.
- Thai/English locale, currency/date/time and long-label behavior.
- Design tokens, lucide icon controls, tooltip, accessible forms and error summary.

**Migration:** retain old routes with safe redirect/deep-link mapping until replacement acceptance. Split large Studio pages incrementally behind shared services.

**Exit:** full route/role/state matrix passes desktop/mobile accessibility and no-overlap checks.

## 8. Commercial, billing and finance work packages

### COM-01: Immutable catalogue and contracts

**Schema/data:** catalogue versions, six products/internal keys, exact first-term and renewal prices, promotion version, entitlement values, overage/pack/add-on/service prices, Stripe mapping state, checksums and approvals.

**Implement:**

- Seed exact PRD prices, including fixed THB 2,500 Flow Starter reduction.
- Draft/validate/diff/approve/activate/retire catalogue lifecycle.
- Server-generated public comparison and checkout quotation.
- Subscription contract snapshots reproducible after catalogue change.
- Multi-family compatibility and one active base package per family/workspace.

**Negative tests:** browser price substitution, active-version mutation, incorrect Flow rounding, expired promotion, historical contract changes, missing Stripe mapping, unauthorized activation.

**Exit:** public, checkout, entitlement, billing and Platform use one active catalogue version; existing contracts remain unchanged on new version.

### COM-02: Entitlements and resource boundaries

**Implement checks at:** create, update, publish, deployment/channel binding, runtime admission, action, usage, export and team invitation.

**Resources:** bots/agents, topics, unlimited-step safety limits, admins, workspaces, included channel slot, branding, knowledge collections/documents/size, languages, integrations, concurrency and analytics/export depth.

**Downgrade:** preflight, owner selection of retained active resources, scheduled effect, disabled/read-only excess data, restoration on upgrade.

**Tests:** concurrent create/publish/admission; add-on activation/removal; multi-family non-interference; expired override; cross-tenant/cross-plan substitution.

### COM-03: Usage, packs, forecasts and caps

**Schema:** meter definitions/versions, anniversary periods, raw events, reservations, aggregates, pack lots/consumption, forecasts, alerts, caps, adjustments/credits and reconciliation.

**Implement exact meters:** Flow conversation session; AI customer-facing generated reply; raw Voice seconds and per-session rounded minute; resource gauges; separate provider cost.

**Reservation:** atomic included allowance -> eligible pack -> consented overage -> hard cap. Expiring reservations and terminal settlement/release.

**Forecast/alerts:** pace/seasonality method, confidence, 50/75/90/100%, exhaustion, anomaly and cap thresholds with dedupe/cooldown.

**Reconciliation:** raw events, aggregates, reservations, contract, packs, provider units, carrier CDR and Stripe quantities.

**Tests:** duplicates/reordering, period boundary/Bangkok time, concurrent cap race, session rounding, retry/refusal exclusions, pack ordering/expiry, adjustments, forecast fixtures and reconciliation repair.

### BILL-01: Purchase, Checkout and webhook lifecycle

**Schema:** purchase intents, registration attachment, quotations, checkout intents, provider mappings, webhook inbox/attempts, provisioning jobs and normalized subscription state history.

**Implement:**

- Anonymous selection -> registration/verification -> workspace attachment.
- Unsubscribed workspace purchase path.
- Server-calculated checkout review and price-change confirmation.
- Idempotent Stripe Checkout creation with server Price/coupon.
- Signed raw-body webhook durable acceptance and order-tolerant application.
- Processing/active/action-required/expired/canceled/unavailable return states.
- Atomic/idempotent tenant entitlement provisioning and activation notification.

**Event coverage:** Checkout Session, Customer, Subscription/Schedule, Invoice, PaymentIntent/Charge, refund, dispute and credit note.

**Tests:** forged signature, duplicate/reordered/missing event, closed tab, expired session, unknown create result, payment success/provision failure/replay, wrong workspace/user, test/live mode mix, return URL tampering.

### BILL-02: Subscription lifecycle and Portal

**Implement:** renewal, invoice paid/failed, grace/dunning/restriction/end, cancel-scheduled/resume, Portal session, payment method, upgrade/proration, downgrade schedule/preflight, add-on cadence, packs, refunds/disputes and resubscription.

**UI:** portfolio Billing, exact consequences, invoices/credits, Portal, processing/reconciliation state and role/recent-auth rules.

**Exit:** every lifecycle transition has customer notification, entitlement result, state history, audit, reconciliation and recovery test.

### FIN-01: Immutable invoices and credits

**Schema/control:** local invoice/credit sequences, header/lines/tax/discount/period/payment refs, finalized checksum/artifact, append-only payment state, provider mappings; DB grants/triggers prevent update/delete.

**Implement:** tax/billing entity capture; finalization; GCS artifact; credit/replacement; refunds/disputes; operator review; customer list/detail/download.

**Acceptance:** Thai accountant/legal validates VAT, tax invoice/receipt, credit, refund, withholding and retention. Concurrency and tamper tests prove numbering/immutability.

### FIN-02: FlowAccount

**Implement only after official contract validation:** provider-neutral adapter, field mapping, accounting outbox, idempotent external ref, encrypted/redacted evidence, rate/retry, response mapping, daily reconciliation, mismatch queue and reviewed correction.

**Tests:** sandbox create, duplicate, rejection, rate limit, network unknown, remote mutation/missing record, credit note, tax mapping and recovery.

## 9. Shared channel, widget and integration work packages

### WEB-01: Website loader and manifest

**Build:** one versioned loader, CDN manifest compatibility, exact-origin validation, isolated styles, public-safe manifest, theme/position/branding, desktop/mobile preview, install check, duplicate-launcher detection and one-launcher multi-product selection/context link.

**Runtime:** Flow/Text durable sync; Voice short-lived session token; safe fallback; unread/minimize/restore; consent/privacy; no provider identifiers.

**Tests:** hostile host CSS, wrong origin/key, cached revoked manifest, CSP, multiple loaders, mobile keyboard/safe area, accessibility/forced colors/reduced motion, offline/reconnect, package branding.

### CHAN-01: Channel framework

**Schema/services:** connections, encrypted credential refs, external accounts/identities, capability registry, inbound inbox, outbound deliveries, reply-window state, health/reauthorization and included/add-on channel slot.

**Adapters:** production LINE OA and Messenger. WhatsApp/additional website remain non-sellable until separate complete adapter/release evidence.

**Tests:** signatures, replay, duplicate identity/event, permissions/scopes, capability fallback, delivery retry, closed window, disconnect/reconnect, provider outage/rate limit and tenant isolation.

### INT-01: Integration/action framework

**Build:** connection model, envelope-encrypted credentials, JSON Schema action definitions/results, allowlist/SSRF defense, consent/confirmation, idempotency, timeout, safe retry, result reduction and audit.

**Connectors:**

- Signed tenant outbound webhooks with rotation/delivery/replay.
- Google Sheets authorization, mapping and duplicate-safe row/update behavior.
- Selected CRM lead/contact/summary/outcome integration and reconciliation.
- Scheduling availability/hold/confirm/reschedule/cancel as supported.
- Basic HTTPS API action with destination/schema/secret/rate constraints.

**Exit:** unknown outcomes remain pending/reconciled; no bot can claim external success without verified result.

## 10. Flow implementation work packages

### FLOW-01: Domain and runtime completion

**Extend:** `flowbot-domain`, `flowbot-engine`, API repositories/runtime.

**Node/content types:** text, image, video, buttons/links, call/LINE/checkout/booking, product/service card, carousel, menu/category, form, condition, tag/attribute, qualification, quotation, appointment, booking, order enquiry, department/handover, webhook/Sheets/API action and reusable fragment.

**Validation:** topic counts, graph reachability, bounded cycles, typed variables/conditions, payload/media/channel capability, referenced resources/entitlements and technical safety limits without a commercial step cap.

**Runtime:** pinned immutable revision, deterministic social/web path, idempotent inputs/actions, atomic form+lead, human takeover suppression, session/meter semantics and safe fallbacks.

### FLOW-02: Builder and onboarding

Replace raw JSON primary editing with topic list, canvas, node palette, settings inspector, condition builder, media picker, form/CTA/action configuration, validation markers, preview, publish and version history/rollback.

Support keyboard alternative, optimistic conflicts, autosave status, templates, Thai/English content, Starter/Advanced controls and onboarding sequence from the UX plan.

### FLOW-03: Website launch

Implement complete Flow rendering, forms/actions/handover/completion/restart, deployment origin/theme/snippet/install check, current-version E2E test and lifecycle evidence.

### FLOW-04: Social Flow

Connect canonical Flow runtime to LINE/Messenger inbound/outbound, channel-native buttons/media/cards/carousels/menus and reviewed fallbacks. Implement business hours, takeover, staff reply window, department assignment and no AI-meter proof.

### FLOW-05: Advanced workflows and reporting

Implement tags/attributes, qualification, quotation/appointment/booking/order templates, Sheets/webhooks/API, templates/reuse, conversation/lead exports, unanswered-input, journey/node/branch/CTA/channel/department performance and goal configuration.

**Flow release tests:** Starter 1 bot/150 topics/50k/1 admin/branding; Advanced 3 bots/500 topics/100k/one social/3 admins/no branding; all rich/action/integration/report differences and denial paths.

## 11. AI Text implementation work packages

### AI-01: Knowledge and catalogue pipeline

**Build:** signed upload, quarantine, MIME/size/hash, malware scan, sandbox extraction for TXT/PDF/DOCX, bounded SSRF-safe website import/crawl, normalized pages/source provenance, deterministic chunking, embeddings/index, immutable knowledge revision, preview/exclusion/reprocess/delete and scheduled refresh/review.

**Product catalogue:** structured product/service/category/localized fields/action bindings and tenant import/edit workflow.

**Storage/security:** GCS lifecycle, encrypted tenant paths, deletion propagation, no document instructions treated as trusted prompts.

### AI-02: Responses gateway and grounded runtime

Upgrade provider adapter from JSON mode to strict Responses Structured Outputs generated from the Sales Core schema. Handle refusal/incomplete/invalid output explicitly.

Build retrieval filters/ranking, language/model policy, safety identifier, prompt trust separation, grounded evidence, confidence/escalation, typed CTA/action, verified tool result, safe fallback, usage reservation/finalization and provider cost telemetry.

### AI-03: Text Studio/onboarding/widget

Implement agent identity/tone/instructions, knowledge binding, lead/CTA configuration, low-confidence policy, Thai/English quality test, no-side-effect preview, website theme/origin/install/publish/activate and customer widget behavior.

### AI-04: Advanced intelligence/actions

Multiple agents/collections/catalogues, additional validated languages, intent, recommendation/comparison/objection, qualification, typed tags/attributes, segment rules, explainable lead score, department routing, booking/quotation/checkout, CRM/Sheets/webhook and human correction.

### AI-05: Social Text

Connect LINE/Messenger with canonical response adaptation, one-reply metering despite delivery retry, reply-window state, handover, delivery health, reauthorization and social onboarding/test.

### AI-06: Analysis and review

Conversation/customer summary revisions/correction, question/intent/unanswered/knowledge-gap/source-coverage/channel/language/CTA/lead reports, monthly Advanced review and weekly Starter refresh evidence.

**AI release tests:** exact agents/replies/KB/channels/admins/branding/overages/packs; Thai/English plus each advertised additional language; ingestion formats/crawl/catalogue; actions/integrations/reports; outage/refusal/injection/cap and entitlement denial.

## 12. Voice implementation work packages

### VOICE-01: Web realtime productionization

**Gateway:** short-lived origin/bot token, server WebSocket to Realtime, versioned opaque protocol, audio negotiation/buffers/backpressure, interruption/turn detection, heartbeat/reconnect/resume, action bridge, terminal finalization and no provider exposure.

**Admission:** active entitlement, one/two concurrency lease, minute/cap reservation, provider availability, maximum duration and global safeguard before allocation.

**Artifacts:** transcript/summary/outcome/contact with partial/failure states; raw audio disabled by default unless approved consent/retention.

### VOICE-02: Voice Studio/onboarding/widget

Implement provider-neutral voice choice, greeting/personality, languages, knowledge, qualification, silence/interrupt/duration, disclosure/retention, callback/appointment request, test suite, website deployment/install and stable permission/connection/listening/speaking/mute/end/reconnect/action/transfer/warning states.

### VOICE-03: Telephony

Implement selected adapter for number inventory/assignment, signed call webhooks, media/SIP bridge, call legs, DTMF, consent/disclosure, operating hours, language/routing, status callbacks, CDR and carrier cost. Build merchant number status/test-call onboarding and Platform carrier health.

### VOICE-04: Transfer and scheduling

Implement department destinations, warm context, pending/connected/failed transfer, timeouts, callback fallback, confirmed scheduling, reschedule/cancel if supported, and emergency/regulated-request policy.

### VOICE-05: Analysis/languages/reporting

Validate every advertised language for ASR, reasoning, pronunciation and latency. Add intent/objection/outcome, corrected summaries, sentiment indicator with model/confidence/caveat, transfer/scheduling/lead/call performance analytics.

### VOICE-06: Meter and carrier reconciliation

Checkpoint raw seconds, finalize rounded session minutes once, release concurrency/reservation, reconcile provider sessions and CDR, separate carrier/number charge, alert anomalies and feed finance/usage UI.

**Voice release tests:** real browser/mobile microphones; Thai/English/additional languages; interruption/noise/silence/reconnect/end; 1/2 concurrency; cap/overage; real inbound calls; transfer success/failure; scheduling; CDR/meter/cost; provider/carrier outage and no silent engine downgrade.

## 13. Merchant and Platform operations work packages

### OPS-01: Unified Inbox and handover

Canonical cross-product conversation list/timeline/context; filters/assignment/unread/attention; rich events; Voice outcome; accept/reassign/reply/note/resolve/reopen/release; reply-window validation; bot suppression; mobile routed layout; delivery failure recovery.

### OPS-02: Contacts, leads and appointments

Contact identities/consent/history/tags/attributes/summaries; suggestion-only matching/merge review; lead pipeline/stage/score/source/owner/next action; request versus confirmed appointments/callbacks; external sync/reconciliation.

### OPS-03: Merchant control center

State-driven Overview, independent product lifecycles, attention queue, usage/cost, billing/contracts, add-ons/packs, team/seat limits, workspace switching, privacy/security and plan changes.

### OPS-04: Notifications, support and professional setup

In-app/email lifecycle policy and preferences; Standard/Priority routing; support case; scoped access request/banner/expiry; service request, quote/SOW, order, milestone/input, access, deliverable, acceptance and handoff.

### OPS-05: Analytics/export

Shared period/timezone/filter/freshness framework; product dashboards and cross-product business outcomes; authorization/PII controls; asynchronous CSV/JSON exports with formula protection, signed expiry and audit.

### PLAT-01: Command center and Tenant 360

Route-based Platform shell, role navigation, customer-impact metrics/attention, tenant search and masked detail combining contract/lifecycle/deployments/usage/billing/integrations/support/audit. Sensitive reads require purpose/grant/recent auth.

### PLAT-02: Commercial/finance operations

Checkout/provisioning/subscription mismatches; usage/reservation/pack/cap/provider-cost; invoice/credit/payment/refund/dispute; FlowAccount sync/mismatch; assignment, evidence, reviewed idempotent commands and no arbitrary edit.

### PLAT-03: Runtime/recovery/release

AI/Voice route governance, carrier/channel/integration health, queues/dead letters, incident safeguard/credit review, SLO/backup/security evidence and package/environment release gate.

### PLAT-04: Governance/support/audit

Catalogue/promotion draft/diff/approval/activation; support/professional access; cases; immutable audit search/export; role/recent-auth/independent-review policy.

## 14. GCP, CI/CD and operational work packages

### CLOUD-01: Project, IAM and network

- Confirm dedicated staging/production project strategy under `master-deck-476811-a8` foundation.
- Terraform remote state and deployment project/account guard.
- Separate service accounts and Workload Identity Federation.
- VPC/private services access, Cloud Run ingress, global ALB/serverless NEGs, Cloud Armor.
- DNS/certificates for public/app/api/voice/widgets/master staging and production names.
- No direct private service or unintended `run.app` exposure.

### CLOUD-02: Data/platform services

- Cloud SQL PostgreSQL 16 private IP, HA production, PITR, deletion protection, connection budgets and DB roles.
- Buckets for widgets, media, quarantine, knowledge, exports, invoice artifacts and state with public prevention/lifecycle/retention/CMEK policy.
- Cloud Tasks queues/rates/retries and Scheduler jobs.
- Secret Manager/KMS separation/rotation and tenant integration envelope encryption.
- CDN immutable bundle/manifest promotion and rollback.

### CLOUD-03: Build and deployment

- Complete Dockerfiles for all seven runtime artifacts and non-root/container contract.
- GitHub Actions: PR verify/security/Terraform plan; build/SBOM/sign/scan; staging deploy/migrate/smoke; production approval/promote same digest; rollback.
- Migration advisory lock, expand/contract enforcement and post-migration verification.
- Cloud Run sizing, concurrency, timeout, probes, min/max instances, service invocation IAM and digest pinning.

### CLOUD-04: Observability/cost/capacity

- Structured redacted logs, trace context and service/revision/tenant pseudonymous dimensions.
- SLO, product, Voice, billing/finance, queue/data, security and cost dashboards.
- Actionable alerts/runbooks/on-call ownership.
- Budget alerts beyond the initial THB 670 foundation amount for real staging/production.
- Provider/GCP unit cost and gross-margin views per plan/meter.
- Load/soak tests drive Cloud SQL tier/pools, Cloud Run min/max/concurrency, queue rates, vector choice and quotas.

### CLOUD-05: Backup and recovery

- Automated backup/PITR and GCS policies.
- Restore to isolated environment, integrity/application verification and documented evidence.
- Bangkok-region failure recovery to Singapore: DB restore/replication decision, services, secrets/keys, storage, DNS, provider callbacks and queue/webhook reconciliation.
- Split-brain prevention, return-to-primary and quarterly drills meeting RPO/RTO.

## 15. Database and migration program

### 15.1 Migration rules

- One forward-only numbered migration per coherent schema slice.
- Add tables/columns nullable or default-safe; deploy compatible readers/writers; backfill in bounded jobs; enforce constraints; remove old fields later.
- Migrations do not call external providers.
- Every tenant-owned schema includes RLS in the same migration before application access.
- Finance immutability and unique/idempotency constraints are database-enforced.
- Large indexes use an operationally safe creation strategy and query plans are captured.
- Backfills are resumable, tenant-scoped, rate-limited, observable and reconcile counts/checksums.

### 15.2 Planned migration groups

1. Catalogue/promotions/contracts/add-ons/packs.
2. Purchase/checkout/provider mappings/subscription state.
3. Usage reservations/forecasts/caps/reconciliation.
4. Lifecycle/onboarding/install evidence/notifications.
5. Knowledge sources/jobs/documents/chunks/revisions/catalogues.
6. Rich Flow content/resources/customer attributes/workflows.
7. Integrations/actions/connections/deliveries.
8. Social connection/reply-window/handover state.
9. Voice number/carrier/legs/transfers/CDR/analysis.
10. Finance invoices/credits/payments/artifacts/accounting sync.
11. Support cases/professional services/release evidence.

### 15.3 Migration acceptance

For every group: empty database migration; upgrade from current snapshot; rollback by application compatibility/feature disable; RLS/role tests; sample production-scale backfill timing; backup/restore; no orphan references; reconciliation report.

## 16. API and event contract program

### 16.1 API standards

- Zod request/response schemas with size/field limits shared where browser-safe.
- Opaque public IDs; no provider/model or secret fields in tenant/public DTOs.
- Same-origin trusted realm checks for browser mutations.
- Permission plus entitlement plus resource ownership at service boundary.
- Idempotency keys for create/publish/checkout/action/reply/transfer/finance/recovery.
- Optimistic version/ETag for drafts and configurations.
- Stable safe error codes mapped to actionable UI states.
- Cursor pagination/filter/sort for operational lists.

### 16.2 Event standards

Every event contains event ID/version, tenant/workspace where applicable, aggregate kind/id/version, occurred/recorded time, correlation/causation, idempotency source, safe payload and trace context. Consumers reject unknown incompatible versions, dedupe, and record attempts.

Principal event families:

- Identity/workspace/membership/access.
- Catalogue/contract/entitlement/add-on/pack.
- Checkout/subscription/payment/invoice/credit/accounting.
- Usage reservation/event/threshold/cap/reconciliation.
- Bot draft/publish/deploy/test/health/lifecycle.
- Conversation/message/handover/lead/contact/appointment.
- Knowledge ingestion/revision/refresh/review.
- Channel connection/inbound/delivery/reply window.
- Voice session/leg/transfer/CDR/analysis.
- Action/integration execution/sync.
- Support/professional service/audit/release.

## 17. Test and evidence strategy

### 17.1 Mandatory PR gates

Use Node 24 and pnpm 11.12.0:

```bash
scripts/use-node24.sh pnpm run lint
scripts/use-node24.sh pnpm run typecheck
scripts/use-node24.sh pnpm run test
scripts/use-node24.sh pnpm run build
scripts/test-db-integration.sh
```

Focused gates already available and extended as features land:

```bash
scripts/use-node24.sh pnpm run qa:ui-foundation
scripts/use-node24.sh pnpm run qa:p3-ui
scripts/use-node24.sh pnpm run qa:p4-flowbot
scripts/use-node24.sh pnpm run qa:p5-ai-chat
scripts/use-node24.sh pnpm run qa:p6-line
scripts/use-node24.sh pnpm run qa:p7-voice
scripts/use-node24.sh pnpm run qa:p8-voice-eval
scripts/use-node24.sh pnpm run qa:p8-voice-load
scripts/use-node24.sh pnpm run qa:p9-usage
scripts/use-node24.sh pnpm run qa:p9-operations
scripts/use-node24.sh pnpm run qa:p9-status
scripts/use-node24.sh pnpm run qa:p9-resilience
scripts/use-node24.sh pnpm run qa:p9-recovery
scripts/use-node24.sh pnpm run qa:p9-dependency-outage
scripts/use-node24.sh pnpm run qa:p9-restore
scripts/use-node24.sh pnpm run qa:release-artifacts
```

Add new gates for requirements registry, commerce lifecycle, onboarding/multi-product, knowledge ingestion, complete Flow rich/social, AI structured output/actions, telephony, finance/FlowAccount, widgets/multi-product, Platform queues, GCP deployed smoke and package acceptance.

### 17.2 Test matrix for every package

| Layer | Required evidence |
| --- | --- |
| Unit/property | Domain invariants, prices, limits, state machines, rounding, schema and calculations |
| Database | Constraints, RLS, role grants, immutability, concurrency and migrations |
| Contract | Provider request/response/webhook/event fixtures and live sandbox compatibility |
| Integration | API/service/DB/worker/gateway transaction and recovery |
| E2E | Prospect -> payment -> onboarding -> deployment -> customer -> operation -> billing |
| Negative | Role/tenant/entitlement/limit/tamper/replay/order/dependency failure |
| Accessibility | Automated WCAG plus keyboard/screen reader/manual Thai layout |
| Quality | Thai/English/additional-language grounding and Voice quality rubrics |
| Performance | Allowance/concurrency peaks, queue burst, WebSocket load and DB budgets |
| Resilience | Provider outage, dead letters, restore and regional recovery |
| Security | SAST/dependency/container/secret, isolation, webhook, SSRF/upload, prompt/action and penetration |

### 17.3 Evidence format

Each `docs/validation/market-release/<work-package>.md` records:

- Commit/build/image/widget manifest and schema migration versions.
- Environment/project/region and safe provider account mode.
- Commands with exit results and artifact/report paths.
- Requirement/test IDs covered.
- Screenshots/video/call IDs/log-query/dashboard references without secrets/PII.
- Data reconciliation counts and known exceptions.
- Reviewer, time, expiry/revalidation trigger.
- Rollback/recovery exercise result.

## 18. Security, privacy and compliance program

### 18.1 Security activities by phase

- Threat model before each new trust boundary: upload/crawl, action connector, social, telephony, checkout, finance, support access.
- Security design review before schema/provider implementation.
- Automated static/dependency/container/secret scans on every PR/build.
- Tenant isolation suite on every tenant schema/API addition.
- Provider webhook/signature/replay and SSRF tests on every adapter.
- Prompt/document injection and unapproved-action tests for AI.
- Penetration test after feature complete staging and remediation before paid GA.

### 18.2 Privacy/compliance deliverables

- Data map and classification for every new artifact.
- Purpose/consent/legal basis and disclosure for lead, transcript, audio, document, channel identity and analytics.
- Retention/deletion/export/correction/hold behavior and backup implications.
- Provider DPA/subprocessor/cross-border/residency review.
- Thai terms, privacy, promotion, cancellation/refund, third-party fees, AI/transcription/recording and tax approval.
- Customer and operator audit/export access controls.

### 18.3 Paid-GA assurance work packages

#### GA-01: Security, privacy, legal and accounting acceptance

- Close every threat-model action and high/critical scan or penetration finding.
- Run complete tenant-isolation, privileged-access and immutable-finance assurance.
- Obtain named security/privacy/accountant/legal approval for the current build, terms, data map, provider list, tax/credit workflow and retention policy.
- Record exceptions with owner, mitigation and expiry; no severity-1/2 or legally blocking exception may remain.

#### GA-02: Package and provider acceptance

- Execute every package checklist against the exact staging build/topology to be promoted.
- Validate Thai/English and each additional advertised language using approved golden sets and human review.
- Validate real website installation, LINE/Messenger account, OpenAI live restricted route and real telephone/carrier behavior where the package requires them.
- Reconcile usage/provider cost, billing, invoice/credit and accounting results for every acceptance journey.
- Update all owned requirement records to `staging_verified`; obtain product and operational review.

#### GA-03: Production pilot and readiness

- Deploy the same accepted digests/configuration schema to production with packages disabled.
- Run internal real-mode smoke journeys, then named design-partner tenants under explicit scope/limits/support.
- Monitor SLOs, quality, activation, usage/cost, finance, support and security daily.
- Review every pilot incident, correction and customer complaint; repeat affected acceptance tests.
- Complete production backup/restore, provider outage, webhook backlog and operational on-call drills.

#### GA-04: Package-by-package launch and hypercare

- Product owner signs one package sellable only after its complete shared and package record set is `accepted`.
- Activate catalogue sellability prospectively and verify public comparison/checkout immediately.
- Use controlled traffic/customer volume and predefined rollback thresholds.
- Run daily commerce/usage/provider/accounting reconciliation and product-health review during the initial 30-day hypercare period.
- Review activation, support, quality, margin and incidents before increasing quotas/traffic or enabling the next package.
- Close hypercare only when normal on-call/support/finance ownership accepts the service and no launch-specific control remains outstanding.

## 19. Observability and runbook checklist

Every work package must answer:

- What indicates success, customer impact, backlog and failure?
- Which logs/metrics/traces expose that without PII/provider leakage?
- What SLO/error budget applies?
- What alert fires, at what sustained threshold, to whom?
- What is the first safe mitigation?
- Can the capability be paused independently?
- How are accepted events/retries/dead letters/reconciliation recovered?
- How does support identify tenant/product/channel/version state?
- What customer notification/status update is required?
- What evidence proves recovery worked?

Required runbooks include checkout/provisioning, subscription mismatch, usage/cap, invoice/credit, FlowAccount, ingestion/crawl/index, Flow runtime, AI gateway, social connection/delivery, Voice web, telephony/transfer, integrations/actions, email/notifications, dead letters, dependency outage, security incident, backup/restore and regional recovery.

## 20. Rollout and rollback strategy

### 20.1 Feature rollout

1. Merge domain/schema behind non-sellable capability.
2. Deploy workers/read paths with no customer entry.
3. Enable internal test tenant.
4. Backfill/reconcile and monitor.
5. Enable write/config UI for internal/design-partner tenants.
6. Enable sandbox/live-test provider connection.
7. Run full current-version test/deployment evidence.
8. Canary selected tenant runtime traffic.
9. Accept package gate, then set package sellable.
10. Monitor activation, errors, cost, quality, support and rollback signals.

### 20.2 Rollback layers

- **UI:** route/feature disabled while preserving saved state.
- **Runtime capability:** admission paused per product/channel/provider/tenant; configured fallback remains.
- **Cloud Run:** shift traffic to prior compatible image revision.
- **Widget:** repoint manifest to prior immutable compatible bundle.
- **Provider route:** canary/admission rollback through reviewed Platform command.
- **Worker:** stop queue dispatch; accepted inbox/outbox remains durable for later replay.
- **Schema:** do not reverse destructive migrations; deploy forward correction and restore only for genuine data disaster.
- **Catalogue:** retire future version prospectively; never rewrite active contracts.
- **Finance/usage:** append correction/reversal/credit; never edit ledger facts.

Rollback criteria must be defined before enablement: security/isolation issue, billing/ledger mismatch, duplicate external actions, material quality failure, SLO burn, provider cost spike, data loss/corruption or unacceptable customer impact.

## 21. Release milestones and gates

### Milestone 0: Controlled baseline

- Requirement registry/gate operational.
- Critical ADRs/decisions owned.
- Current schema/tests/evidence mapped accurately.
- All six packages remain non-sellable.

### Milestone 1: Commercial and lifecycle foundation

- Exact catalogue/contracts/entitlements/multi-product.
- Usage meters/reservations/caps/packs foundation.
- Purchase/Checkout/webhook/activation.
- Unsubscribed, processing and active workspace states.
- Shared onboarding coordinator and route shell.

### Milestone 2: Flow packages staging-complete

- All Flow Starter and Advanced functionality, website/social, integrations, reports, billing/usage and operational journeys pass.
- Flow may enter an internal or explicitly no-charge design-partner pilot independently while other families remain non-sellable. It MUST NOT enter a paid pilot or become sellable until the finance/accounting and all shared paid-GA gates also pass.

### Milestone 3: AI Text packages staging-complete

- Knowledge ingestion/catalogue, strict model runtime, website/social, intelligence/actions/integrations/reports and usage pass.

### Milestone 4: Voice packages staging-complete

- Web Voice Starter and telephone Voice Advanced, transfers/scheduling/integrations/languages/reports/carrier/usage pass.

### Milestone 5: Finance and Platform operations complete

- Portal/lifecycle/dunning, immutable invoices/credits, FlowAccount and every required exception/support/professional/release queue pass.

### Milestone 6: GCP production-ready

- Production topology, CI/CD, IAM, secrets, quotas, monitoring, backups/restore/recovery, security and legal/accounting gates pass.

### Milestone 7: Controlled paid GA

- Internal/design-partner real journeys and incident review pass.
- Product owner signs each package independently.
- On-call/support/finance processes operate with live evidence.

## 22. Package sellability checklists

### Flow Starter

- Exact price/promotion/renewal/contract/checkout/invoice.
- One workspace/bot/admin; 150 topics; unlimited commercial steps; 50k monthly conversations.
- All promised content/cards/CTAs/forms/conditions/handover/history/basic reports/branding.
- Onboarding, test, website install/verification, runtime, meter/cap/alerts and daily operations.
- Security/accessibility/load/recovery/support evidence.

### Flow Advanced

- Starter foundations plus 3 bots/admins, 500 topics, 100k conversations, branding removal.
- Video/rich cards/carousels/menus/categories/advanced conditions/tags/attributes/workflows/routing.
- Deterministic included LINE or Messenger and optional add-on policy.
- Sheets/webhooks/API/templates/exports/unanswered/journey/performance analytics/Priority support.

### AI Text Starter

- Exact commercial lifecycle, one agent/workspace/admin, 2k replies, one KB, Thai/English, branding.
- Website/FAQ/PDF/DOCX/TXT/product/service ingestion, weekly refresh.
- Grounded FAQ/explanation/recommendation, personality/sales rules, lead/CTAs/handover/confidence.
- THB 0.35 overage and 1k/THB 299 pack with consent/cap/reconciliation.

### AI Text Advanced

- Starter plus 3 agents/5 admins/10k replies/one social/multiple collections/catalogues/additional validated languages/no branding.
- Intent/recommendation/comparison/objection/qualification/segments/tags/scores/routing/summaries.
- Booking/quotation/checkout, Sheets/webhook/CRM, exports/advanced reports/monthly review.
- THB 0.25 overage and 5k/THB 999 pack.

### Voice Starter

- Exact commercial lifecycle, one agent/admin/KB/concurrency, 150 minutes, Thai/English.
- Web widget, identity/greeting/knowledge/qualification/lead/appointment request/callback/handover.
- Transcript/summary/outcome/basic analytics and THB 6 overage.
- Realtime/interruption/reconnect/meter/disclosure/privacy/cap and failure tests.

### Voice Advanced

- Starter plus 3 agents/5 admins/2 concurrency/500 minutes/multiple collections/languages/no branding.
- Inbound telephone/number/carrier, routing/live/department transfer, confirmed scheduling/callback.
- Recommendations/comparisons/qualification, tags/sentiment indicator, Sheets/webhook/CRM and advanced reports.
- THB 5 overage, carrier/number fee itemization, real-call/load/outage/reconciliation evidence.

## 23. Business-operation readiness checklist

Before paid GA:

- Stripe business/merchant, payout, customer email, tax settings and live webhook secrets verified.
- FlowAccount and Thai accounting process operated by named finance owner.
- Refund, cancellation, dispute, credit and goodwill-credit authority documented.
- Support channels, Standard/Priority routing and escalation/on-call owners active.
- Professional setup quote/SOW/payment/access/acceptance/handoff templates approved.
- Customer terms/privacy/promotion/third-party fees/AI/recording disclosures current.
- Incident severity, status communication, customer notification and credit-review policy active.
- Provider bills/cost dashboards and gross-margin thresholds reviewed per package.
- GCP/OpenAI/carrier/social/email quotas and emergency contacts documented.
- Data subject export/erasure and security incident response exercised.
- Renewal reminders, dunning and service restriction/end behavior tested with customer-visible dates.

## 24. Critical risks and mitigations

| Risk | Impact | Mitigation/decision gate |
| --- | --- | --- |
| Scope hidden behind earlier “delivered” phase labels | Missing advertised features | 297-ID registry and sellability gate |
| Telephony/provider approval delay | Voice Advanced blocked | Select/contract early; adapter contract/test harness; do not fake acceptance |
| Thai tax/FlowAccount ambiguity | Cannot invoice compliantly | Accountant/legal and official sandbox before FIN finalization |
| Provider or social policy/quotas | Channel cannot launch reliably | Account review, live test, health/recovery and explicit non-sellable state |
| AI/Voice Thai or additional-language quality | Brand/customer harm | Golden evaluations, human review, language-by-language sellability |
| Usage/cap race or reconciliation error | Revenue loss/unexpected charge | Atomic reservation, immutable ledger, daily reconciliation, pilot limits |
| UI breadth becomes long engineering pages | Low activation/support burden | Job-oriented routes/onboarding and UX acceptance per slice |
| Multi-product entitlement/lifecycle coupling | One product blocks/breaks another | Family-scoped contracts/meters/projections and independence tests |
| Cloud Run WebSocket interruption | Poor Voice experience | Resume protocol, external leases/checkpoints, load/termination tests |
| Upload/crawl/action attack surface | Tenant/cloud compromise | Scan/sandbox/SSRF/action allowlist/threat model/pen test |
| Cross-tenant or Platform access flaw | Critical breach | RLS, separate roles/realms, negative isolation and sensitive-read audit |
| Provider costs exceed package economics | Unsustainable SaaS | Per-unit cost/margin telemetry, caps, forecasts, quotas and rollout limits |
| Large schema changes during rollout | Downtime/data corruption | Expand/backfill/switch/contract, compatible revisions, restore drills |

## 25. Planning and staffing assumptions

This is a large SaaS release spanning commerce, three automation products, realtime telephony, accounting, cloud operations and compliance. For budgeting, treat it as roughly **100-160 engineer-weeks** plus external provider/accounting/legal approval. This is a planning range, not a delivery promise.

A practical parallel team has:

- 1 product/UX owner.
- 2 backend/domain engineers.
- 1 frontend/product engineer.
- 1 AI/knowledge engineer.
- 1 Voice/telephony engineer.
- 1 platform/SRE/security engineer.
- Shared QA automation, Thai-language QA, finance/accounting/legal and support operations.

With fewer people, preserve dependency order and gates; do not compress scope by marking partial integrations complete. Flow Starter is the lowest external-dependency candidate for the first controlled package pilot, followed by Flow Advanced, AI Text Starter/Advanced, Voice Starter and Voice Advanced, but the product owner may change pilot order after commercial priorities and provider readiness are reviewed.

## 26. First execution backlog

Start in this exact order:

1. `CTRL-01`: create the 297-requirement registry, schema, checker and CI/report.
2. `CTRL-02`: record and assign every open commercial/vendor/legal decision; begin telephony, FlowAccount and CRM validation immediately.
3. `COM-01`: implement immutable exact catalogue, promotion and contract snapshots; seed all package/add-on/pack/service values with `sellable=false`.
4. `CORE-01`: add billing permissions/MFA policy and finish new-data isolation scaffolding.
5. `COM-02` and `COM-03`: complete entitlement/resource and usage/cap foundations.
6. `BILL-01`: implement the real purchase/Checkout/webhook/provisioning lifecycle.
7. `CORE-02` and `CORE-03`: implement lifecycle/onboarding read models and the new route shell.
8. Begin Flow completion (`FLOW-01`/`FLOW-02`) while shared `WEB-01`, `CHAN-01`, `INT-01`, GCP and finance foundations proceed according to dependency.
9. Do not start a public package pilot until the package-specific checklist, shared commerce/operations, and GCP staging gates pass together.

## 27. Completion definition

The V1 Market Release implementation program is complete only when:

- All 297 PRD requirements are `accepted` with current evidence.
- Every six-package sellability checklist passes independently.
- Public purchase, merchant onboarding/operation, website/social/telephone customer experience and Platform exception workflows pass end to end.
- Stripe, OpenAI, LINE/Meta, carrier, CRM/Sheets, email and FlowAccount production integrations are validated and reconciled.
- Exact plans, promotions, usage, overages, packs, add-ons, invoices and credits agree across catalogue, UI, database and providers.
- Security/privacy/legal/accounting/accessibility/performance/resilience gates pass.
- GCP production and recovery operations are exercised.
- Support, finance, professional services, on-call and incident workflows are staffed and tested.
- No critical/high defect or unowned release exception remains.
- Product owner signs the paid-GA state of every package.

## 28. Related documents

- `docs/product/djay-bots-v1-market-release-prd.md`
- `docs/design/djay-bots-v1-ui-ux-and-user-flows.md`
- `docs/architecture/djay-bots-v1-market-release-architecture.md`
- `docs/audit/commercial-package-feature-gap-2026-07-18.md`
- `docs/audit/deployment-session-checkpoint-2026-07-18.md`
- `docs/audit/accepted-behavior-matrix.md`
- `docs/adr/README.md`
- `docs/runbooks/ui-foundation.md`
- `docs/runbooks/onboarding-launch-readiness.md`
- `docs/validation/gcp-deployment-foundation.md`
- `docs/validation/release-artifacts.md`
