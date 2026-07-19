# CTRL-02: Decision and Vendor Readiness Closure

- Local status: Complete
- External status: Ten explicit release blockers remain open
- Date: 2026-07-18

## Delivered

- Added `requirements/market-release-decisions.yaml` as the authoritative
  decision register.
- Recorded an accountable role, supporting roles, gate deadline, required
  evidence, operational fallback and blocker scope for telephony, CRM,
  FlowAccount/accounting, additional languages, Stripe policy, overage/packs,
  knowledge ingestion, security/privacy, GCP topology and provider accounts.
- Added `scripts/check-market-release-decisions.mjs` to reject missing,
  duplicate, unknown or incomplete critical decisions.
- Added the checker to normal lint, release packaging and release-artifact QA.
- Updated ADR-013 to reflect the later owner-selected GCP direction instead of
  the superseded AWS recommendation.
- Updated ADR-008 to distinguish locked offer values from unresolved billing,
  tax, accounting and overage policy.

## Release Meaning

CTRL-02 does not claim the external decisions are accepted. Its exit condition
is satisfied because no critical decision is implicit: each is either accepted
or, currently, an explicit release blocker with a fail-closed fallback. Closing
a blocker requires replacing its status with `accepted` and attaching the
evidence named in the register.

## Verification

- `pnpm run lint:market-release-decisions`
- `pnpm run lint`
- `pnpm run package:release`
- `pnpm run qa:release-artifacts`

## Next External Inputs

The Product, Finance, Platform, Security and Privacy owners must supply the
contracts, policies, account authority and acceptance evidence listed in the
register. Secrets are never valid decision evidence and must only be installed
through the target environment's secret manager.
