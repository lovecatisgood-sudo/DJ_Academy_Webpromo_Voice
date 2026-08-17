# AI Text package-first role onboarding evidence — 2026-08-17

## Scope

This evidence records implementation of `AIT-010`; it does not record Product Owner, browser, live-provider or merchant acceptance and does not make either AI Text package sellable.

The public Builder requires the merchant to select the AI Text family, package and subscribe/eligible-trial intent before opening AI Text onboarding. The first AI Text onboarding page presents exactly Customer Support, Sales Associate and Appointment Booking. The selected role is persisted in the server-authoritative, revisioned anonymous draft and becomes the immutable claimed playbook role rather than being accepted from a provider-test request.

Sales Associate remains consultative: active objections stay in the objection stage without booking or lead actions. After discovery and any active objection are resolved, the same Sales role may propose a typed `appointment.request` only alongside validated lead capture, current appointment entitlement, two to five time options and the explicit `pending_merchant_confirmation` state. It does not switch to the Appointment Booking role or claim confirmation.

## Automated evidence

- `scripts/check-ai-onboarding-contract.mjs`: verifies package/intent precedes role onboarding, the exact three roles remain present and Sales appointment authority remains wired.
- `scripts/check-onboarding-readiness.mjs`: verifies package-first anonymous Builder entry, server draft persistence and the account-at-Deploy boundary.
- `packages/sales-core/src/index.test.ts`: verifies Sales appointment and objection policy instructions.
- `packages/ai-chat-runtime/src/index.test.ts`: proves a Sales playbook can submit an entitled pending appointment after discovery without a role change.
- `packages/db/src/anonymous-builder-store.integration.test.ts`: proves durable revisioned Builder role/package state and claim authority.

## Release verification

- `TEST_DB_PORT=55539 pnpm test:db`: all 120 migrations, PostgreSQL integration suites, RLS checks and guarded rollback passed.
- `pnpm verify`: all repository policies, type checks, unit tests and 35 production builds passed.
- `pnpm package:release` and `pnpm qa:release-artifacts`: all eight production artifacts packaged and passed fail-closed runtime smoke acceptance.
- `pnpm run test:release-gate`: release-gate contract tests passed.
- `node scripts/check-market-release-requirements.mjs`: registry remains valid at 337 requirements, zero accepted and six non-sellable packages.
- `git diff --check`: patch whitespace validation passed.

No browser or GUI was used.
