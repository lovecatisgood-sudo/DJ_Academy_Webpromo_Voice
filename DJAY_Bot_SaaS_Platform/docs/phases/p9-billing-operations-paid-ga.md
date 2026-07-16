# P9: Billing, operations, and paid GA hardening

## Status

In progress. The first P9 engineering slice delivers tenant-isolated usage and
billing-readiness visibility. Paid checkout, invoices, tax, proration, dunning,
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

## Schema, API, and event impact

- No migration is required for this slice. It reads existing immutable plan
  versions, subscriptions, entitlement snapshots, quota accounts, reservations,
  and usage totals established in P2.
- New API: `GET /tenant/usage`.
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

## Non-goals for this slice

- Selecting a payment provider or inventing THB prices, VAT/tax policy, public
  allowances, overage rates, rounding, proration, refund, grace, or dunning rules.
- Claiming invoice or checkout readiness before immutable invoice/reconciliation
  storage, signed provider workflows, and accepted legal/accounting evidence.
- Enabling paid plans, overage collection, or broad public self-service.

## Next slice

Add production backup/restore and usage-reconciliation drills plus safe Platform
Finance reporting that does not require unresolved commercial values. After
ADR-008 is accepted, implement immutable invoices, provider checkout, signed
webhook application, plan lifecycle, tax, dunning, cancellation, and customer
billing actions against the approved fixtures.

## Rollback

Remove the Usage Center route/UI and deploy the previous application. No schema
or immutable data reversal is required. Existing metering, subscriptions,
entitlements, quota accounts, and usage events remain authoritative and must not
be deleted or rewritten.
