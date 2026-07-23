# Phase 11 — Commercial / RevOps (G6e)

Date: 2026-07-23

## Delivered

| Step | Artifact | Status |
|------|----------|--------|
| Tax/dunning decision | `SKU1-DEC-002` + `docs/compliance/sku1-tax-dunning-deferral.md` | **accepted deferral** (SKU1 scope) |
| Pilot vs paid | `SKU1-DEC-003` + `docs/compliance/sku1-pilot-vs-paid.md` | **accepted** |
| Stripe mapping ops | `docs/runbooks/stripe-price-mapping.md` + `scripts/seed-stripe-price-mapping.mjs` | scaffold; **no live_ready row until ops seeds** |
| Portal / receipts | Existing portal + documents UI; `invoicesAvailable` now true when docs exist | code ready; staging receipt evidence open |
| EXP-008 return states | `lib/checkout-return-state.ts` + Usage banner en/th + bounded poll | implemented locally |
| Support macros | `docs/runbooks/customer-support-sku1.md` | published |

## Still open (ops / finance evidence)

- Insert verified Stripe **test** mapping for `flowbot_basic`, then staging Checkout dry-run
- Insert **live** mapping before G7 `sellable: true`
- Screenshot of Portal invoice/receipt for a paid test tenant
- Release dashboard Stripe column remains **not live_ready** until mapping query is green

## Gate posture

| Gate | Status |
|------|--------|
| G6e Commercial | **decision + product copy complete; Stripe live_ready evidence open** |

`STRIPE-DEC-001` / `FIN-DEC-001` remain **blocked** for full GA beyond SKU1 deferral.
