# P8 Validation: Voice Agent Advanced

- Result: Local routing-governance foundation passed; P8 release gate remains open
- Date: 2026-07-15
- Database migrations: `0034_voice_advanced_routing`, `0035_voice_advanced_deployments`
- Production activation: Disabled; Gen2 profile is paused

## Executed foundation gates

```bash
git diff --check
scripts/use-node24.sh pnpm --filter @djay/db typecheck
scripts/use-node24.sh pnpm --filter @djay/api typecheck
scripts/use-node24.sh pnpm --filter @djay/platform-master typecheck
scripts/use-node24.sh pnpm test:db
scripts/use-node24.sh pnpm run verify
scripts/use-node24.sh pnpm run qa:p3-ui
P7_TENANT_QA_URL=http://127.0.0.1:3111 scripts/use-node24.sh pnpm run qa:p7-voice
```

All listed gates passed across 31 packages/apps. The PostgreSQL 16 rehearsal proves direct table access
is denied, Platform Support and Finance cannot read routing identity, a proposer
cannot self-qualify, a requester cannot self-approve, direct promotion cannot
skip canary, an approved canary can be promoted and rolled back, a major
incident pauses Gen2, a different Finance reviewer can approve the credit-review
recommendation without provider/model access, and all ten successful transitions
are audited. The production builds include both restricted Platform routes, and
desktop/mobile browser acceptance proves the Platform workflow is responsive
while tenant UI remains free of provider/model identity.

Migration `0035` additionally proves that Advanced deployment generation comes
only from the active immutable entitlement, the tenant DTO exposes only the
Second-Generation public label, Gen2 admission defaults unavailable, and a
generation-matching composite foreign key prevents an Advanced deployment from
issuing a Gen1 session after downgrade. Desktop Basic and mobile Advanced Studio
acceptance pass with no overflow or provider/model leakage; Advanced displays the
explicit pending-activation and no-First-Generation-fallback notice.

## Pending P8 gates

- Gen2 session issuance, runtime route assignment, and controlled admission.
- Equivalent Gen2 profile qualification and controlled degradation tests.
- Advanced analytics, load/capacity, approved cost/margin thresholds, and
  rollback drills under production-like concurrency.
- Live English/Thai audio quality and named-merchant acceptance.

This evidence does not authorize Advanced Voice production traffic.
