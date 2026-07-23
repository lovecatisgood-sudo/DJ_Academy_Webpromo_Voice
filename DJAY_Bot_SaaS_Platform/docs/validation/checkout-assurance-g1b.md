# Checkout assurance + abuse floor (G1b)

Last updated: 2026-07-22

## Checkout POST controls (`/tenant/billing/checkout`)

Order of checks (do not reorder without Security review):

1. Tenant session + `billing.checkout` permission → else `404 not_found`
2. Trusted Origin → else `404 not_found`
3. `hasSensitiveTenantAssurance(session)` → else `403 reauthentication_required`
4. Durable `enforceRateLimit("tenant-billing-checkout", tenantId:userId, 10 / 15m)` → else `429 rate_limited`
5. Stripe provider + envelope key present → else `503 checkout_unavailable`
6. Prepare/complete Stripe checkout (idempotency key required)

## Reauth / MFA policy

`hasSensitiveTenantAssurance` delegates to `hasRecentTenantAssurance` (`@djay/authorization`):

- Recent password (or step-up) reauthentication **and** recent MFA verification, both within **10 minutes**
- Missing `mfaVerifiedAt` fails assurance (same as expired MFA)

Implication: checkout (and other sensitive tenant mutations) require a fresh step-up that includes MFA proof when the session records MFA verification. Users without completed MFA challenge cannot pass assurance until MFA is verified on the session.

## Other durable rate limits (confirmed present)

| Scope | Route family |
|-------|----------------|
| `login-account` / `login-client` | public auth login |
| `register-account` / `register-client` | public register |
| `tenant-mfa-login` / `platform-mfa` | MFA challenge |
| `platform-login` | platform login |
| `invitation-accept` / `tenant-invitation` | invitations |
| Social / widget / voice session scopes | public product ingress |

## Smoke evidence

- Static: this checklist + CSP note in `docs/validation/csp-baseline.md`
- Runtime: `pnpm --filter @djay/api exec vitest run lib/tenant-assurance.test.ts` (assurance)
- Rate-limit store: `packages/db` `consumeRateLimit` integration coverage
- Manual / CI follow-up: authenticated burst of 11 checkout POSTs in 15m must yield HTTP 429 on the 11th (Phase 9 abuse pack)
