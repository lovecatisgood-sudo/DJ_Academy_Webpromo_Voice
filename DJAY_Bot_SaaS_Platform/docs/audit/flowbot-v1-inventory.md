# FlowBot V1 Inventory

Status: P0 evidence, 2026-07-14.

## Source and scope

Audited source: `../../../FlowBot_V1_App/`.

FlowBot's own local authority defines it as a single-tenant deterministic product and explicitly forbids SaaS signup, billing, AI, and voice implementation (`FlowBot_V1_App/AGENTS.md:3-5,24-35`). It is therefore a protected behavior and code reference, not the target SaaS repository.

## Runtime and package layout

The workspace uses Node 24, pnpm 11.12.0, Turborepo, TypeScript 5.9.3, Vitest 3.2.6, Next 16.2.10, React 19.2.7, Drizzle 0.45.2, Zod 4.4.3, Neon, and Argon2 (`FlowBot_V1_App/package.json:1-37`, `apps/dashboard/package.json:1-30`, `packages/db/package.json:1-33`).

| Area | Current responsibility | SaaS disposition |
|---|---|---|
| `apps/dashboard` | Admin UI, admin APIs, public widget APIs, SSE | Port behavior; split tenant/public boundaries |
| `apps/widget` | Preact/Shadow DOM web widget | Reuse UI protocol behavior after opaque deployment contract |
| `packages/core` | Pure deterministic matcher and transition engine | Reuse with parity tests and package rename |
| `packages/db` | SQL client, partial Drizzle schema, auth, tenant helper | Replace identity and access boundary; migrate schema concepts |
| `packages/notifications` | Notification contracts/outbox processing | Refactor into shared workers/outbox package |
| `packages/shared` | Enums and shared types | Refactor to canonical platform domain |

## API inventory

There are 39 route handlers under `apps/dashboard/app/api`:

- 2 authentication routes: login and logout;
- 29 tenant admin routes: current user, overview, bots, versions, draft, nodes, options, publish, rollback, simulator, widget settings, channels, conversations, takeover/reply/release/notes, customers, leads, privacy, and team;
- 6 public widget routes: config, session, message, stream token, stream, and sync;
- 2 health routes: liveness and readiness.

The complete path list is discoverable with:

```bash
find apps/dashboard/app/api -name route.ts -print | sort
```

## Database inventory

`packages/db/migrations/0001_initial.sql` creates 23 tables:

1. tenants
2. users
3. user sessions
4. user invites
5. bots
6. flow versions
7. nodes
8. node options
9. node keywords
10. customers
11. conversations
12. messages
13. processed inputs
14. leads
15. conversation notes
16. events
17. contact channels
18. notification outbox
19. audit logs
20. job heartbeats
21. availability rules
22. availability blocks
23. bookings

Strengths in the schema include tenant-leading indexes, composite same-tenant foreign keys, immutable flow-version references, idempotency uniqueness, an outbox, audit logs, and exclusion of overlapping active bookings (`0001_initial.sql:5-493`).

The migration contains no `CREATE POLICY`, `ENABLE ROW LEVEL SECURITY`, or `FORCE ROW LEVEL SECURITY`. RLS is described as future defense in depth in `docs/11-ADR.md` ADR-13, not implemented current behavior.

## Authentication and tenancy

- Login requires a caller-supplied tenant ID plus email and password (`packages/db/src/auth.ts:35-64`).
- Users have one embedded tenant and role `owner | admin`; there is no global user plus membership model (`auth.ts:5-29`).
- Sessions are random, stored hashed, revocable, and expire after 14 days (`auth.ts:57-69,80-131`).
- `tenantDb()` sets transaction-local `app.tenant_id` but there are no RLS policies that consume it (`packages/db/src/tenant-db.ts:9-23`).
- Only one production source file references `tenantDb()`, while ten app/package files reference `createSqlClient()`. Tenant isolation is presently application-predicate discipline, not a fail-closed repository boundary.
- Existing owner/admin credential creation is not self-service SaaS registration and must not be reused as the Tenant Master Admin signup design.

## Deterministic runtime behavior

Accepted high-value behavior:

- immutable published flow versions;
- conversation pinning to a flow version;
- lock-before-idempotency processing with stored responses;
- atomic form submission and lead creation;
- deterministic keyword and content matching;
- database-backed SSE replay with buffered live handoff;
- 30-second/focus sync before takeover stream;
- admin takeover, reply, release, and durable conversation notes;
- outbox-backed notifications;
- phone/email match suggestions without automatic merges;
- privacy export and erasure paths.

These rules are documented at `FlowBot_V1_App/AGENTS.md:24-35` and exercised by the runtime and tests. They are parity requirements for the SaaS port.

## Jobs and deployment

- `scripts/run-jobs.mjs` processes background work and reports job heartbeats.
- Deployment supports a standalone Next server, static widget, and worker; long-lived SSE proxy behavior is an explicit hosting requirement (`docs/10-DEVOPS-DEPLOYMENT.md`).
- Environments are local, CI, staging, and production with separate databases and credentials.
- Rollback layers cover application, widget hash, published flow pointer, database restore/forward fix, and bot disablement.

## Automated test inventory

Nineteen test/smoke files were found:

- 10 Vitest files across dashboard, widget, engine, matcher, DB invariants/password/tenant helper/token, notifications, and shared enums;
- 2 Playwright specifications for dashboard and widget;
- 7 smoke scripts for M2, M3, M5, privacy, rate limits, settings, and SSE soak.

The repository `verify` command runs typecheck, unit tests, production build, and secret scan (`package.json:22-30`). A fresh P0 baseline result is recorded separately in `docs/validation/p0-baseline.md` after execution.

## Gaps blocking direct SaaS reuse

- no self-service registration, verification, recovery, membership, workspace switcher, or ownership transfer;
- no platform identity realm;
- no forced RLS or restricted database roles;
- raw SQL imports are broadly available;
- no catalog, subscriptions, entitlements, quota ledger, invoices, or payment webhooks;
- current status vocabulary differs from the voice/text application;
- single-process SSE and jobs require external fan-out/queue readiness before horizontal scaling;
- FlowBot local rules prohibit implementing the requested SaaS inside this workspace.

