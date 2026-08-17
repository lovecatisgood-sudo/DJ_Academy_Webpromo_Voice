# Production master plan PR-04 Flow Starter trial checkpoint

Date: 2026-08-17

Status: Flow Starter activation foundation implemented and locally verified; runtime expiry UX and provider-independent acceptance remain open

Acceptance effect: none; no requirement is formally accepted and all packages remain non-sellable

## Implemented

- `POST /tenant/trials/flow/activate` requires tenant billing authority, recent authentication, trusted origin, rate limiting and idempotency.
- Activation requires the tenant-owned Flow Starter trial intent, completed versioned onboarding, a verified active Master Admin email and a claimed published Flow Builder version.
- Migration `0113_flow_starter_trial_activation.sql` records one trial per normalized verified-email digest, exactly 30 fixed days, website-only scope and exactly 5,000 deterministic Flow conversations.
- The activation transaction changes the pending subscription to `trialing`, resets its quota period to the activation clock, caps it at 5,000, appends a trial-only entitlement snapshot, consumes the pending intent, audits the change and emits an outbox event.
- Trial authority explicitly disables social, Advanced nodes, webhook/integration features, branding removal and overage.
- Tenant purchase-intent creation now establishes RLS context; tenant IDs remain server-authoritative.

## Evidence

| Check | Result |
| --- | --- |
| Fresh PostgreSQL gate | 109 migrations applied |
| Focused Flow trial integration | Passed activation, replay, fixed clock, quota, website-only restrictions and repeat denial |
| Pre-publication denial | Passed; no grant created and subscription remained pending |
| DB and API typechecks | Passed |
| Migration invariants | 127 passed |
| Full `pnpm verify` | Passed; all 35 package lint, typecheck, test and build tasks succeeded |

Text trial SetupIntent/card-fingerprint authority, 100-remaining notification, expiry worker/customer fallback, browser acceptance, provider evidence and production deployment remain open.
