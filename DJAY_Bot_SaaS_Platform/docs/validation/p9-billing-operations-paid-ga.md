# P9 Validation: Billing, operations, and paid GA

- Result: Tenant usage and billing-readiness engineering gate passed; paid-GA gate remains open
- Date: 2026-07-16
- Schema migration: none for this slice
- Public charging: disabled
- Invoices and commercial mutations: unavailable

## Executed gates

```bash
git diff --check
scripts/use-node24.sh pnpm --filter @djay/db typecheck
scripts/use-node24.sh pnpm --filter @djay/api typecheck
scripts/use-node24.sh pnpm --filter @djay/tenant-web typecheck
scripts/use-node24.sh pnpm --filter @djay/db test
scripts/use-node24.sh pnpm test:db
scripts/use-node24.sh pnpm run verify
scripts/use-node24.sh pnpm --filter @djay/tenant-web build
P9_TENANT_QA_URL=http://127.0.0.1:3111 scripts/use-node24.sh pnpm run qa:p9-usage
```

The PostgreSQL 16 rehearsal passed every migration and existing integration
suite. The P9 commerce assertion proves current quota reconciliation after a
real reservation and settlement: 100 included AI responses, a 120-response
safety cap, one settled response, zero reserved, 99 included remaining, and 119
cap remaining. Tenant B receives only its own Voice account. Neither tenant DTO
contains provider/model/adapter identity, native usage, or cost.

The production tenant build includes `/tenant/usage` and `/workspace/usage`.
Chromium exercised a Tenant Master Admin at 1365x900 and Tenant Analyst at
390x844. Both views passed page/console error, horizontal-overflow,
confidentiality, current-period reconciliation, pre-release billing disclosure,
and accessible progress checks. The owner sees future commercial authority
guidance; the analyst sees that only the owner can manage commercial actions.

Visual evidence:

- `/tmp/djay-p9-usage-owner-desktop.png`
- `/tmp/djay-p9-usage-analyst-mobile.png`

## Pending P9 gates

- Accepted ADR-008 with payment provider, immutable prices/rates/allowances,
  Thai VAT/tax invoice policy, billing intervals, proration, refund, trial,
  grace, dunning, cancellation, retention, and legal/accounting approval.
- Production checkout, signed webhook application, subscription lifecycle,
  immutable invoices/credit notes, customer billing portal, and finance
  reconciliation reports.
- Overage forecast/alerts, approved safety-cap management, and exact customer
  unit rounding under the accepted rate card.
- Backup, restore, replay, disaster recovery, capacity, status, support, on-call,
  security, privacy, and legal launch exercises.
- End-to-end unfamiliar-SME register/pay/configure/test/launch acceptance.

This evidence does not authorize payment collection, public prices, invoices,
overage charging, or paid self-service.
