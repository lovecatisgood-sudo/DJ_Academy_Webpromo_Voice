# Stripe price mapping — flowbot_basic

Maps catalogue plan `flowbot_basic` to Stripe Product/Price refs in `catalog.provider_price_mappings`.

## Modes

| Mode | `provider_mode` | Checkout gate |
|------|-----------------|---------------|
| Test | `test` | `stripeMappingState=test_ready` (engineering dry-run) |
| Live | `live` | `stripeMappingState=live_ready` (required with `sellable:true` at G7) |

## Preconditions

1. Stripe Thailand account with test/live separation.
2. Product + Price created in Stripe Dashboard matching catalogue first-term amount (THB minor units).
3. Platform user UUID for `verified_by_platform_user_id`.
4. Active `catalog.catalog_versions` row.

## Seed (ops)

```bash
# From DJAY_Bot_SaaS_Platform/
export BILLING_DATABASE_URL='postgres://…'   # platform-capable role
export STRIPE_MAPPING_MODE=test              # or live
export STRIPE_PRODUCT_REF=prod_…
export STRIPE_PRICE_REF=price_…
export STRIPE_VERIFIED_AMOUNT_MINOR=249900   # must match catalogue
export PLATFORM_VERIFIER_USER_ID=…           # platform.users id
pnpm exec node scripts/seed-stripe-price-mapping.mjs
```

Dry-run (no write):

```bash
DRY_RUN=true pnpm exec node scripts/seed-stripe-price-mapping.mjs
```

## Verification

```sql
SELECT item_key, provider_mode, status, external_price_ref, verified_amount_minor
FROM catalog.provider_price_mappings
WHERE item_kind = 'plan' AND item_key = 'flowbot_basic';
```

Public/commerce projection should show `test_ready` or `live_ready` for `flowbot_basic`.

## Release dashboard

Update `docs/plans/release-dashboard.md` Stripe column only after the query above shows `ready` for the intended mode. Do **not** flip `sellable: true` here — that is Phase 13 / G7.
