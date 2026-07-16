# P9 Validation: Billing, operations, and paid GA

- Result: Usage, finance reconciliation, and separate-cluster restore engineering gates passed; paid-GA gate remains open
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
scripts/use-node24.sh pnpm --filter @djay/platform-master typecheck
scripts/use-node24.sh pnpm --filter @djay/db test
scripts/use-node24.sh pnpm test:db
scripts/use-node24.sh pnpm run verify
scripts/use-node24.sh pnpm --filter @djay/tenant-web build
scripts/use-node24.sh pnpm --filter @djay/platform-master build
P9_TENANT_QA_URL=http://127.0.0.1:3111 scripts/use-node24.sh pnpm run qa:p9-usage
P9_PLATFORM_QA_URL=http://127.0.0.1:3112 scripts/use-node24.sh pnpm run qa:p9-operations
scripts/use-node24.sh pnpm run qa:p9-restore
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

The real PostgreSQL integration suite also proves a healthy platform-wide
reconciliation after reservation/settlement, then deliberately introduces one
quota/event variance and proves that exactly one account and the aggregate gate
move to `attention`. The report is bounded, Finance/Owner-only, and its DTO has
no provider/model/adapter identity, native usage, cost, or margin.

The production Platform Master build was exercised as Platform Owner at
1365x900 and Platform Finance at 390x844. Both rendered actionable variance
evidence, correct role authority, explicit no-charging authority, no horizontal
overflow, no page/console errors, and no restricted cost/routing identity inside
the reconciliation surface.

Visual evidence:

- `/tmp/djay-p9-operations-owner-desktop.png`
- `/tmp/djay-p9-operations-finance-mobile.png`

The first restore attempt proved schema/data alone were insufficient because
`--no-acl` removed runtime grants. A second fresh-cluster attempt proved the
historical base role manifest omitted AI/Voice/FlowBot runtime roles. Both
defects were corrected. The final drill passed between separate PostgreSQL 16
clusters with archive validation, a backup SHA-256, identical critical
data/schema/policy fingerprints, complete least-privilege role bootstrap,
restored ACLs, immutable ledger/catalog triggers, forced commerce RLS, and the
runtime-role Tenant A/Tenant B substitution suite.

## Pending P9 gates

- Accepted ADR-008 with payment provider, immutable prices/rates/allowances,
  Thai VAT/tax invoice policy, billing intervals, proration, refund, trial,
  grace, dunning, cancellation, retention, and legal/accounting approval.
- Production checkout, signed webhook application, subscription lifecycle,
  immutable invoices/credit notes, and customer billing portal.
- Overage forecast/alerts, approved safety-cap management, and exact customer
  unit rounding under the accepted rate card.
- Managed-environment backup/PITR, event replay, regional disaster recovery,
  capacity, status/SLO, support/on-call, security, privacy, and legal launch
  exercises. The local separate-cluster restore gate is complete but is not a
  substitute for the production infrastructure exercise.
- End-to-end unfamiliar-SME register/pay/configure/test/launch acceptance.

This evidence does not authorize payment collection, public prices, invoices,
overage charging, or paid self-service.
