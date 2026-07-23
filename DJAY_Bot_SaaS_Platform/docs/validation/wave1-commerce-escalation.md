# Wave 1 — Commerce escalation packet

Date: 2026-07-23  
Status: **BLOCKED** — engineering cannot invent Stripe Price IDs or staging URLs.  
Escalate to: Finance Owner / Commerce Owner

## Why blocked

Local Wave 0 is complete. Wave 1 steps 1–2 require:

1. Stripe **test-mode** Product + Price for Flow Bot Starter
2. A billing DB URL (or staging ops path) to seed `catalog.provider_price_mappings`
3. Reachable API for smoke / abuse / merchant live (`API_APP_URL`)

This workspace has `.env.example` only (no `.env`), no Stripe CLI config, and no staging base URLs in the environment.

## Stripe Dashboard — create test Price (Commerce)

In Stripe **Test mode**:

| Field | Value |
|-------|--------|
| Product name | Flow Bot Starter |
| Product metadata `item_key` | `flowbot_basic` |
| Price currency | THB |
| Price type | Recurring (match catalogue term — monthly unless Finance says otherwise) |
| Unit amount | **2499.00 THB** → `249900` minor units |
| Tax behavior | Follow Finance (SKU1-DEC-002 defers tax automation; set manually if required) |

Paste back (no secrets — Product/Price ids are fine):

```text
STRIPE_PRODUCT_REF=prod_…
STRIPE_PRICE_REF=price_…
STRIPE_VERIFIED_AMOUNT_MINOR=249900
STRIPE_MAPPING_MODE=test
PLATFORM_VERIFIER_USER_ID=<platform.users uuid>
BILLING_DATABASE_URL=<ops-provided; do not commit>
```

## Seed command (after paste-back)

```bash
cd DJAY_Bot_SaaS_Platform
# dry-run first
DRY_RUN=true STRIPE_MAPPING_MODE=test \
  STRIPE_PRODUCT_REF=prod_… STRIPE_PRICE_REF=price_… \
  STRIPE_VERIFIED_AMOUNT_MINOR=249900 \
  PLATFORM_VERIFIER_USER_ID=… \
  BILLING_DATABASE_URL=… \
  pnpm ops:stripe-mapping

# then write
STRIPE_MAPPING_MODE=test \
  STRIPE_PRODUCT_REF=prod_… STRIPE_PRICE_REF=price_… \
  STRIPE_VERIFIED_AMOUNT_MINOR=249900 \
  PLATFORM_VERIFIER_USER_ID=… \
  BILLING_DATABASE_URL=… \
  pnpm ops:stripe-mapping
```

Confirm:

```sql
SELECT item_key, provider_mode, status, external_price_ref, verified_amount_minor
FROM catalog.provider_price_mappings
WHERE item_kind = 'plan' AND item_key = 'flowbot_basic';
```

Expect `provider_mode=test` and status that projects as `stripeMappingState=test_ready`.

## SQA base URLs (paste back)

```text
API_APP_URL=https://…          # or http://127.0.0.1:3103 if local stack is up
PUBLIC_APP_URL=https://…
TENANT_APP_URL=https://…
STRIPE_TEST_READY=true         # only after mapping seed succeeds
```

Then:

```bash
API_APP_URL=… TENANT_APP_URL=… pnpm qa:smoke-negatives
API_APP_URL=… PUBLIC_APP_URL=… pnpm qa:abuse-floor
STRIPE_TEST_READY=true API_APP_URL=… PUBLIC_APP_URL=… TENANT_APP_URL=… \
  pnpm qa:merchant-first-sku live
```

## Prereq gate

```bash
pnpm gate:evidence-wave1
```

Exits non-zero until the env block above is present.
