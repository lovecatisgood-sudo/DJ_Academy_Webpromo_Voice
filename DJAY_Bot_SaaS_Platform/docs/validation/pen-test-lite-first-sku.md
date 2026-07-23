# Pen-test lite — first SKU (G6b)

Date: 2026-07-23  
Scope: `flowbot_basic` staging (or local API for HTTP-only rows)

## Automated (run anytime API is up)

```bash
pnpm qa:smoke-negatives
pnpm qa:abuse-floor
```

| Check | Expected | Result | Notes |
|-------|----------|--------|-------|
| Evil Origin on `/public/auth/login` | 401/403, no ACAO echo | ☐ blocked | API `:3103` down 2026-07-23 |
| Evil Origin on `/public/auth/register` | 403 | ☐ blocked | |
| Unauthenticated checkout | 404 `not_found` | ☐ blocked | |
| Evil Origin + forged cookie checkout | 404 `not_found` | ☐ blocked | |
| Invalid FlowBot session key | denial | ☐ blocked | |
| Register/login flood | ≥1× 429 | ☐ blocked | qa-abuse-floor |

## Staging / operator (authenticated)

| Check | Expected | Result | Severity if fail | Compensating control |
|-------|----------|--------|------------------|----------------------|
| Cross-tenant conversation/message IDOR | 404 | ☐ | Critical | Forced RLS + non-revealing 404 |
| Checkout without recent reauth+MFA | 403 `reauthentication_required` | ☐ | High | `withTenantMutation` + `assurance: recent_auth` |
| Checkout idempotency key reuse | no double charge / stable intent | ☐ | High | commerce store idempotency |
| Stripe webhook bad signature | reject | ☐ | Critical | `verifyStripeWebhook` → 400 |
| Stripe webhook replay | no double activation | ☐ | High | billing webhook inbox + event_id conflict |
| Widget on disallowed origin | session/config denied | ☐ | Critical | deployment allowedOrigins |
| Checkout flood (auth session) | 429 after 10/15m | ☐ | High | `tenant-billing-checkout` 10/15m |
| XSS in wizard/i18n strings | no script execution | ☐ | High | React text encoding; axe/manual |
| Cookie flags on tenant session | HttpOnly; Secure in prod | ☐ | High | auth-cookie lint + deploy config |

## Code / unit evidence (Wave 1.5 — 2026-07-23)

Does **not** close G6b. Complements staging when API is unreachable.

| Control | Evidence | Result |
|---------|----------|--------|
| `withTenantMutation` Origin → 404, assurance → 403, rate limit → 429 | `apps/api/lib/tenant-mutation.test.ts` (6) | **Pass** |
| G1b wiring: checkout/subscriptions/public login-register rate limits | `apps/api/lib/g1b-abuse-floor.test.ts` (4) | **Pass** |
| Checkout uses `assurance: "recent_auth"` + 10/15m limit | `apps/api/app/tenant/billing/checkout/route.ts` | **Present** |
| Sensitive assurance helper | `apps/api/lib/tenant-assurance.test.ts` (1) | **Pass** |
| Stripe webhook verify rejects tamper/stale | `packages/usage-billing` `verifyStripeWebhook` tests (8 suite) | **Pass** |
| Webhook route maps verify failure → 400 `rejected` | `apps/api/app/public/billing/webhooks/stripe/route.ts` | **Present** |
| Purchase-intent consume idempotent | DB integration (Wave 0) | **Pass** (prior) |

## Axe (live pages)

Attach reports under `/tmp` or `docs/validation/artifacts/`:

- Setup wizard
- Inbox
- Usage `?checkout=return`

## Crit/High disposition

| Finding | Sev | Fix / waiver | Owner |
|---------|-----|--------------|-------|
| No Crit/High opened from static/unit review | — | Staging operator rows still ☐ | Security |
| Automated HTTP pack not executed (API down) | High* | *process risk until smoke/abuse green | SQA |

\*Not a product vuln finding — evidence gap. G6b stays **open** until HTTP + operator Crit/High rows are filled.

**G6b closed when:** all Critical/High are Fixed or waived with named owner + date **and** automated HTTP rows are green against staging (or attested local API).

## Compensating controls already in code (pre-staging)

- Tenant mutations: `withTenantMutation` (Origin + authz + assurance + rate limit)
- Purchase intents + checkout consume path
- ADR 014 conversation_manager cannot publish/deploy
- G1b source invariants + commerce-off boot profile
