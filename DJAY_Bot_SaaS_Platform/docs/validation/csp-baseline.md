# CSP baseline (G1b)

Last updated: 2026-07-22

## Scope

Browser realms that ship marketing or merchant chrome:

| App | Config | Applied via |
|-----|--------|-------------|
| `apps/public-site` | `nextSecurityHeaders("public")` | `apps/public-site/next.config.ts` |
| `apps/tenant-web` | `nextSecurityHeaders("tenant")` | `apps/tenant-web/next.config.ts` |
| `apps/platform-master` | `nextSecurityHeaders("platform")` | `apps/platform-master/next.config.ts` |
| `apps/api` | `nextSecurityHeaders("api")` | `apps/api/next.config.ts` |

Source of truth: `config/next-security-headers.ts`.

## Policy highlights

- `default-src 'self'`; `frame-ancestors 'none'`; `object-src 'none'`
- HSTS, `X-Frame-Options: DENY`, `nosniff`, COOP `same-origin`
- Tenant realm allows `microphone=(self)` for voice studio; other realms deny microphone

## Residual `unsafe-inline`

Current CSP includes:

- `script-src 'self' 'unsafe-inline'`
- `style-src 'self' 'unsafe-inline'`

**Why retained:** Next.js App Router still injects inline bootstrap/style in several surfaces; removing `unsafe-inline` without nonces/hashes breaks production HTML.

**Risk accepted until:** Phase 9 pen-test lite + a follow-up hardening ticket to introduce nonce-based CSP (or `'strict-dynamic'`) and drop `unsafe-inline`.

**Compensating controls:** trusted-origin checks on mutating APIs, session cookies HttpOnly/Secure, sensitive mutations gated by `hasSensitiveTenantAssurance`, durable rate limits on auth + checkout.
