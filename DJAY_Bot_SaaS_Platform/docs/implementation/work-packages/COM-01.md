# COM-01: Immutable Catalogue and Contracts

- Local implementation status: Complete
- Paid acceptance status: Blocked by Stripe/tax/accounting decisions and BILL-01
- Catalogue version: `djay-bots-th-2026-01`
- Promotion version: `first-year-launch-2026-01`

## Delivered

- Locked the six internal plan keys while using the public Starter/Advanced
  names from the offer.
- Stored exact first-term, renewal and explicit discount amounts in THB minor
  units. Flow Starter is `249900`, `499900`, and `250000`; it is not derived by
  percentage rounding.
- Stored the exact included Flow conversations, AI replies, Voice minutes,
  advertised AI/Voice overage rates, usage packs, monthly add-ons and nine
  professional-service price floors.
- Added versioned catalogue, promotion, commercial-term, add-on, pack,
  professional-service and payment-provider-mapping tables.
- Added immutable catalogue-content protection after draft status, SHA-256
  content calculation, owner-only approve/activate functions and prospective
  retirement of the prior active version.
- Added an immutable tenant-scoped subscription contract snapshot with the
  exact plan/catalogue versions, charge and renewal values, promotion,
  allowance timezone/rollover policy, entitlements, limits, rates, tax state,
  third-party-fee exclusion and acceptance timestamp.
- Added a server-generated quotation path in `PostgresCatalogStore`. It fails
  closed until both catalogue sellability and a verified live Stripe mapping
  are present.
- Preserved one non-cancelled subscription per product family/workspace while
  allowing Flow, AI Text and Voice subscriptions to coexist.

## Safety State

All six plan terms, four add-ons, two packs and nine professional services are
`sellable=false`. There are no seeded provider mappings. Public catalogue reads
show exact prices, while checkout quotation returns
`stripe_mapping_missing`. No payment is authorized by this work package.

## Evidence

- `packages/catalog/src/index.test.ts`
- `packages/db/src/migration-invariants.test.ts`
- `packages/db/src/commerce-store.integration.test.ts`
- `packages/db/migrations/0043_market_release_catalog.sql`
- `scripts/test-db-integration.sh`

## Deferred Dependencies

- BILL-01 owns purchase intents, Stripe Checkout creation, signed event
  application and provisioning.
- COM-02 owns full resource-boundary enforcement and downgrade behavior.
- COM-03 owns anniversary-period generation, reservations, packs, overage,
  forecasts, alerts, caps and reconciliation.
- FIN-01/02 own invoices, credit notes, payments and FlowAccount.
- PLAT-04 owns the operator catalogue lifecycle UI and approval evidence.
