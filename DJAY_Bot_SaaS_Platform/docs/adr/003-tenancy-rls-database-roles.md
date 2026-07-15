# ADR-003: Tenant Context, Database Roles, Repositories, and Forced RLS

- Status: Accepted
- Date: 2026-07-14
- Phase: P0

## Context

FlowBot's schema is tenant-shaped, but current runtime access uses raw SQL and no RLS policies. The voice/text schema is wholly tenant-unscoped. A multi-tenant SME platform requires fail-closed defense beyond repeated application predicates.

## Decision

Use shared PostgreSQL with row-level tenant isolation for the initial platform. Every tenant-owned table includes `tenant_id uuid not null`, tenant-leading indexes, and same-tenant composite relationships where practical.

Every tenant command/query runs in a transaction that:

1. authenticates or resolves a signed public deployment/binding;
2. constructs immutable `TenantContext` server-side;
3. sets transaction-local `app.tenant_id` and actor/request metadata;
4. invokes a tenant-scoped repository;
5. commits or rolls back and clears context with the transaction.

RLS is enabled and forced. Policies compare row tenant ID to a strict UUID conversion of `current_setting('app.tenant_id', true)`. Missing or malformed context grants no access. Runtime and worker roles do not own tables and do not have `BYPASSRLS`.

Roles:

- migrator/schema owner;
- tenant runtime;
- tenant worker;
- restricted platform service;
- redacted operations reader.

Platform cross-tenant operations use explicit platform repositories/functions, least-privilege grants, actor/reason metadata, and immutable audit. They do not disable RLS in tenant request code.

## Repository boundary

- Only `packages/db` opens database connections.
- Product/domain packages depend on repository interfaces or scoped implementations.
- Route handlers and React components cannot import a raw client.
- Tenant repositories require `TenantContext`; global catalog repositories require a distinct `SystemContext`; platform repositories require `PlatformContext`.
- Context types are branded/non-interchangeable.
- Background jobs include tenant ID in the signed/validated envelope and open one scoped transaction per tenant job.

## Non-database isolation

All cache keys, queues, locks, objects, rate limits, traces, logs, exports, and usage records include tenant scope. Public resource keys are random/rotatable and resolve tenant/deployment server-side; they are not tenant IDs.

## Migration strategy

Create global identity/catalog tables first, then tenant tables and policies. Seed two test tenants before product tables. Policies, grants, and negative isolation tests ship in the same migration as each tenant table. Backfills use the migrator role with explicit tenant mapping and validations.

## Validation

The disposable Postgres harness must prove for every repository/table:

- tenant A can CRUD its rows;
- tenant A cannot select, insert, update, delete, reference, export, or lock tenant B rows;
- guessed IDs return non-revealing not-found behavior;
- missing tenant context fails closed;
- worker context cannot cross tenant;
- platform operations require platform context and create audit;
- table owner/migrator privileges are unavailable to runtime credentials.

Schema introspection fails CI when a tenant-owned table lacks forced RLS, tenant-leading index, or registered isolation tests.

## Consequences

RLS does not replace authorization or entitlements. Application predicates remain for clarity/performance, while RLS and same-tenant foreign keys contain defects. Local tests require real PostgreSQL; in-memory database substitutes cannot validate this ADR.

