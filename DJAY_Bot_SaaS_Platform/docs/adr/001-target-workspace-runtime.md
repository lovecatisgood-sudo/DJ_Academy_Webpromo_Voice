# ADR-001: Target Workspace, Runtime, and Topology

- Status: Accepted
- Date: 2026-07-14
- Phase: P0

## Context

FlowBot V1 has the stronger package/runtime baseline, but its local authority prohibits implementing SaaS, AI, voice, and billing in that workspace. The root voice/text app is single-tenant and has provider-specific public contracts. Modifying either in place would mix production/reference behavior with an incomplete SaaS security kernel.

## Decision

Build in the separate `DJAY_Bot_SaaS_Platform/` workspace. Existing applications remain protected references until explicit tenant cutover.

Use:

- Node.js 24 LTS;
- pnpm 11.12.0 and Turborepo;
- strict TypeScript 5.9.3;
- pinned Next.js 16.2.10 and React 19.2.7 for web applications initially;
- PostgreSQL 16, Drizzle 0.45.2, Zod 4.4.3, Vitest 3.2.6, and Playwright;
- exact production dependency versions in the lockfile, changed only by reviewed dependency work.

Logical layout follows the target plan:

```text
apps/public-site
apps/tenant-web
apps/platform-master
apps/api
apps/public-widget
apps/workers
apps/voice-gateway
packages/* domain modules
```

The initial system is a modular monolith: web/API modules may deploy together where operationally useful, but package import boundaries and authorization realms remain enforceable. Workers run separately. The voice gateway is separately deployable because realtime media, provider credentials, scaling, and failure isolation differ from ordinary web traffic.

Public, tenant, platform, API, worker, and gateway processes use environment-specific identities and secrets. Staging and production use separate databases, provider projects/keys, caches, queues, object prefixes, payment endpoints, and email identities.

## Consequences

- Porting is slower than an in-place merge but preserves rollback and prevents an insecure half-migration.
- Separate web applications add build/deploy units but enforce platform/tenant separation and reduce accidental bundle leakage.
- The target can reuse FlowBot's proven versions and package patterns without violating FlowBot's scope.
- Service extraction is not allowed merely for architectural preference; it requires scale, security, compliance, or fault-isolation evidence.

## Validation

- Import-boundary tests prevent tenant/public apps from importing restricted provider and raw DB modules.
- Build metadata identifies app, commit, migration, and protocol versions.
- Each app has liveness/readiness; workers expose heartbeat/backlog; voice gateway exposes capacity without provider identity.
- Release tooling supports previous immutable app/widget/gateway versions.

