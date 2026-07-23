# SKU1 pilot comps vs paid recognition

Decision: `SKU1-DEC-003` (accepted 2026-07-23)

## Rules

| Path | How access is granted | Revenue recognition |
|------|----------------------|---------------------|
| **Paid self-serve** | Stripe Checkout → signed webhook → entitlement `accessMode=active` | Count as paid subscription revenue when Stripe payment succeeds (Finance books from Stripe / reconciled ledger) |
| **Pilot / comps** | Platform Owner `activatePilot` only for named complimentary workspaces | **Not** MRR/ARR; track as complimentary / non-revenue comps |

## No double-count

1. Pilot activation must audit `subscription.pilot_activated` (or equivalent) and must not create a paid Stripe subscription for that comp.
2. If a pilot workspace later converts to paid, Finance recognizes revenue only from the paid Stripe period; do not also count the pilot window as paid.
3. Product UI states pilot activation is for named comps only; merchants cannot self-activate pilots.

## Owner

Finance Owner + Platform Owner for activation discipline.
