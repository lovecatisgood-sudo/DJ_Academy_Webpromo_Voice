# Phase 4 / G2 paid-path wiring

Last updated: 2026-07-22

## Done

- Register with `selectedPlanKey` creates `billing.purchase_intents` in the auth transaction
- Email verify attaches intent `tenant_id` (pending subscription path preserved)
- In-app **Choose a product** on `/workspace/usage` → `POST /tenant/subscriptions` (+ purchase intent)
- Pending / `accessMode: none` cards expose **Continue to payment** → contract accept → checkout
- Checkout consumes matching open purchase intent after Stripe prepare
- `?checkout=return` shows confirmation notice and refreshes usage only (no activate-from-query)
- Public registration copy: preference saved; activate after payment
- Overview primary CTA + checklist hrefs; usage empty-state copy
- Rate limits: checkout + subscription select

## Evidence

- `PURCHASE_INTENT_ONLY=true` auth + purchase-intent integration Pass
- API G1b/G2 source invariants Pass
- Stripe test-card dry-run: **open** until test price mapping exists (`sellable` remains false; honest `checkout_unavailable` UX)

## Non-conflicts

- Platform `activatePilot` remains for comps
- No `sellable: true` flip
- Return URL never provisions entitlement from browser success flags (EXP-008)
