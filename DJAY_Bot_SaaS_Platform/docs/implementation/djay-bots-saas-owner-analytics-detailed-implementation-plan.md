# DJBOT SaaS Owner Analytics Detailed Implementation Plan

| Field | Value |
| --- | --- |
| Status | Approved execution plan; production implementation not started |
| Effective date | 2026-08-16 |
| Work package | `PLAT-05` |
| Product authority | `docs/product/djay-bots-v1-market-release-prd.md`, requirements `PLT-011` through `PLT-025` |
| Experience authority | `docs/design/djay-bots-saas-owner-analytics-contract.md` |
| Architecture authority | `docs/architecture/djay-bots-v1-market-release-architecture.md` and `docs/architecture/djay-bots-system-map.md` |
| Registry authority | `requirements/market-release-v1.yaml` |
| Clickable approval candidate | `docs/design/djay-bots-saas-owner-analytics-full-flow.html` |
| Current schema baseline | `0101_appointment_recovery_and_repeat_reschedule.sql` |
| Release effect | None until the gates in this plan are satisfied; all six packages remain `sellable: false` |

## 1. Purpose

This is the execution authority for the approved SaaS Owner analytics and merchant-intelligence scope. It converts the contract into an ordered implementation program with fixed page ownership, route and API boundaries, data sources, migrations, permissions, tests, rollout controls, rollback rules and acceptance evidence.

This plan controls **how and in what order** `PLAT-05` is implemented. It cannot change what the approved contract or PRD requires. A developer may refine an internal class, query or component name when necessary, but may not change an approved metric, field, filter, workflow, data boundary, permission, export, commercial meter or page without following the change-control process in section 3.

## 2. Non-deviation rules

These rules apply to every commit, pull request, migration, route and UI page in this work package:

1. The SaaS Owner analytics contract controls behavior and information content. The PRD controls normative requirements and commercial definitions. This plan controls sequencing and named implementation surfaces.
2. Every implementation change must name its phase and applicable `PLT-011` through `PLT-025` IDs.
3. Existing Platform Master screens, database tables or APIs may be reused, but they cannot silently narrow or replace the approved scope.
4. A clickable Platform Master experience must be reviewed page by page and explicitly approved before production UI implementation begins. Demo approval does not approve insecure data access or waive backend requirements.
5. Merchant, SaaS user, merchant end customer and Platform operator remain separate identities. Merchant subscriptions remain tenant-owned and are only referenced through user memberships.
6. Customer commercial usage and internal provider economics remain separate: Text bills approved committed replies; Voice bills approved rounded minutes; provider-native tokens, audio, seconds and costs remain internal evidence.
7. Provider/model identity remains absent from public and merchant DTOs. It is available only through dedicated Platform Owner and expressly authorized AI Operations projections.
8. No client-side hidden control, route omission or masked component is authorization. Database grants/RLS where applicable, service permissions and server DTO projections enforce every boundary.
9. Analytics is derived and rebuildable. Identity, tenancy, subscriptions, entitlement, billing, committed usage and provider evidence remain the mutation authorities.
10. A missing, delayed, unreconciled or provider-unreported value is never converted to numeric zero.
11. Money remains integer minor units plus ISO currency. Different currencies are not summed without a separately approved conversion source and timestamp.
12. Historical provider cost is pinned to the provider, model, route, native dimensions and price version effective at event time. Current prices never rewrite history.
13. No production field, metric, route, filter, export column, alert, threshold or workflow may be invented during implementation. A useful but unapproved idea is recorded as `Proposed` and excluded from the build until approved.
14. No requirement status advances merely because this plan or a demo exists. `implemented`, `staging_verified` and `accepted` require the evidence defined in section 18.
15. This work does not change merchant acquisition, package-first onboarding, trials, configuration, testing, publishing, installation, Go live, merchant dashboard, social release state or package sellability.

## 3. Change control and conflict handling

When implementation exposes a product ambiguity or conflicts with another source:

1. Stop only the affected decision or slice; continue independent approved work.
2. Record the conflict with the affected requirement IDs, current authority text, implementation consequence and available options.
3. Label every new behavior `Proposed`.
4. Obtain explicit Product Owner approval for the exact change.
5. Reconcile the owner analytics contract, PRD, architecture, UX plan, this plan, system map and requirement registry before writing the changed production behavior.
6. Add an ADR when the decision changes a durable technical boundary, provider, security property, accounting method or rollback model.

If authority remains unclear, implementation fails closed. Existing behavior and developer preference do not break the tie.

## 4. Current foundations and exact reuse boundary

The implementation must extend these existing authorities rather than duplicate them:

| Existing authority | Reuse rule |
| --- | --- |
| `identity.users`, email addresses, authentication sessions and legal acceptance evidence | Query identity-owned records through Platform-safe projections. Do not copy full user PII into analytics facts. |
| `tenancy.tenants`, memberships and roles | Remain authoritative for merchant identity, business display name, locale, timezone, membership and role. Optional approved business fields that do not yet exist require an identity/tenancy schema addition, not an analytics-only copy. |
| `tenancy.product_subscriptions`, entitlement snapshots, quota accounts, usage reservations and committed usage events | Remain authoritative for subscription entitlement and customer-facing meters. |
| Stripe immutable billing documents, events and finance reconciliation | Remain authoritative local evidence of external subscription, invoice, payment, credit, refund and dispute state. Analytics may derive projections but may not mutate billing truth. |
| `tenancy.provider_usage_events` and provider reconciliation | Remain the common native-usage and provider-cost ingestion foundation. Extend with immutable price attribution only where the current record cannot satisfy `PLT-020`. |
| Voice sessions, turns, outcomes and `operations.voice_native_usage` | Remain authoritative for exact session/turn timing, outcomes and provider-reported Voice usage. |
| Current Platform Tenant 360 function and Platform support/operations stores | Extend behind role-specific projections. Do not create a second unrestricted Tenant 360 path. |
| Platform audit, recent-authentication, support grants and role permissions | Reuse for cross-tenant reads, sensitive detail, exports and privileged actions. |
| Transactional outbox, worker leases, retries, reconciliation and object-store abstractions | Reuse for snapshots, rebuilds, scheduled reports, alerts and asynchronous exports. |

Known gaps are implementation scope, not permission to alter the contract:

- current Platform routes do not provide all approved owner analytics workspaces;
- current Platform role permissions do not express the complete analytics projection matrix;
- current subscription/provider records do not by themselves provide immutable daily MRR movement and price-at-event economics for every approved report;
- exact export artifact retention, foreign-exchange policy and alert thresholds remain decision-gated;
- optional legal business name, telephone, website and Thai registration number must be shown only when lawfully supplied and stored by an authoritative tenant/business-profile source;
- last successful login and last product activity must be derived from separate authoritative evidence and labelled accordingly.

## 5. Fixed product surface

### 5.1 Platform Master routes

The canonical route set is:

| Route | Page responsibility | Primary requirements |
| --- | --- | --- |
| `/operations/overview` | Owner Overview and role-appropriate operational summary | `PLT-012`, `PLT-025` |
| `/merchants` | Merchant directory | `PLT-013`, `PLT-022` |
| `/merchants/[tenantId]` | Expanded Merchant 360 | `PLT-024`, `PLT-022` |
| `/users` | SaaS user and membership directory | `PLT-014`, `PLT-022` |
| `/users/[userId]` | Owner-assured personal contact profile plus identity, assurance and 100-row membership detail with merchant-owned subscription context | `PLT-014` |
| `/subscriptions` | Cross-product subscription lifecycle | `PLT-015` |
| `/subscriptions/[subscriptionId]` | Subscription lifecycle and reconciliation detail | `PLT-015` |
| `/revenue` | Revenue, collection, recurring movement and margin | `PLT-016`, `PLT-020` |
| `/usage/text` | Text commercial and provider-native usage | `PLT-017`, `PLT-020` |
| `/usage/voice` | Voice sessions, meters and provider-native usage | `PLT-018`, `PLT-020` |
| `/models` | Confidential provider/model analytics | `PLT-019`, `PLT-020` |
| `/trials` | Trial funnel, allowance and conversion | `PLT-023` plus approved trial requirements |
| `/reports` | Saved views, cohorts and scheduled reports | `PLT-023` |
| `/alerts` | Deduplicated analytics and business-risk alerts | `PLT-023` |
| `/exports` | Export creation and audit history | `PLT-021`, `PLT-022` |
| `/exports/[exportId]` | Export scope, status, assurance, download and lifecycle | `PLT-021` |

The existing `/tenants/[tenantId]` route becomes an internal permanent redirect to `/merchants/[tenantId]` after the new Merchant 360 reaches parity. It must not retain separate query or authorization logic.

Existing release, incidents, recovery, commerce, fulfillment, support, catalogue and access routes remain separate operational surfaces.

### 5.2 API routes

All routes use Platform authentication, server-side permissions, allowlisted input schemas, cursor pagination where applicable, non-revealing not-found behavior and role-specific response DTOs.

```text
/platform/analytics/overview
/platform/analytics/merchants
/platform/analytics/merchants/[tenantId]
/platform/analytics/users
/platform/analytics/users/[userId]
/platform/analytics/subscriptions
/platform/analytics/subscriptions/[subscriptionId]
/platform/analytics/revenue
/platform/analytics/usage/text
/platform/analytics/usage/voice
/platform/analytics/models
/platform/analytics/trials
/platform/analytics/reports
/platform/analytics/reports/[reportId]
/platform/analytics/alerts
/platform/analytics/alerts/[alertId]
/platform/analytics/exports
/platform/analytics/exports/[exportId]
/platform/analytics/exports/[exportId]/download-grant
```

Mutation endpoints for reports, alerts and exports use explicit commands and idempotency keys. The browser never supplies authoritative tenant, subscription, provider, model, price, row count, artifact path or permission values.

## 6. Server authorization and DTO matrix

Add these permissions to `packages/authorization/src/index.ts` and enforce them in API services and stores:

```text
platform.analytics.overview.read
platform.analytics.merchants.read
platform.analytics.users.read
platform.analytics.subscriptions.read
platform.analytics.revenue.read
platform.analytics.usage.read
platform.analytics.models.read
platform.analytics.reports.manage
platform.analytics.alerts.manage
platform.analytics.exports.request
platform.analytics.exports.download
```

The fixed role projection is:

| Capability | Owner | Finance | AI Operations | Support |
| --- | :---: | :---: | :---: | :---: |
| Full approved Overview | Yes | Finance projection | Usage/quality projection | Support-risk projection |
| Merchant directory | Full approved fields | Commercially necessary fields | Pseudonymous by default | Masked support fields |
| SaaS user directory | Yes; full contact detail requires recent assurance, purpose and audit | No | No | No; owner/support contact only through merchant projection |
| Subscriptions | Yes | Yes | Pseudonymous entitlement context only | Masked state needed for support |
| Revenue and finance | Yes | Yes | No | No |
| Text/Voice usage | Yes | Aggregated cost/allowance | Yes, pseudonymous by default | Limited support diagnostics |
| Provider/model identity | Yes | No | Yes | No |
| Reports/alerts | Full | Finance-scoped | AI-scoped | Support-scoped |
| Exports | Full governed scope | Finance-scoped | Pseudonymous AI scope | No bulk sensitive export |

Each role receives a distinct server DTO. Sensitive fields are never fetched and then hidden in client code. AI Operations may resolve a pseudonymous merchant to identity only through an approved incident task and audited access path. Support content remains masked unless a separate time-limited support grant authorizes a specific workspace purpose.

## 7. Package and source layout

Create one provider-neutral domain package and extend the existing API, database, worker and Platform applications:

```text
packages/platform-analytics/
  src/index.ts
  src/contracts.ts
  src/filters.ts
  src/metrics.ts
  src/permissions.ts
  src/states.ts
  src/*.test.ts

packages/db/src/platform-owner-analytics-store.ts
packages/db/src/platform-owner-analytics-worker-store.ts
packages/db/src/platform-owner-analytics-*.integration.test.ts

apps/api/app/platform/analytics/**/route.ts
apps/api/lib/platform-owner-analytics-service.ts
apps/api/lib/platform-owner-analytics-service.test.ts

apps/workers/src/platform-owner-analytics.ts
apps/workers/src/platform-owner-analytics.test.ts

apps/platform-master/app/(analytics)/**
apps/platform-master/components/analytics/**
apps/platform-master/lib/analytics/**

scripts/qa-platform-owner-analytics.mjs
docs/validation/platform-owner-analytics-<date>.md
```

`packages/platform-analytics` contains pure types, calculation rules, filter parsing, state semantics and permission-aware contract helpers. It does not import a database client, Next.js, provider SDK, object-store SDK or browser API. The repository boundary checker must explicitly permit only API, workers, Platform Master and database adapters to depend on it.

## 8. Database migration sequence

Migration identifiers are reserved in this order. If another approved work package claims one before implementation begins, update this plan and the registry first; do not silently renumber files during development.

### 8.1 `0102_platform_owner_analytics_foundation.sql`

Deliver:

- `platform.analytics_refresh_runs` and `platform.analytics_watermarks` with source name, requested/started/completed time, high-water mark, state, error classification and build/version identity;
- indexes needed for server-side merchant, user, membership, subscription and activity queries;
- permission-safe directory/detail functions or views for Owner, Finance, AI Operations and Support projections;
- canonical freshness, reconciliation and availability states;
- authoritative derivation of last successful login versus last product activity;
- no copied user email, telephone or full name in general analytics fact tables.

Tests must prove role projection, non-revealing ID substitution, cursor stability, timezone behavior and `zero` versus `missing/delayed/unreconciled` states.

### 8.2 `0103_platform_subscription_revenue_analytics.sql`

Deliver:

- `platform.subscription_daily_snapshots` keyed by immutable subscription, commercial version, day and currency;
- `platform.recurring_revenue_movements` for new, expansion, contraction, reactivation and churned MRR;
- finance projection facts that reference immutable billing event/document evidence rather than duplicating mutation authority;
- definition version and calculation-input references on every materialized recurring metric;
- lifecycle dates required by the approved contract;
- late-event and reversal correction records that preserve prior evidence.

MRR excludes trials, one-time setup, tax, credits and uninvoiced usage. ARR is `MRR × 12`. Gross invoiced, cash collected, net collected, credits, refunds, chargebacks and operational MRR remain separate measures.

### 8.3 `0104_platform_text_voice_model_economics.sql`

Deliver:

- immutable `platform.provider_price_versions` with provider, model/route, capability, currency, native unit dimensions, effective interval, approval/evidence reference and status;
- immutable `platform.provider_cost_facts` tied to the original provider usage/session/request evidence;
- Text projections separating committed replies from provider-native input, cached-input, output, reasoning and total tokens;
- Voice projections separating exact connected seconds from customer-facing rounded minutes and preserving sessions, outcomes, native audio/text units and selected voice attribution;
- provider/model/route/price versions pinned at event time;
- explicit `not_reported` state for absent provider dimensions;
- no provider/model fields in tenant-accessible views or DTO sources.

### 8.4 `0105_platform_analytics_reports_alerts.sql`

Deliver:

- `platform.saved_analytics_views` with owner, scope, canonical filter expression, selected columns and visibility;
- `platform.analytics_report_definitions` and immutable `platform.analytics_report_runs`;
- `platform.analytics_alerts` and `platform.analytics_alert_events` with deduplication key, severity, assignment, deep link, state and authoritative resolution evidence;
- approved daily, weekly and monthly scheduling state without assuming an unapproved delivery channel;
- indexes for active alerts, due report runs and cohort queries.

### 8.5 `0106_platform_analytics_exports.sql`

Deliver:

- `platform.analytics_export_jobs` containing requester, purpose, role scope, assurance evidence, canonical filter snapshot, selected-column snapshot, requested format, estimated/final row count, idempotency key and lifecycle state;
- `platform.analytics_export_artifacts` containing provider-neutral object reference, encryption metadata reference, checksum, size, created/expiry/revoked/deleted times and deletion state;
- `platform.analytics_export_downloads` recording grant and download evidence without storing bearer grants in plaintext;
- immutable status transitions and scoped worker leases;
- deletion and expiry jobs that are safe to repeat.

The exact artifact retention duration remains configuration-blocked until approved. Production must not apply an invented default.

Every migration is additive, updates `packages/db/src/schema.ts` and the current schema-version assertion, includes grants and revocations, and receives both forward integration tests and a documented application rollback. Analytics facts are not destructively removed during an application rollback.

## 9. Metric and state contract implementation

`packages/platform-analytics/src/metrics.ts` must express every approved definition as a pure, versioned calculation with golden fixtures:

- merchant counts and lifecycle segments;
- trials, conversion and deployment funnel;
- active subscriptions by family/package;
- gross invoiced, cash collected and net collected;
- Daily and Monthly `Net revenue` presentation series bound to the `net_collected` metric key;
- MRR, ARR, new, expansion, contraction, reactivation and churned MRR;
- ARPM with visible denominator;
- Text committed replies, provider-native tokens, latency, reliability, quality and cost;
- Voice exact seconds, rounded billable minutes, sessions, outcomes, latency, reconnects and cost;
- variable gross margin with an explicit allocation/version label;
- quota usage, remaining allowance and reset state;
- freshness and reconciliation qualification.

Every result DTO carries:

```text
value or unavailable state
unit
currency where applicable
period start/end
comparison basis
reporting timezone
source freshness time
reconciliation state
definition version
```

The shared presentation states are `value`, `zero`, `empty`, `not_reported`, `delayed`, `incomplete`, `reconciliation_required` and `unavailable`. Components must render them distinctly.

## 10. Filter, search and pagination contract

`packages/platform-analytics/src/filters.ts` owns one allowlisted grammar used by directories, URL state, saved views and export snapshots.

Rules:

- parse and validate filters on the server;
- normalize aliases, sorting and date/timezone boundaries into one canonical form;
- reject unknown fields/operators instead of ignoring them;
- intersect requested filters and columns with the actor's permission scope;
- use stable cursor pagination with a deterministic tie-breaker;
- use bounded page sizes and indexed predicates;
- allow `25`, `50` and `100` for User Detail membership pages, with `100` available to the Product Owner;
- preserve the canonical filter expression in the URL and export request;
- never accept raw SQL, column identifiers, provider IDs or object paths from the client;
- compute export row estimates from the same scoped query plan used for generation.

Merchant, user, subscription, Text, Voice, model, trial and alert filters are separate typed schemas. A field available to Owner does not automatically become filterable to another role.

## 11. Read models, workers and reconciliation

The worker implementation proceeds in this order:

1. Consume or scan immutable source evidence using per-source high-water marks.
2. Write idempotent derived facts keyed by immutable source IDs and definition/price version.
3. Record refresh-run and watermark state transactionally.
4. Detect late, reversed or corrected source evidence and append correction facts.
5. Rebuild a selected period, merchant or source without changing mutation authority.
6. Reconcile aggregate totals to source ledgers and surface mismatch state.
7. Emit alert/report/export commands only after the corresponding derived state commits.

Required controls:

- `PLATFORM_OWNER_ANALYTICS_WORKER_ENABLED=false` by default;
- bounded batches, leases, retries and dead-letter classification;
- idempotent rebuild command with dry-run scope and immutable audit;
- no full-table unbounded rebuild from an HTTP request;
- metrics for watermark lag, refresh failure, mismatch count, report delay, export delay and deletion failure;
- kill switch that stops new derived work without disabling source ledgers.

## 12. API implementation order

API development occurs only after the corresponding domain contract and database integration suite pass:

1. Overview, merchant directory/detail and user directory/detail.
2. Subscription directory/detail and revenue.
3. Text usage, Voice usage and confidential model analytics.
4. Trials, reports and alerts.
5. Exports and download grants.

Each route receives:

- Zod request and response schemas;
- explicit permission and recent-assurance requirements;
- request/purpose/audit context;
- canonical filter and cursor parsing;
- bounded timeout and error mapping;
- role-specific DTO construction in the service layer;
- non-revealing `404` for unauthorized resource substitution;
- structured telemetry without PII, provider confidentiality or secrets;
- contract tests for every role and state.

## 13. Page-by-page demo gate

Before production UI code is written, create one complete clickable Platform Master reference covering every route in section 5.1. The review candidate is `docs/design/djay-bots-saas-owner-analytics-full-flow.html`. It must demonstrate desktop, mobile, keyboard flow and the following states:

- default and combined filters;
- saved view and clear filters;
- empty, zero, delayed, incomplete, reconciliation-required and error states;
- Owner, Finance, AI Operations and Support projections;
- merchant/user/subscription detail navigation;
- multi-currency grouping without false totals;
- Text reply versus token economics;
- Voice seconds versus billable minutes;
- provider/model confidentiality;
- report scheduling and alert assignment/resolution;
- export preview, recent-assurance request, queued/running/complete/failed/expired/revoked/deleted states.

Approval is recorded page by page. A single approval of one page or generic approval of the overall idea does not approve omitted or materially different pages. Sample data is illustrative and cannot establish production rules.

## 14. Production Platform Master UI implementation

After the demo gate, implement the approved pages in the same order as the API. Shared UI components include:

- reporting period, comparison, timezone and currency context;
- server-backed filter bar and active-filter summary;
- accessible data table with column selection, stable pagination and export scope;
- metric card with unit, definition, freshness and reconciliation state;
- chart with table alternative and non-color-only status encoding;
- StoreHub POS-inspired Daily/Monthly finance trend interaction with pointer and keyboard readout, selected-currency isolation and exact-value table parity;
- masked/sensitive-field treatment with purpose and assurance flow;
- role-aware navigation derived from server capability, not hardcoded role names;
- loading skeleton, empty, unavailable, delayed, partial and error states;
- page-level audit/request identifier for support diagnosis.

The UI must not calculate authoritative finance, entitlement, cost or permission results. It renders server-provided values and definitions. URL state remains shareable only within the recipient's existing permissions.

## 15. Reports, alerts and exports

### 15.1 Reports and alerts

- Reports use saved, canonical, permission-scoped definitions.
- A scheduled run snapshots definition version, filter, timezone, currency treatment and actor scope.
- Delivery occurs only through channels already approved for that report class.
- Alerts use deterministic deduplication keys and state transitions.
- Thresholds that have not been approved remain disabled and visibly unconfigured.
- Resolving an alert requires authoritative evidence or a reason; hiding a card is not resolution.

### 15.2 Exports

- Export creation previews scope, selected columns, exclusions, data classes and estimated row count.
- Personal, financial, provider-confidential or cross-tenant detail requires recent MFA/reauthentication and an operator purpose.
- Generation occurs in a worker through a provider-neutral object-store interface.
- CSV is UTF-8 and formula-neutralized; JSON follows a versioned schema.
- Artifacts are encrypted, short-lived, integrity-checked and downloaded through single-purpose short-lived grants.
- Secrets, credentials, payment instruments, end-customer content, transcripts and recordings are structurally absent from export column registries.
- Privacy-rights exports remain a separate workflow.
- Expiry, revocation, download and deletion receive immutable audit evidence.

## 16. Decision-gated configuration

The following choices are not approved by the contract and must not be guessed:

| Decision | Safe implementation before approval | Production gate |
| --- | --- | --- |
| Exact export artifact retention | Implement required setting and lifecycle states | Fail closed when unset |
| Export object-storage provider | Use existing provider-neutral interface | Enable only after provider/security approval |
| Cost-anomaly threshold/formula | Build disabled threshold configuration | No anomaly alerts until approved |
| Negative-margin threshold | Show reconciled margin without automatic alert | No alert until approved |
| Foreign-exchange source/rate policy | Group and export currencies separately | No converted cross-currency total |
| Scheduled-report recipients/channels | In-platform approved-role delivery only where already approved | External delivery remains disabled |
| Provider price source and approval workflow | Accept only immutable approved price versions with evidence | No inferred or scraped prices |

These gates do not block the page demo, domain contracts or source integrations that can render `Unconfigured` honestly.

## 17. Test and quality program

### 17.1 Golden fixture

Create one version-controlled fixture with at least:

- two unrelated merchants and one SaaS user with memberships in both;
- all approved tenant membership roles;
- separate Flow, Text and Voice subscriptions;
- trial, active, past-due, scheduled-cancel, cancelled and reactivated lifecycles;
- monthly and annual recurring prices, discounts, tax presentation and multiple currencies;
- successful, failed and reversed payments; credit, refund and chargeback evidence;
- upgrade, downgrade, added product, contraction, churn and reactivation;
- registered-but-not-deployed and first-live-use milestones;
- Text replies with all provider token categories plus a provider that omits categories;
- Voice exact seconds whose commercial rounding differs, reconnects, transfers and outcomes;
- provider/model/route and price changes mid-period;
- late and corrected provider/billing events;
- unreconciled, delayed, empty, unavailable and true-zero states.

### 17.2 Unit tests

- exact metric definitions and movement classification;
- Daily and Monthly net-collected bucket boundaries, comparison parity and `Net revenue` display-label binding;
- money, currency and reporting-timezone boundaries;
- canonical filter parsing and rejection;
- stable cursor construction;
- state presentation semantics;
- role-to-permission and DTO redaction;
- provider/model confidentiality;
- Text/Voice meter separation;
- price-at-event cost calculations;
- spreadsheet formula neutralization and JSON schema versioning.

### 17.3 Database integration suites

Create and explicitly invoke these suites from `scripts/test-db-integration.sh`:

```text
platform-owner-analytics-directory.integration.test.ts
platform-owner-analytics-subscription-revenue.integration.test.ts
platform-owner-analytics-usage-model.integration.test.ts
platform-owner-analytics-reports-alerts.integration.test.ts
platform-owner-analytics-export.integration.test.ts
```

They must test immutable facts, idempotency, late/reversed evidence, rebuild equivalence, role projections, cross-tenant substitution, export artifact scope, deletion, grants and schema rollback compatibility. The integration runner must fail if a new suite exists but is not invoked.

### 17.4 API contract tests

For every route and Platform role, test allowed fields, structurally absent fields, denied scopes, assurance expiry, invalid filters, cursor tampering, unknown IDs, duplicate commands, provider/model redaction and audit evidence. User Detail contract tests also prove Owner-only full identity contact projection, recent-assurance expiry, required purpose, immutable audit, structural secret exclusion, the 100-row page-size option, stable continuation and the separation of membership first-join data from merchant subscription start and expiry/access-end data.

### 17.5 UI and browser tests

Component and interaction tests cover URL filters, table controls, accessible names, keyboard order, chart alternatives, pagination, masking and all data states. Overview tests cover Daily/Monthly switching, pointer readout, left/right keyboard traversal, exact table parity, selected-currency isolation and missing/delayed/reconciliation states. After explicit action-specific browser authorization, project-managed headless Playwright Chromium covers every page at desktop and mobile widths. It must not access the user's browser/profile, and every Chromium process must be closed after the run.

### 17.6 Performance and resilience tests

- query plans prove indexed predicates and no unbounded list scans;
- API page sizes and export batches are bounded;
- worker restart and duplicate delivery preserve idempotency;
- source delay or provider outage produces delayed/incomplete state rather than false zero;
- object-store failure cannot mark an export complete;
- download-grant replay, expiry and revocation fail closed;
- analytics kill switch leaves authoritative product and billing paths operational.

No numeric latency or volume SLA is invented. The release evidence records measured results, and a separate approved decision sets any new contractual threshold.

## 18. Phased execution and gates

| Phase | Deliverable | Entry | Exit gate |
| --- | --- | --- | --- |
| `OA-00` | Authority and traceability lock | Approved owner contract | This plan linked across authorities; registry validates; all requirements remain planned |
| `OA-01` | Full clickable Platform Master demo | `OA-00` | Explicit page-by-page Product Owner approval recorded |
| `OA-02` | Pure contracts, metrics, filters, states and permission matrix | Approved demo for presentation; approved contract for behavior | Unit/golden tests pass; no provider or DB coupling |
| `OA-03` | Migration `0102`, directories and analytics foundation | `OA-02` | DB role/isolation/cursor/freshness tests pass |
| `OA-04` | Migration `0103`, subscriptions and revenue | `OA-03` | Golden lifecycle/revenue/reversal/currency tests pass |
| `OA-05` | Migration `0104`, Text/Voice/model economics | `OA-03` | Commercial/native separation, confidentiality and cost-snapshot tests pass |
| `OA-06` | Migration `0105`, reports and alerts | `OA-04`, `OA-05` | Schedule/dedup/assignment/resolution tests pass; unapproved thresholds disabled |
| `OA-07` | Migration `0106`, governed exports | `OA-03` | Scope/assurance/encryption/grant/expiry/deletion tests pass; retention decision gate honored |
| `OA-08` | Rebuildable workers and reconciliation | `OA-04` through `OA-07` | Idempotent rebuild and source-total reconciliation evidence passes |
| `OA-09` | Platform analytics APIs | Corresponding DB slices complete | Role DTO, negative authorization and audit contract tests pass |
| `OA-10` | Production Platform Master UI | `OA-01` approved and corresponding APIs complete | UI/component tests and visual parity review pass page by page |
| `OA-11` | Full local release validation | `OA-02` through `OA-10` | Lint, typecheck, build, unit, DB, contract, boundary and authorized browser suites pass |
| `OA-12` | Staging backfill, reconciliation, security and usability evidence | `OA-11`; provider/config decisions approved | Production-like staging evidence and rollback drill pass |
| `OA-13` | Formal acceptance | `OA-12` | Authorized reviewer accepts each mapped requirement; release gate separately evaluates sellability |

Phases `OA-04`, `OA-05` and `OA-07` may be developed in parallel after their common entry gates, but none may bypass its own tests or merge a conflicting schema decision.

## 19. Requirement traceability

| Requirement | Primary phases | Principal implementation | Required evidence |
| --- | --- | --- | --- |
| `PLT-011` | `OA-00`, all | Authority links, change control, registry | Authority/registry validation and deviation review |
| `PLT-012` | `OA-02` to `OA-10` | Overview metrics, Daily/Monthly Net revenue trend, read models, API and page | Golden metrics, chart/table parity, currency, state/freshness and role tests |
| `PLT-013` | `OA-03`, `OA-09`, `OA-10` | Merchant directory/filter/export scope | Search/filter/cursor/role/tenant-negative tests |
| `PLT-014` | `OA-03`, `OA-09`, `OA-10` | Owner-assured personal contact profile and 100-row User Detail memberships | Contact projection, assurance, audit, secret-exclusion, multi-membership, date-field, pagination and subscription-attribution tests |
| `PLT-015` | `OA-04`, `OA-09`, `OA-10` | Subscription snapshots and detail | Lifecycle, reconciliation, immutable commercial-version tests |
| `PLT-016` | `OA-04`, `OA-08` to `OA-10` | Revenue movements and margin | Definition, reversal, currency and reconciliation fixtures |
| `PLT-017` | `OA-05`, `OA-08` to `OA-10` | Text replies/native usage/economics | Reply/token separation, missing-category and confidentiality tests |
| `PLT-018` | `OA-05`, `OA-08` to `OA-10` | Voice seconds/minutes/session economics | Rounding, outcome, native usage and price-snapshot tests |
| `PLT-019` | `OA-02`, `OA-05`, `OA-09`, `OA-10` | Model projection and role DTOs | Owner/AI allowed; Finance/Support/tenant structural absence |
| `PLT-020` | `OA-05`, `OA-08` | Price versions and cost facts | Provider/model/route/currency/unit price-at-event tests |
| `PLT-021` | `OA-07`, `OA-09`, `OA-10` | Governed export lifecycle | Scope, assurance, spreadsheet safety, encryption and deletion tests |
| `PLT-022` | `OA-02`, `OA-03`, `OA-07`, `OA-09` | Projection/redaction/export allowlists | End-customer content and secret structural-exclusion tests |
| `PLT-023` | `OA-06`, `OA-08` to `OA-10` | Cohorts, reports and alerts | Funnel/cohort, dedup, scheduling and resolution tests |
| `PLT-024` | `OA-03` to `OA-10` | Merchant 360 extension | Masked default, support grant, idempotent action and audit tests |
| `PLT-025` | `OA-02` to `OA-12` | Read-model state, rebuild/reconcile | Rebuild equivalence, timezone, currency and freshness evidence |

The registry records this plan as a runbook while implementation paths, migrations, APIs, UI routes, test IDs and evidence remain empty until they actually exist.

## 20. Rollout and rollback

Rollout is additive and disabled by default:

- `PLATFORM_OWNER_ANALYTICS_ENABLED=false` hides new API/UI entrypoints but never grants permission;
- `PLATFORM_OWNER_ANALYTICS_WORKER_ENABLED=false` prevents read-model processing;
- migrations add facts, indexes and projections without changing authoritative source writes;
- backfills start with a bounded dry run, then one period/source at a time with reconciliation;
- Owner-only internal tenants receive the first staging and production-disabled exposure;
- Finance, AI Operations and Support projections enable only after their negative authorization suites pass;
- export generation remains disabled until storage, retention, assurance and deletion configuration is complete.

Rollback disables UI, APIs and workers, then returns reads to existing operational pages. It does not delete immutable analytics, provider or finance evidence. A corrected forward migration handles schema defects. No rollback may alter customer entitlements, usage ledgers, billing state, provider routing or published bots.

## 21. Definition of done

This work package is complete only when:

- every approved page exists and matches the page-by-page approved demo;
- `PLT-011` through `PLT-025` have real implementation, migration, API, UI, test and evidence mappings;
- role-specific server projections and negative tests pass;
- revenue, Text, Voice and cost golden fixtures reconcile to immutable sources;
- reports, alerts and exports satisfy their security and lifecycle contracts;
- rebuild, replay, late-event, outage, rollback and kill-switch drills pass;
- accessibility, responsive and keyboard acceptance is recorded after authorized browser testing;
- staging uses production-like topology and approved provider/config decisions;
- the authorized reviewer accepts each requirement;
- a separate release-gate decision determines whether any package may become sellable.

Until then, the accurate status is: **approved and planned, not implemented, not staging-verified, not accepted and not sellable**.
