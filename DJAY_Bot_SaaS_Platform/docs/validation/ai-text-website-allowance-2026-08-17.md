# AI Text website and monthly allowance evidence — 2026-08-17

## Scope

`ATS-002`: provide the website AI Text widget and include up to 2,000 AI-generated replies in each Starter monthly allowance period.

## Implemented authority

- The immutable Starter catalogue grants `channel.web`, declares `ai_response: 2000`, and pins the customer-visible overage rate separately.
- Subscription activation copies the resolved allowance into a tenant/subscription quota account. The restricted runtime requires an active contract snapshot, active web deployment, allowed origin, active session, current period, and Text/web entitlements.
- Each new input ID reserves exactly one `ai_response` transactionally. Funding is allocated in order from included allowance, purchased packs, then expressly consented overage; otherwise the request fails closed as allowance exhausted. Settlement and release are replay-safe and immutable.
- The usage-period worker creates the next contiguous Bangkok-time monthly account from the latest entitlement snapshot and resets committed counters without rewriting history.
- The versioned AI Chat browser widget provides accessible Thai/English UI, origin-normalized API transport, session scoping and a safe unavailable fallback. The packaged CDN admits only integrity-recorded widget paths.

## Verification

- `TEST_DB_PORT=55584 pnpm test:db`: passed the AI Chat restricted runtime, funding, quota, period authority, tenant isolation and full 127-migration PostgreSQL suite.
- `pnpm verify`: passed lint, typecheck, tests, and production builds across 35 packages.
- `pnpm run qa:release-artifacts`: passed all eight packaged production artifacts, widget CDN admission, security headers, health/readiness and fail-closed runtime checks.

## Acceptance boundary

`ATS-002` is implemented but unaccepted. Browser accessibility/responsive acceptance, unmocked AI-provider use, staging allowance/overage reconciliation, penetration testing, named Thai merchant acceptance and Product Owner acceptance remain open. Packages remain non-sellable.
