# Merchant first-SKU unmocked E2E (G6)

Date: 2026-07-23  
SKU: `flowbot_basic` (paid-first)

## Command

```bash
# Print journey (no network)
pnpm qa:merchant-first-sku

# Live bootstrap against real apps (no Playwright mocks)
PUBLIC_APP_URL=https://staging.djbot.djai.academy \
TENANT_APP_URL=https://app.staging.djbot.djai.academy \
API_APP_URL=https://api.staging.djbot.djai.academy \
STRIPE_TEST_READY=true \
pnpm qa:merchant-first-sku live
```

## Journey checklist

| # | Step | Pass? | Evidence |
|---|------|-------|----------|
| 1 | Register new merchant | ☐ | screenshot / request id |
| 2 | Verify email | ☐ | |
| 3 | Sign in → Overview/Setup | ☐ | |
| 4 | Stripe Checkout test payment | ☐ | checkout intent id |
| 5 | Webhook activates FlowBot access | ☐ | subscription accessMode |
| 6 | Setup wizard → publish + deploy | ☐ | deployment id / origin |
| 7 | Widget journey on allowed origin | ☐ | |
| 8 | Inbox shows conversation; onboarding launchReady | ☐ | |
| 9 | Axe: Setup, Inbox, Usage return | ☐ | attach axe JSON/HTML |

## Automated companions

```bash
API_APP_URL=... TENANT_APP_URL=... pnpm qa:smoke-negatives
API_APP_URL=... PUBLIC_APP_URL=... pnpm qa:abuse-floor
```

## Gate status

- **Scaffold / local negatives:** implemented (`scripts/qa-merchant-first-sku.mjs`, smokes)
- **G6 closed:** only after staging URLs + Stripe test mapping produce a green live row above

Operator: _____________  Date: _____________
