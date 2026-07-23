# Phase 8 — Engineering hardening (G5)

Date: 2026-07-22

## Delivered

- `withTenantMutation` helper (`apps/api/lib/tenant-mutation.ts`) with authz, Origin, assurance, rate limit, Zod
- Migrated allowlist mutations:
  - `billing/checkout`
  - `subscriptions` POST
  - `privacy-jobs` POST (+ rate limit)
  - `team/invitations` POST
  - FlowBot `publish` / `deployments` POST (+ rate limits)
- ADR 014: narrow `tenant_conversation_manager` (no publish/deploy/integrations/channels.manage)
- Commerce-off boot profile: `assertCommerceCapabilityProfile` + unit tests (no Stripe required when billing URL absent)
- Denial unit tests for 404 / 403 / 429 / 400

## Deferred

- Full `commerce-store` split (purchase intents already extracted; no further split required for G5)
- AI Chat / Voice publish-deploy migration to helper (same over-grant fixed via ADR matrix)

## Verification

```bash
cd DJAY_Bot_SaaS_Platform
./scripts/use-node24.sh pnpm --filter @djay/api exec vitest run \
  lib/tenant-mutation.test.ts \
  lib/commerce-capability-profile.test.ts \
  lib/g1b-abuse-floor.test.ts
./scripts/use-node24.sh pnpm --filter @djay/authorization exec vitest run src/index.test.ts
./scripts/use-node24.sh pnpm --filter @djay/api exec tsc --noEmit
```
