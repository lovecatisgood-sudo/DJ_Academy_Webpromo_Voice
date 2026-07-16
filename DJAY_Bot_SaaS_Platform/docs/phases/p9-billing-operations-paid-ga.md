# P9: Billing, operations, and paid GA hardening

## Status

In progress. The first two P9 engineering slices deliver tenant-isolated usage
visibility, restricted finance reconciliation, and executable backup/restore
evidence. Paid checkout, invoices, tax, proration, dunning,
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

## Schema, API, and event impact

- No tenant-schema or data migration is required for these slices. They read existing immutable plan
  versions, subscriptions, entitlement snapshots, quota accounts, reservations,
  and usage totals established in P2.
- New APIs: `GET /tenant/usage` and restricted
  `GET /platform/usage-reconciliation`.
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

## Non-goals for this slice

- Selecting a payment provider or inventing THB prices, VAT/tax policy, public
  allowances, overage rates, rounding, proration, refund, grace, or dunning rules.
- Claiming invoice or checkout readiness before immutable invoice/reconciliation
  storage, signed provider workflows, and accepted legal/accounting evidence.
- Enabling paid plans, overage collection, or broad public self-service.

## Next slice

Add environment-aware status/SLO evidence, incident ownership and an on-call
release gate, then exercise replay, queue recovery, pool exhaustion, and managed
production backup/PITR procedures. After ADR-008 is accepted, implement
immutable invoices, provider checkout, signed webhook application, plan
lifecycle, tax, dunning, cancellation, and customer billing actions against the
approved fixtures.

## Rollback

Remove the Usage Center and reconciliation route/UI, then deploy the previous
application. No tenant schema or immutable data reversal is required. The
additive no-login/no-bypass role declarations are safe to retain; do not revoke
roles during application rollback because restored and prior releases may still
depend on their grants. Existing metering, subscriptions, entitlements, quota
accounts, and usage events remain authoritative and must not be deleted or
rewritten.
