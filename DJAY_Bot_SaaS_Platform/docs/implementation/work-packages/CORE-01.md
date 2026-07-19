# CORE-01: Identity, Roles and Tenant Security

- Local implementation status: Complete
- Paid acceptance status: Blocked by policy approvals and pre-GA security validation
- Migration: `0044_tenant_roles_security_policy`

## Delivered

- Expanded the tenant role model to owner, administrator, legacy operator,
  conversation manager, human agent, analyst/viewer, billing manager and
  read-only support roles.
- Split billing authority into checkout, Portal, tax, overage/cap, pack,
  plan-change and cancellation permissions. Billing managers do not receive
  bot authoring, publication, integration or team-management authority.
- Added shared sensitive-action assurance requiring recent password
  reauthentication and MFA. Checkout, integration credentials, social
  connections, privacy jobs, retention changes and member access changes use
  the shared enforcement path.
- Added a tenant security policy for every existing and future tenant. The
  sensitive-action MFA requirement is database-locked on; the general tenant
  administrator MFA policy remains configurable pending the approved GA
  policy.
- Added owner-only, tenant-scoped membership role change and revocation with
  owner protection, cross-tenant non-disclosure and immutable before/after
  audit evidence.
- Removed revoked memberships from the operational active-team read model.
- Added Team UI controls for role changes, ownership transfer and access
  removal, and aligned Flow, AI Text and Voice authoring UI with permission
  checks instead of role-name checks.
- Made tenant, Platform and operations audit records immutable at the database
  layer.
- Preserved the existing purpose/scope/expiry, two-person approval, tenant
  disclosure and revocation model for Platform support access.
- Preserved separate tenant and Platform sessions, cookie audiences and MFA
  challenge paths.

## Security Boundaries

- The browser cannot grant itself authority; routes authorize the active
  server session and selected membership.
- Membership mutation is restricted again in PostgreSQL to an active owner in
  the same tenant. The owner cannot be demoted or revoked through this command.
- Read-only support is not an ordinary tenant invitation role. Temporary
  support access remains governed by the Platform support-access workflow.
- Sensitive mutation failures do not reveal cross-tenant membership existence.
- Role and revocation events retain actor, target, request ID and before/after
  state in immutable audit storage.

## Evidence

- `packages/authorization/src/index.test.ts`
- `apps/api/lib/tenant-assurance.test.ts`
- `packages/db/src/tenant-workspace-store.integration.test.ts`
- `packages/db/src/platform-support-store.integration.test.ts`
- `packages/db/src/migration-invariants.test.ts`
- `packages/db/tests/rls-isolation.sql`
- `packages/db/tests/last-owner-must-fail.sql`
- `scripts/test-db-integration.sh`

## Deferred Dependencies

- TEN-001 checkout-triggered atomic subscription provisioning belongs to
  BILL-01 and CORE-02.
- TEN-003 administrator and human-agent seat enforcement belongs to COM-02.
- Full audit coverage for billing, invoices, credits, entitlement overrides
  and exports is completed by their owning work packages.
- SEC-001 through SEC-009 require infrastructure controls, upload hardening,
  provider/legal approvals and pre-GA security exercises across later work
  packages. They are not accepted by this package alone.
- The owner must approve the tenant-admin MFA, retention/privacy, support and
  provider-security decisions tracked by CTRL-02 before paid GA.
