# P9: Billing, operations, and paid GA hardening

## Status

In progress. The first four P9 engineering slices deliver tenant-isolated usage
visibility, restricted finance reconciliation, executable backup/restore
evidence, immutable service/operations evidence, a fail-closed release gate,
provider-neutral public status, deterministic effect replay, stale-queue
recovery, and bounded pool-exhaustion readiness. Paid checkout, invoices, tax, proration, dunning,
cancellation, overage charging, and broad self-service remain disabled because
ADR-008 has not been accepted with exact commercial and legal decisions.

## Requirements

- Let an unfamiliar SME understand product access, current-period usage,
  remaining allowance, active reservations, and safety caps without developer
  or internal-provider knowledge.
- Preserve provider-native usage and cost inside restricted systems while tenant
  users receive only Flow runs, AI responses, and Voice minutes.
- Resolve all allowances, rates, and sellability from immutable plan versions;
  never place invented commercial values in product code.
- Restrict payment methods, plan changes, cancellation, and invoice authority to
  the Tenant Master Admin once those workflows are approved and implemented.
- Trace future invoice lines to immutable subscription, entitlement, rate, and
  usage versions, then prove reconciliation, restore, rollback, privacy,
  security, support, status, and on-call operations before paid GA.

## Usage Center foundation delivered

1. `GET /tenant/usage` requires authenticated tenant context and `usage.read`.
2. `TenantCommerceStore.usageOverview` runs inside a forced-RLS tenant
   transaction and resolves only the selected tenant's pinned subscription,
   plan version, latest entitlement access mode, and quota account.
3. Each product exposes only its public plan name and customer unit: Flow runs,
   AI responses, or Voice minutes. Provider identity, native units, raw cost,
   route data, and margin are absent.
4. Settled and reserved quantities are kept distinct and reconciled into a
   committed quantity, remaining included allowance, and remaining safety cap.
5. Pricing is considered configured only when the immutable plan version is
   sellable and has a recurring interval and amount. Overage remains an
   independently configured policy. Current plans remain non-sellable with null
   commercial fields.
6. The responsive Usage Center gives owners and analysts the same factual usage
   evidence while explaining their different authority. No unavailable payment,
   cancellation, upgrade, or invoice action is rendered as if it worked.
7. Accessible progress semantics, loading/error/empty states, current-period
   copy, and explicit pilot-metering disclosure pass production-browser desktop
   and mobile acceptance.

## Reconciliation and recovery foundation delivered

1. `GET /platform/usage-reconciliation` requires a Platform Owner or Platform
   Finance session with `platform.billing.read`; Support and AI Operations are
   denied by default.
2. `PlatformCommerceStore.reconciliationOverview` checks every quota account
   against open reservation balances, terminal reservation settlements, and
   immutable settled/credited/waived customer-unit events. It also identifies
   active subscriptions without a current account, unmapped usage events, and
   open reservations left in an expired period.
3. Aggregate counts cover the full dataset while the response is bounded to 500
   highest-priority account rows. Variances sort first and expose only tenant,
   public plan, customer unit, period, and numeric evidence—not provider-native
   units, cost, margin, content, or credentials.
4. The branded Platform Master view gives the Owner rollout-pause guidance and
   Finance read-only escalation guidance. It never offers direct-SQL repair or
   represents reconciliation as invoice/payment authority. Loading is explicit;
   failure is fail-visible, treated as not reconciled, and offers a safe retry.
5. `qa:p9-restore` creates separate PostgreSQL 16 source and recovery clusters,
   applies every migration, creates a custom-format backup, verifies its archive
   and SHA-256, bootstraps all least-privilege roles, restores ACLs and data,
   compares a critical data/schema/policy fingerprint, asserts immutable usage
   and catalog triggers plus forced RLS, and reruns tenant-substitution probes.
6. The drill exposed and corrected two recovery defects: dropping ACLs made the
   restored runtime unusable, and the base role bootstrap omitted later product
   runtimes. The recovery procedure now preserves grants and `0000_roles.sql`
   idempotently defines every application, worker, migration, and operations
   role before restore.

## Release readiness and public status delivered

1. Migration `0038_release_readiness.sql` defines exactly seven immutable
   technical objectives and append-only staging/production observations. The
   database derives availability from sample/success counts and rejects evidence
   updates or deletes.
2. Release evidence is current only when every service has a minimum 24-hour
   window, enough samples, no more than 30 minutes of age, passing availability
   and P95 latency, passing queue age where applicable, and zero dead letters.
3. Eight separately hashed, time-limited attestations cover on-call, restore,
   support runbook, security, privacy, event replay, queue recovery, and pool
   exhaustion. Missing, failed, or expired evidence blocks release.
4. `POST /internal/operations/status` is server-to-server, bearer-authenticated,
   constant-time compared, strict, bounded, audited, and idempotent by evidence
   hash. Production refuses configuration without a sufficiently long ingestion
   secret.
5. `GET /platform/release-readiness` combines service evidence, attestations,
   unresolved major/critical Voice incidents, and usage reconciliation. Owner,
   Finance, Support, and AI Operations receive role-appropriate guidance;
   Support/AI Operations do not receive billing counts.
6. `GET /public/status` and `/status` disclose only seven customer labels,
   operational/degraded/outage/unknown state, and update timestamps. Internal
   service keys, evidence, incidents, tenants, vendors, models, routes, costs,
   and credentials are absent. Missing evidence produces an honest unknown
   state rather than a hard-coded operational claim.
7. Production-browser QA covers public operational desktop/degraded mobile and
   Platform Owner, Finance, Support, and AI Operations views without overflow,
   console errors, internal-identity leakage, or false commercial authority.

## Resilience drill foundation delivered

1. Every email attempt now sends the durable outbox UUID as the downstream
   idempotency key. Retrying an ambiguous provider acknowledgment no longer
   invents a new key that could duplicate customer email.
2. `qa:p9-resilience` starts a fresh PostgreSQL 16 cluster and proves a failed
   item retries with the same key, creates one provider-side effect, finishes
   sent, and cannot be claimed again.
3. The same drill leaves a worker item in stale `processing`, then proves the
   five-minute lease recovery reclaims it through the normal worker repository
   and completes it exactly once.
4. `DatabaseReadinessProbe` collapses concurrent checks onto one outstanding
   query. With every connection reserved, `/api/health/ready` fails closed with
   503 inside the bounded deadline; after capacity returns, the same probe and a
   new query recover. Liveness stays separate and does not claim database health.
5. Migration `0039_resilience_drills.sql` extends immutable operational evidence
   with event replay, queue recovery, and pool exhaustion. These three current
   passes are required in addition to the five human/restore reviews.

## Schema, API, and event impact

- No tenant-schema migration is required for these slices. Usage and
  reconciliation read existing immutable plan
  versions, subscriptions, entitlement snapshots, quota accounts, reservations,
  and usage totals established in P2.
- New APIs: `GET /tenant/usage`, restricted
  `GET /platform/usage-reconciliation`, authenticated
  `POST /internal/operations/status`, restricted
  `GET /platform/release-readiness`, and public `GET /public/status`.
- `GET /api/health/ready` is a safe database-backed readiness signal; it exposes
  only ready/unavailable and never database errors or configuration.
- Platform migration `0038_release_readiness.sql` adds immutable objectives,
  observations, attestations, their indexes/triggers, and a narrow
  security-definer aggregate for blocking incidents. It adds no tenant/customer
  content, commercial data, or provider/model fields.
- Platform migration `0039_resilience_drills.sql` additively expands the
  attestation constraint; no tenant table or commercial contract changes.
- The fresh-cluster role bootstrap is additively completed in
  `0000_roles.sql`; embedded later role guards remain idempotent. Existing
  environments already have these roles and need no destructive change.
- No event, invoice, payment, price, tax, or cancellation contract is introduced.
- The existing quota-account uniqueness and tenant indexes support the bounded
  current-account query; no cross-tenant identifier is accepted from the client.

## Security, privacy, and observability

- The selected tenant comes only from the authenticated session; query and RLS
  scope use the same `TenantContext`.
- Tenant Analyst through Tenant Master Admin may read usage. Only the owner will
  receive future commercial mutation authority.
- The DTO contains no conversation content, customer identity, provider/model,
  route, credential, native usage, cost, or margin data.
- The page reports a neutral temporary-unavailability state and does not expose
  database errors or imply that plans changed when reading fails.
- Reconciliation operators use aggregate identifiers and quantities; they must
  not copy customer content or restricted provider evidence into tenant UI.
- Platform Finance receives read-only reconciliation evidence. Platform Support
  and AI Operations cannot call the endpoint, and the report has no mutation.
- A variance is fail-visible and instructs operators to stop rollout expansion;
  immutable events must never be rewritten and quota totals must not be repaired
  with direct SQL.
- Operational evidence is platform-only and append-only. The ingestion token is
  independent deployment secret material and never enters a browser response.
- Public status is deliberately lossy and provider-neutral. Platform evidence
  may include safe opaque references, but those never cross the public boundary.
- Email delivery receives only rendered allow-listed content and the opaque
  outbox UUID. Readiness errors are collapsed to a safe unavailable response.

## Non-goals for this slice

- Selecting a payment provider or inventing THB prices, VAT/tax policy, public
  allowances, overage rates, rounding, proration, refund, grace, or dunning rules.
- Claiming invoice or checkout readiness before immutable invoice/reconciliation
  storage, signed provider workflows, and accepted legal/accounting evidence.
- Enabling paid plans, overage collection, or broad public self-service.
- Treating local QA evidence as a production SLA, managed monitoring result,
  staffed on-call rota, managed PITR, regional recovery, or legal launch signoff.
- Direct-SQL dead-letter replay. Dead letters continue to block release until a
  reviewed two-person recovery workflow is implemented and exercised.

## Next slice

Add reviewed two-person dead-letter recovery, then exercise managed database
failover, cache loss, object-store/provider outage, real monitoring,
production backup/PITR, regional recovery, staffed on-call escalation, and live
status communication. After ADR-008 is accepted, implement
immutable invoices, provider checkout, signed webhook application, plan
lifecycle, tax, dunning, cancellation, and customer billing actions against the
approved fixtures.

## Rollback

Remove the Usage Center, reconciliation, readiness, and status route/UI, then
deploy the previous application. No tenant schema reversal is required. Retain
migrations 0038/0039 and their immutable operational evidence; do not delete or rewrite
observations/attestations during application rollback. Public status must remain
unknown or unavailable rather than claim operational health without evidence. The
additive no-login/no-bypass role declarations are safe to retain; do not revoke
roles during application rollback because restored and prior releases may still
depend on their grants. Existing metering, subscriptions, entitlements, quota
accounts, and usage events remain authoritative and must not be deleted or
rewritten.
