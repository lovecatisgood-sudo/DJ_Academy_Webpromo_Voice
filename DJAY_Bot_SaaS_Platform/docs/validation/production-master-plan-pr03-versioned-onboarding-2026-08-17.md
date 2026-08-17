# Production master plan PR-03 versioned merchant onboarding checkpoint

Date: 2026-08-17

Status: implemented and locally verified slice; browser acceptance remains permission-gated

Acceptance effect: none; no requirement is formally accepted and all packages remain non-sellable

## Implemented

- Owner/admin login and successful existing-account draft claim continue through `/workspace/onboarding`.
- The server exposes the latest tenant-owned Builder claim and derives Flow, Text or Voice without accepting product authority from the browser.
- Merchant guidelines and the short business survey are persisted atomically at onboarding version 1.
- Failed writes never mark completion. Successful replay is idempotent and preserves the original completion timestamp, answers and single audit event.
- Completed accounts skip the form and continue to the exact claimed product Configuration route; accounts without a claim retain Dashboard access.

## Evidence

| Check | Result |
| --- | --- |
| Fresh focused PostgreSQL gate | 107 migrations applied; 6 Builder/import/onboarding tests passed |
| DB static tests | 160 passed, including 125 migration invariants |
| API, DB and tenant-web typechecks | Passed |
| Product derivation | Latest tenant claim is resolved under tenant RLS; browser supplies no product key |
| Repeat completion | Completion timestamp, product and audit count remain unchanged |
| Full `pnpm verify` gate | Passed; lint, typecheck, tests and builds across all 35 packages |

No browser-backed result is claimed. The new-account and existing-account browser matrix remains open until action-specific project-managed headless Chromium permission is granted.
