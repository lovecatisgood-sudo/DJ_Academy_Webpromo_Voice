# Production master plan PR-03 existing-account claim checkpoint

Date: 2026-08-17

Status: implemented and locally verified slice; PR-03 remains in progress

Acceptance effect: none; no requirement is formally accepted and all packages remain non-sellable

## Implemented

- The public Builder issues a 15-minute opaque continuation pinned to the current server draft revision.
- The token travels in a URL fragment, is immediately removed from the address, and remains only in same-tab storage through login and MFA.
- Multi-workspace accounts must explicitly choose the destination workspace.
- The tenant API derives user, membership and workspace from the authenticated session and permits only Master Admin or Admin authority.
- Consumption atomically creates one tenant draft claim, tenant audit and tenant-bound purchase intent, then claims the anonymous source.
- For a workspace without a non-cancelled subscription to that product, consumption also creates one pending product subscription, immutable no-access entitlement snapshot and quota account. This matches new-account provisioning and supplies the authority required by later Flow/Text trial activation without granting access or starting the trial clock.
- The tenant is locked to serialize concurrent product claims. An existing product subscription is preserved and never duplicated or silently replaced; its continuation/plan-change experience remains decision-gated.
- Superseded, expired, stale, pending-registration, unauthorized and cross-tenant attempts fail closed; successful replay is idempotent.

## Evidence

| Check | Result |
| --- | --- |
| Fresh full PostgreSQL gate | 118 migrations applied; all wired integration, RLS, recovery and guarded rollback suites passed |
| DB static tests | 171 passed; 74 integration tests skipped without credentials |
| API tests | 95 passed before the final full gate |
| API, DB, public-site and tenant-web typechecks | Passed |
| Auth-continuation and browser-origin static contracts | Passed; 127 mutation handlers covered |
| Pending-authority evidence | Existing-account claim proves one subscription, one immutable snapshot and one quota account; replay creates no duplicate |
| Full `pnpm verify` gate | Passed after the commerce-authority delta; lint, typecheck, tests and builds across all 35 packages |

No browser-backed result is claimed. Post-claim onboarding continuation and permission-gated E2E remain open.
