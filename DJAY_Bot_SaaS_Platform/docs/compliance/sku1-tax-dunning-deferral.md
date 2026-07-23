# SKU1 tax & dunning deferral

Decision: `SKU1-DEC-002` (accepted 2026-07-23)  
Scope: `flowbot_basic` only  
Related: ADR-008, `STRIPE-DEC-001` (still blocked for full GA), `FIN-DEC-001` (Thai accounting)

## Policy for SKU1

1. **Tax presentation:** Catalogue THB amounts are shown as the amount due at checkout. No separate VAT line-item engine is activated for SKU1. Official Thai tax invoices / FlowAccount remain blocked under `FIN-DEC-001`.
2. **Offline tax:** Finance may issue offline tax documents outside the product when required; the product does not claim to be a tax-invoice system in SKU1.
3. **Dunning:** No automated dunning schedule, grace suspension worker policy, or retry cadence is seeded for SKU1. Merchants use Stripe Customer Portal + Support for failed payment recovery. Local subscription/accessMode remain authoritative for workspace access.
4. **Refunds / disputes:** Follow Stripe Dashboard + finance approval; not automated in-app for SKU1.

## Explicit non-claims

- Does not accept full `STRIPE-DEC-001` (six Price mappings, full lifecycle policy).
- Does not authorize `sellable: true` (still needs G6–G6e evidence and Phase 13).

## Engineering checks

- Dunning policy tables may exist; SKU1 must not ship an **active** automated dunning policy.
- Checkout remains gated on verified Stripe price mappings + catalogue sellable rules.
