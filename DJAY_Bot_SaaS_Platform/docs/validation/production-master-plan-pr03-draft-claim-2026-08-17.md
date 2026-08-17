# Production master plan PR-03 draft-claim checkpoint

Date: 2026-08-17

Status: implemented and locally verified slice; PR-03 remains in progress

Acceptance effect: none; no requirement is formally accepted and all packages remain non-sellable

## Implemented

- Registration accepts Builder authority only from the valid signed HttpOnly session cookie; it does not accept a browser-provided draft identifier.
- The selected registration plan must exactly match the configured server draft.
- One Builder session can bind to only one registration. Idempotent replay returns the existing intent; a second registration is denied.
- Pending verification freezes draft updates and new/running imports, preserving the exact configured revision.
- Email verification atomically creates the user, tenant, sole active Master Admin, legal acceptances and tenant-scoped Builder claim, then marks the anonymous session and draft claimed.
- An expired linked draft fails closed before any user or tenant is provisioned.

## Evidence

| Check | Result |
| --- | --- |
| Auth unit tests | 9 passed |
| API unit tests | 94 passed |
| DB static tests | 158 passed |
| Fresh full PostgreSQL gate | 105 migrations and every wired integration suite passed |
| Focused auth PostgreSQL rerun | 2 tests passed, including mutation freeze, cross-registration denial and expired-draft failure |
| Repository `pnpm verify` | 35 packages passed lint, typecheck, tests and production builds |
| `git diff --check` | Passed |

No browser-backed or unmocked provider check is claimed. Existing-account continuation, Deploy UI wiring, onboarding continuation and permission-gated E2E remain open.
