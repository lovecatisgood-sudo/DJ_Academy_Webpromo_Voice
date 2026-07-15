# M0 Spec — Foundation

## Goal

Create a green, deployable monorepo foundation that enforces the integration contract before feature UI work.

## Included

- pnpm/Turborepo layout.
- Node 24 and pinned Next.js 16.x.
- shared enums/zod/errors.
- Drizzle schema and migrations from doc 06.
- `tenantDb()` transaction-local tenant context and explicit scoping.
- owner/admin auth, sessions and invite model.
- environment validation.
- production/test seeds.
- CI with two-tenant integration database.
- liveness/readiness endpoints.

## Excluded

Flow editor UI, widget UI, inbox UI, email provider delivery, scheduler, external channels, AI, voice and billing.

## Acceptance checklist

- [ ] Repository dependency boundaries are linted.
- [ ] All migrations apply to a clean database.
- [ ] Test seed creates two tenants and no cross-links.
- [ ] Every tenant-owned table has `tenant_id`.
- [ ] Cross-tenant admin resource lookup returns 404.
- [ ] Node/option targets cannot cross versions.
- [ ] Published version referenced by a conversation cannot be deleted.
- [ ] Raw session token is not a database field.
- [ ] Owner credential is not committed.
- [ ] Server-side admin session revocation works.
- [ ] CI runs format, lint, typecheck, unit, integration, build and secret scan.
- [ ] `/api/health/live` and `/api/health/ready` work.

## Required tests

- migration clean install;
- foreign-key invariants;
- tenantDb context and rollback;
- two-tenant isolation;
- auth login/revoke/expiry;
- invite expiry/single use;
- environment failure on missing variables.
