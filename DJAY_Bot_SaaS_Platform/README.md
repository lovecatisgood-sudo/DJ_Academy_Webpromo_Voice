# DJAY Bot SaaS Platform

This directory is the implementation workspace for the multi-tenant DJAY Bot SaaS Platform. It is intentionally separate from the existing production/reference applications:

- `../FlowBot_V1_App/` remains the protected single-tenant deterministic FlowBot V1 reference.
- `../src/` and the root Next.js application remain the current single-tenant voice/text reference.
- `../djay-bot-saas-platform-final-vision-v3/` is the target product and program specification.

The platform contains three product families and exactly six public plan keys:

```text
flowbot_basic
flowbot_premium
ai_chat_basic
ai_chat_premium
voice_basic_gen1
voice_advanced_gen2
```

Implementation proceeds through gated phases P0-P9. Product code may only be ported after the identity, tenant isolation, and entitlement foundations that protect it are in place.

## Current phase

P0 through P6 local engineering are complete. P7 Voice Basic local engineering
is complete; its
provider-neutral protocol/lifecycle and separately deployable gateway foundation
plus restricted Gen1 grant, concurrency, database-derived settlement, crash
recovery, realtime media, Sales Core actions, durable call outcomes/callbacks,
plan-capped transcript retention, tenant Studio/Inbox UI, and Platform operations
controls are implemented. The restartable legacy Voice/Text migration and its
PostgreSQL rehearsal are also complete; external live quality and merchant
acceptance remain pending. P8 Voice Advanced is active: its Platform-only Gen2
qualification, reviewed canary/rollback, incident pause, independent credit
review, role-aware operations UI, generation-pinned tenant deployments,
restricted Gen2 session assignment, exact gateway routing, independently
reviewed production admission, and entitlement-aware Advanced analytics are
implemented together with a provider-neutral bilingual evaluation harness,
while equivalent/live-provider evidence, capacity, live quality, margin, and
named-merchant acceptance remain pending. Gen2 and the Voice runtime
activation is disabled by default. FlowBot remains limited to named pilots until three
real isolated tenant acceptances pass. AI Chat Basic also requires an approved
live routing-profile evaluation and named merchant acceptance before production
self-service. Social channels remain disabled pending the external acceptance
worksheet and platform approvals. Paid plans remain disabled until the commercial and paid-GA gates
are accepted and passed. P9 engineering is active: the tenant-isolated,
role-aware Usage Center now reconciles customer units, reservations, allowance,
and safety caps while making the pre-release billing state explicit. Restricted
Platform Owner/Finance reconciliation and a separate-cluster PostgreSQL 16
backup/restore gate also pass. Checkout, invoices, tax, dunning, and public
charging remain disabled.

## Local commands

Use the pinned Node 24 wrapper from this directory:

```bash
scripts/use-node24.sh pnpm install
scripts/use-node24.sh pnpm run verify
scripts/test-db-integration.sh
scripts/use-node24.sh pnpm run qa:p3-ui
scripts/use-node24.sh pnpm run qa:p4-flowbot
scripts/use-node24.sh pnpm run qa:p5-ai-chat
scripts/use-node24.sh pnpm run qa:p6-line
scripts/use-node24.sh pnpm run qa:p7-voice
scripts/use-node24.sh pnpm run qa:p9-usage
scripts/use-node24.sh pnpm run qa:p9-operations
scripts/use-node24.sh pnpm run qa:p9-restore
scripts/use-node24.sh pnpm run dev
```

Development applications:

```text
Public site:      http://localhost:3100
Tenant workspace: http://localhost:3101
Platform Master:  http://localhost:3102
API:              http://localhost:3103
Voice gateway:    http://localhost:8080
```

Copy `.env.example` into the deployment secret/configuration system and replace
every placeholder. Tenant and platform auth secrets must be independent. The
privacy export key must also be independent and available only to API/worker
deployments. See `docs/runbooks/` for bootstrap, worker, privacy, support-access,
and restore procedures.

## Authority

1. `../djay-bot-saas-platform-final-vision-v3/15-detailed-multi-tenant-implementation-plan.md`
2. `../djay-bot-saas-platform-final-vision-v3/13-codex-implementation-guide.md`
3. Accepted ADRs in `docs/adr/`
4. Phase-specific specifications in this workspace
5. Existing implementation, only as evidence of current behavior

When authorities conflict, stop the dependent implementation and record the conflict. Existing single-tenant behavior does not silently override a SaaS security invariant.
