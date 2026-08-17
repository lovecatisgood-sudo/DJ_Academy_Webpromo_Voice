# DJBOT SaaS Owner Analytics and Merchant Intelligence Contract

| Field | Value |
| --- | --- |
| Status | Approved normative product contract |
| Effective date | 2026-08-16 |
| Product owner | DJBOT SaaS Owner |
| Applies to | Platform Master owner analytics, merchant and user directories, subscriptions, revenue, Text and Voice usage, provider/model economics, reports, alerts, and operator exports |
| Does not change | Public acquisition, merchant onboarding, bot configuration, testing, publishing, installation, Go live, or merchant dashboard flows |
| Commercial authority | `docs/product/djay-bots-v1-market-release-prd.md` |
| Execution authority | `docs/implementation/djay-bots-saas-owner-analytics-detailed-implementation-plan.md` |
| Clickable approval candidate | `docs/design/djay-bots-saas-owner-analytics-full-flow.html` |

## 1. Purpose and authority

This contract is the single source of truth for the SaaS Owner analytics and merchant-intelligence part of DJBOT. It converts the approved product-owner request into exact page ownership, definitions, fields, filters, exports, access rules, and data boundaries.

When another document, demo, existing screen, implementation shortcut, or historical plan disagrees about this scope, this contract controls the owner-dashboard experience and information model. The market-release PRD still controls commercial package terms and normative requirement IDs. Architecture controls technical realization without changing the behavior recorded here.

No developer or agent may add, remove, rename, merge, reinterpret, or silently substitute a metric, filter, field, role boundary, export, or owner workflow in this scope. A change must first be presented as `Proposed`, approved by the product owner, and reconciled into this contract, the PRD, architecture, UX plan, implementation plan, system map, and executable requirement registry.

Implementation must follow the phase gates, route ownership, migration sequence, server authorization matrix and evidence rules in `docs/implementation/djay-bots-saas-owner-analytics-detailed-implementation-plan.md`. That plan controls execution order but cannot change this contract's behavior.

Existing partial Platform Master pages are implementation evidence, not permission to reduce this contract. Sample records in future clickable demos are illustrative only.

## 2. Account and data concepts

DJBOT must keep these concepts distinct:

| Concept | Meaning | Ownership rule |
| --- | --- | --- |
| Merchant | One tenant/business customer of DJBOT | Owns contracts, subscriptions, bots, deployments, commercial usage, and team memberships |
| SaaS user | A human who can authenticate to one or more merchant workspaces | Owns identity, authentication and membership records; does not personally own the merchant subscription |
| Merchant owner | The active Tenant Master Admin for a merchant | Holds primary business authority but still uses the merchant's subscriptions |
| Merchant team member | Admin, operator, conversation manager, human agent, analyst, billing manager, or read-only support user | Receives access through membership and role; never receives a duplicated personal subscription record |
| Merchant end customer | A person who talks to a merchant's Flow, Text, or Voice Bot | Remains tenant-scoped customer data and is not part of the ordinary SaaS user directory |
| Platform operator | DJAI Owner, AI Operations, Finance, or Support user | Uses a separate Platform identity, session, permission set and audit boundary |

If a SaaS user belongs to multiple merchants, the user detail page lists each membership separately. Each merchant's subscription remains attached to that merchant. The UI may say that a user has access through a merchant subscription; it must not attribute merchant revenue or subscription ownership to every team member. The membership row keeps the user's first-join date separate from the merchant subscription's start and expiry or access-end dates.

## 3. Platform Master navigation

The approved owner navigation contains these routes or equivalent stable route groups:

1. **Owner Overview** — SaaS health, growth, revenue, cost, conversion and immediate attention.
2. **Merchants** — searchable, filterable and exportable business-account directory.
3. **Users** — searchable, filterable and exportable SaaS identity and membership directory.
4. **Subscriptions** — complete Flow, Text and Voice subscription lifecycle.
5. **Revenue** — recurring revenue, invoicing, collection, refund, credit and margin analysis.
6. **AI & Voice Usage** — customer-facing meters and internal provider-cost meters.
7. **Models** — owner-only provider/model utilization, quality, reliability and cost.
8. **Trials & Conversion** — eligibility, provisioning, expiry, usage and paid conversion.
9. **Reports & Alerts** — saved views, scheduled reports, threshold alerts and anomaly queues.
10. **Exports** — governed export creation, status, download and audit history.
11. **Merchant 360** — one merchant's identity, team, products, subscriptions, usage, economics, deployments, support, incidents and audit evidence.

Existing operational areas for release, incidents, recovery, fulfillment, support access, catalogue, finance reconciliation and provider controls remain available. They may be grouped beneath Operations, Finance, Providers or Governance, but they must not replace the approved analytics pages.

## 4. Owner Overview

### 4.1 Required summary metrics

The Overview must show a selected period and comparison period. At minimum it includes:

- total merchants;
- active, trial, past-due, suspended, cancelled and churned merchants;
- new merchants and activated merchants;
- active Flow, Text and Voice subscriptions and deployments;
- trial-to-paid conversion;
- monthly recurring revenue (`MRR`) and annual recurring revenue (`ARR`);
- new, expansion, contraction, reactivation and churned MRR;
- gross invoiced amount, cash collected, refunds, credits and failed payments;
- average recurring revenue per active paying merchant;
- Text provider cost, Voice provider cost, total variable provider cost and gross margin;
- Text replies and tokens, Voice sessions and billable minutes, and quota consumption;
- merchants nearing a usage limit, trial expiry, renewal or cancellation;
- merchants that registered but did not deploy;
- unhealthy deployments, provider/model incidents and unresolved support risk.

### 4.2 Overview behavior

Every metric states its period, currency, timezone, data freshness and comparison basis. A metric with incomplete or unreconciled data shows `Incomplete` or `Reconciliation required`; it never displays a fabricated zero.

Cards link to the corresponding filtered detail page. Attention items are ordered by customer impact and business risk rather than arbitrary recency.

The Overview includes a StoreHub POS-inspired finance trend chart with a visible `Daily` and `Monthly` switch. Its display label is `Net revenue`, and its authoritative metric key and definition remain `net_collected`: successfully settled cash minus refunds and chargebacks for the selected period. The chart is operational reporting, not statutory recognized revenue. Daily view plots one point per reporting-calendar day; Monthly view plots one point per reporting-calendar month. Each view shows the selected currency only, never sums currencies without an approved conversion source, carries timezone, freshness, reconciliation and comparison context, supports pointer and keyboard point inspection and provides an accessible table with the same values.

## 5. Merchant directory

### 5.1 Required columns and details

Each merchant record supports these fields, subject to column selection and permission:

- merchant ID;
- business display name and legal name when supplied;
- owner name, owner email and email-verification status;
- business telephone and website when supplied;
- Thai registration number when supplied;
- country, locale and timezone;
- account creation, provisioning and activation dates;
- onboarding and deployment status;
- last authenticated activity and last product activity;
- subscribed product families and package names;
- trial, active, past-due, suspended, cancelled or closed lifecycle;
- current recurring value and billing currency;
- current-period start, renewal/end and scheduled cancellation dates;
- product usage percentage and next reset;
- team-member count;
- open support tickets and incidents;
- explainable merchant-health indicators.

The list uses server-side search, sorting and pagination. It must not load the complete merchant population into a browser or rely on client-only filtering.

### 5.2 Merchant filters

The approved filter set includes:

- Flow, Text or Voice family;
- Starter or Advanced package;
- free trial or paid access;
- subscription and merchant lifecycle status;
- verified or unverified owner email;
- configured, published, installed, verified or live deployment state;
- registered but not deployed;
- subscription start, trial expiry, renewal, cancellation or service-end date range;
- recurring-revenue range;
- usage-percentage band and exhausted quota;
- language, country and timezone;
- payment failure or reconciliation state;
- support, incident and merchant-health state;
- acquisition source when lawfully recorded;
- Text/Voice provider and model for Platform Owner or authorized AI Operations only.

Filters can be combined, cleared, represented in the URL, and saved as an owner view. Export uses the same server-authoritative filter expression.

## 6. SaaS user directory

### 6.1 Required user information

Each user record includes:

- user ID;
- full name;
- email and verification status;
- telephone when supplied;
- personal contact or mailing address when lawfully supplied;
- account creation date;
- last successful login and last activity;
- active, invited, locked, suspended or closed account state;
- MFA status without exposing MFA secrets;
- preferred language;
- accepted Terms and Privacy versions and acceptance timestamps;
- merchant memberships, business names, roles and membership states;
- merchant subscriptions available through each membership;
- invitation and activation state.

### 6.2 User detail membership list

The user detail page provides a server-paginated membership list with a selectable 100-results-per-page option. Each membership row includes:

- merchant name;
- company role;
- membership state;
- first join date for that user's membership in the merchant;
- merchant subscription start date;
- merchant subscription expiry or access-end date, with the lifecycle label kept explicit;
- subscribed product or products owned by the merchant;
- the user's effective access through that membership.

Dates that are unavailable or not applicable remain labelled as such. The page must not imply that the membership itself owns a subscription, and it must not collapse subscription expiry, access end, cancellation or renewal into one ambiguous date.

Platform Owner can open the User Detail profile and view the complete identity-owned personal contact record that DJBOT lawfully stores for that user: full name, primary email and verification state, telephone and personal contact or mailing address when supplied. This access requires recent assurance, an operator purpose and immutable audit. The profile does not expose passwords, password hashes, sessions, tokens, MFA secrets, payment credentials, provider credentials or merchant end-customer data. Analytics facts must not copy this contact record.

### 6.3 User filters

The directory filters by merchant, membership role, invitation state, verification state, MFA state, account state, registration date, last-login range, inactivity band, preferred language, product access and package access.

The approved user types are Tenant Master Admin, Tenant Admin, Tenant Operator, Tenant Conversation Manager, Tenant Human Agent, Tenant Analyst, Tenant Billing Manager and Tenant Read-only Support. Platform operators remain in a separate Platform-user administration area.

## 7. Subscription lifecycle and analytics

Every merchant may hold separate Flow, Text and Voice subscriptions. The owner can view all subscriptions together or group them by merchant, family, package, status and cohort.

Every subscription detail includes:

- internal subscription ID and external billing references;
- merchant, product family, package and immutable commercial-version reference;
- free trial or paid access mode;
- subscription status and authoritative entitlement state;
- record creation date;
- successful provisioning/service-start date;
- trial start and trial end;
- original subscription start;
- current billing-period start and end;
- billing interval and contracted duration where applicable;
- scheduled renewal date;
- scheduled cancellation date;
- actual cancellation date and reason;
- access/service end date;
- retention/purge milestones where policy permits display;
- price, currency, discount/promotion and tax presentation;
- latest invoice/payment state and next expected invoice;
- included usage, credits/packs and cap state;
- upgrade, downgrade, pause, reactivation and cancellation history;
- reconciliation freshness and mismatch status.

The UI preserves provider/billing lifecycle states instead of flattening them into `active` or `inactive`. Local entitlement and provider subscription truth are displayed separately when they disagree.

## 8. Revenue and commercial analytics

The revenue workspace separates these measures:

| Measure | Approved definition |
| --- | --- |
| Gross invoiced | Finalized invoice amount before refunds and credits, excluding void invoices |
| Cash collected | Successfully settled payment amount, net of reversed payments |
| Net collected | Cash collected minus refunds and chargebacks for the selected period |
| MRR | Normalized recurring contracted amount from active paid subscriptions for one month; excludes trials, one-time setup, tax, credits and usage not yet invoiced |
| ARR | `MRR × 12`; never a replacement for recognized accounting revenue |
| New MRR | MRR from merchants first becoming paid in the period |
| Expansion MRR | Positive recurring change from upgrade or added recurring product |
| Contraction MRR | Negative recurring change from downgrade or removed recurring product, excluding complete churn |
| Reactivation MRR | MRR restored after a merchant previously had no active paid subscription |
| Churned MRR | Prior recurring amount lost when the relevant paid subscription ends |
| ARPM | Ending MRR divided by active paying merchants; denominator must be shown |
| Variable gross margin | Net collected attributable to the period minus snapshotted Text, Voice, carrier and other approved variable provider cost; allocation method must be shown |

Charts include revenue by product, package, merchant cohort and period; new/expansion/contraction/churn movement; collection/refund/credit trends; payment failures; provider costs; and margin by product/package/merchant.

Operational reporting is not statutory accounting. Final accounting documents and recognized revenue remain governed by the approved finance/accounting system and reconciliation process.

## 9. Text usage and economics

Text has two different authorities:

1. **Customer entitlement meter:** AI replies committed to the customer conversation.
2. **Internal provider-cost meter:** tokens, requests and provider charges.

The owner analytics record and aggregate:

- committed AI replies;
- conversations and active deployments;
- input, cached-input, output, reasoning and total tokens when reported;
- average tokens per committed reply;
- visible characters per reply and response-limit compliance;
- provider, model and routing-policy version;
- successful, failed, timed-out, retried and fallback requests;
- average, p50 and p95 response latency;
- safety refusal and grounded-answer failure counts under approved evaluation definitions;
- included replies, used replies, remaining replies, reset date and percentage consumed;
- estimated provider cost, reconciled provider cost, cost per reply and cost per merchant.

Missing provider token categories remain `Not reported`; they are not inferred. Token counts do not become a merchant billing unit unless an approved commercial contract explicitly changes the Text meter.

## 10. Voice usage and economics

Voice analytics record and aggregate:

- authorized, connected, completed, failed and abandoned sessions;
- exact connected seconds and customer-facing billable minutes;
- average and percentile call duration;
- concurrent-session peak;
- input/output audio units and text-token categories reported by the provider;
- provider, model, routing-policy version and selected voice identifier in owner-only views;
- first-response latency, turn latency, interruptions and reconnects;
- disconnect and terminal-state reason;
- transfers, callbacks, appointment requests and authoritative completion outcomes;
- included minutes, used minutes, remaining minutes, reset date and percentage consumed;
- estimated and reconciled provider/carrier cost, cost per connected minute, cost per completed session and cost per merchant.

Exact seconds remain the internal authority. Customer-visible rounding is applied only according to the immutable commercial meter rule. A provider/model switch does not rewrite historical session attribution.

## 11. Provider and model analytics

Provider/model identity is visible only to Platform Owner and expressly authorized Platform AI Operations roles. It remains absent from merchant/public DTOs, widgets, invoices, ordinary merchant exports and customer-visible errors.

For each Text or Voice route, show:

- provider and model identifier;
- Text/Voice capability and production status;
- active, canary, fallback, paused or disabled routing state;
- immutable routing-policy and price-snapshot versions;
- requests/sessions, merchants and deployments served;
- token/audio/minute usage;
- estimated and reconciled cost;
- average and p95 latency;
- error, timeout, fallback and reconnect rates;
- latest approved quality/safety evaluation status;
- last successful use, last failure and linked incident.

Every cost-bearing event pins the provider, model, currency, unit-price version and applicable pricing dimensions at event time. Historical cost is not recalculated from the current provider price.

## 12. Trials and conversion

The trial workspace follows the approved product trial rules and reports:

- trial intent creation;
- successful provisioning and actual trial start;
- expiry date and remaining time;
- included, consumed and remaining allowance;
- configured, tested, deployed and first-live-use milestones;
- warning delivery state;
- exhaustion or expiry stop state;
- conversion date and first paid subscription;
- ineligible/repeat-trial decision using only the approved product-specific identity rule;
- conversion and drop-off by product, package selection, cohort and acquisition source.

Flow and Text rules remain separate; Voice has no trial unless the approved experience contract changes.

## 13. Reports, cohorts and alerts

The owner can use 7-, 30-, 90-day, month-to-date, quarter-to-date, year-to-date and custom periods. Cohorts include registration month, trial-start month, first-deployment month and first-paid month.

Required funnel and retention reporting includes:

- package view to configuration start;
- configuration to Deploy Bot account creation;
- email verification;
- Text card verification where applicable;
- successful provisioning;
- first live conversation;
- first lead or appointment outcome;
- trial-to-paid conversion;
- first renewal and later retention;
- cancellation and churn reasons;
- time to deployment, first use and first business outcome.

Required alerts include trial expiry, renewal, scheduled cancellation, payment failure, usage thresholds, exhausted quota, cost anomaly, negative-margin risk, registered-but-not-deployed, prolonged inactivity, deployment/provider failure, model-quality regression, export completion/failure and suspicious operator access.

Alerts are deduplicated, severity-labelled, assigned, deep-linked and resolved from authoritative state. Saved reports may run daily, weekly or monthly and deliver only through approved notification channels.

## 14. Export contract

The owner can export merchants, SaaS users, memberships, subscriptions, invoices/payments, Text usage, Voice usage, model economics, trials/conversion and support/incident summaries as CSV or JSON where permitted.

Every export:

- uses the server-authoritative current filters and selected columns;
- previews scope, estimated row count, included data classes and exclusions;
- runs asynchronously when the result is not safely bounded for an immediate response;
- escapes spreadsheet formulas and produces valid UTF-8;
- records requester, purpose, filter snapshot, column set, row count, status and timestamps;
- requires recent MFA/reauthentication for personal, financial, provider-confidential or cross-tenant detail;
- stores the artifact encrypted with a short retention period and a single-purpose, short-lived download grant;
- records download, expiry, revocation and deletion;
- is idempotent for the same request key and never silently changes scope on retry;
- excludes passwords, password hashes, session/token material, MFA seeds, full payment credentials, API/provider secrets and encryption keys without exception;
- excludes end-customer messages, transcripts, recordings and raw contact data by default.

Operator analytics export is not a substitute for a data-subject access or portability request. Privacy-rights exports continue through the dedicated, identity-verified privacy workflow.

## 15. Access, privacy and audit boundaries

- Platform Owner can view all approved owner analytics and request governed exports.
- Platform Finance can view merchant identity necessary for finance, subscriptions, invoices, collections, credits, refunds and aggregated usage/cost; it cannot view provider routing controls, support narratives or end-customer content.
- Platform AI Operations can view provider/model usage, quality and incident data using pseudonymous merchant identifiers unless merchant identity is necessary for an approved incident task.
- Platform Support sees the merchant directory and masked Tenant 360 needed for support. Sensitive workspace access requires a scoped, time-limited grant and audit.
- Ordinary lists never show end-customer contact data, messages, transcripts, recordings, payment instruments, provider credentials or secret values.
- Every cross-tenant detail view, sensitive filter, export and privileged action records the platform actor, purpose, request ID, target, result and time.

Merchant account analytics and merchant end-customer data remain separate. A request to analyze all SaaS users means DJBOT account users, not every lead or customer captured by every merchant.

## 16. Data correctness and presentation

- PostgreSQL/domain ledgers remain authoritative for tenant identity, entitlement, deployment and committed product usage.
- The billing provider remains authoritative for external customer, subscription, invoice, payment, refund and dispute events; DJBOT stores reconciled local projections and immutable evidence references.
- Provider gateways and reconciled provider results remain authoritative for native token, audio, time and cost evidence.
- Analytics read models are derived and rebuildable. They never become a second mutation authority.
- Usage and financial events use immutable IDs and idempotent ingestion.
- Every aggregate exposes freshness and reconciliation status.
- Date filters use the owner's selected reporting timezone while retaining UTC event timestamps.
- Money stores integer minor units plus ISO currency. Charts do not add different currencies without an explicit approved conversion source and timestamp.
- Deleted/closed records follow retention and legal-hold policy. Analytics does not preserve personal detail longer than its source authority.
- Empty, unavailable, delayed and zero are different UI states.

## 17. Acceptance boundary

This contract is approved product direction, not a claim that the current Platform Master implements it. Development is complete only when the required routes, read models, migrations, authorization, exports, tests and evidence are implemented and the linked `PLT` requirements move through the executable registry's normal acceptance states.

A clickable Platform Master demo must be reviewed page by page before production UI implementation. Demo approval covers presentation and interaction; it does not waive tenant isolation, provider confidentiality, privacy, accounting, reconciliation or export-security requirements.
