# Production master plan PR-04 trial-intent checkpoint

Date: 2026-08-17

Status: pending-intent slice implemented and locally verified; trial eligibility, activation and metering remain open

Acceptance effect: none; no requirement is formally accepted and all packages remain non-sellable

## Implemented

- Builder draft access authority is a closed `product`, `plan`, `intent` contract.
- `trial` is valid only for Flow Starter and AI Text Starter. Voice and all Advanced plans fail validation.
- Migration `0112_purchase_intent_kind.sql` stores `subscribe` or `trial` on the server purchase intent and repeats the Starter-only invariant in PostgreSQL.
- Both verified new-account provisioning and existing-account claim preserve the exact Builder intent. Missing legacy intent defaults safely to `subscribe`.
- Paid checkout consumes only `subscribe` intents, so a pending trial request cannot be silently converted into a paid-checkout intent.
- This slice creates no trial entitlement, starts no clock, performs no charge and does not make a package sellable.

## Evidence

| Check | Result |
| --- | --- |
| Fresh purchase-intent PostgreSQL gate | 108 migrations; 2 purchase-intent and 2 auth/provisioning tests passed |
| Fresh existing-account PostgreSQL gate | 108 migrations; 6 Builder/import/claim tests passed |
| DB static tests | 161 passed, including 126 migration invariants |
| API tests | 97 passed, including Voice/Advanced trial denial and authority mismatch |
| API, DB and Auth typechecks | Passed |
| Full `pnpm verify` | Passed; 35 of 35 package builds and tests succeeded |

No trial activation or provider result is claimed.
