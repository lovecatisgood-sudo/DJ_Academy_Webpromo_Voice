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
- Superseded, expired, stale, pending-registration, unauthorized and cross-tenant attempts fail closed; successful replay is idempotent.

## Evidence

| Check | Result |
| --- | --- |
| Fresh focused PostgreSQL gate | 106 migrations applied; 6 Builder draft/import tests passed |
| DB static tests | 159 passed before the final full gate |
| API tests | 95 passed before the final full gate |
| API, DB, public-site and tenant-web typechecks | Passed |
| Auth-continuation and browser-origin static contracts | Passed; 127 mutation handlers covered |
| Full `pnpm verify` gate | Passed; lint, typecheck, tests and builds across all 35 packages |

No browser-backed result is claimed. Post-claim onboarding continuation and permission-gated E2E remain open.
