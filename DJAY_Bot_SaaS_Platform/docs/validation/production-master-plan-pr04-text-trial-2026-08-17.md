# PR-04 AI Text Starter trial implementation evidence — 2026-08-17

## Scope

This checkpoint implements the server-authoritative AI Text Starter trial path. It does not make any package sellable and does not constitute Product Owner, legal, security, provider, browser, or production acceptance.

## Implemented authority

- `0114_text_starter_trial_setup.sql` persists a tenant-bound, RLS-protected setup lifecycle with Stripe Customer, SetupIntent, and PaymentMethod references. It stores no card number, CVC, client secret, or raw fingerprint.
- `POST /tenant/trials/text/setup` is deferred until a claimed, published AI Text Starter configuration and completed merchant onboarding exist. It creates an idempotent Stripe Customer and card-only, off-session SetupIntent without a charge or subscription.
- `POST /tenant/trials/text/activate` independently retrieves the SetupIntent, requires `succeeded`, verifies tenant/purchase metadata plus Customer/PaymentMethod linkage, and HMACs the provider fingerprint with a dedicated secret before persistence.
- Activation is atomic and idempotent. It starts a fixed 30-day website-only grant with exactly 500 committed AI replies, a 500 safety cap, no overage, no social access, and no automatic conversion or charge.
- The database unique authority permits at most one AI Text trial per keyed fingerprint digest. Audit and outbox evidence exclude raw payment evidence.

## Verification

- `pnpm --filter @djay/usage-billing test` — 9/9 passed, including SetupIntent request and independent retrieval evidence.
- API, database, and usage-billing TypeScript checks passed.
- `FLOW_TRIAL_ONLY=true TEST_DB_PORT=55480 pnpm test:db` — all 110 migrations and all 3 Flow/Text trial integration cases passed, including duplicate fingerprint denial.
- `TEST_DB_PORT=55479 pnpm test:db` — all 110 migrations, PostgreSQL integration suites, RLS and guarded rollback passed. The run also exposed and fixed a pre-existing resilience-test isolation defect: its batch-size-one fixture now clears only the disposable test database's global operations outbox before execution.
- `pnpm verify` — lint, boundaries, registry/decision checks, typechecks, unit tests and all 35 package builds passed.

## Gates intentionally open

- Unmocked Stripe SetupIntent/SCA/card-fingerprint acceptance in staging.
- Browser acceptance for the deferred Stripe Elements UI; no browser was opened in this checkpoint.
- The deduplicated 100-replies-remaining warning (`TRL-006`) and expiry/exhaustion fallback (`TRL-007`).
- Product Owner acceptance, sellability, legal/tax approval, penetration testing, accessibility/responsive acceptance, and production deployment.
