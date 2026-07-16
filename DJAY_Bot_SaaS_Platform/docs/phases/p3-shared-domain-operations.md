# P3 Scope: Shared Domain and Tenant Operations

- Status: Complete (2026-07-15)
- Authority: ADR-007 and implementation plan phases P3.1-P3.6
- Product code migrated: none

## Delivered

- Tenant-scoped contacts and exact/verified identity uniqueness. Weak or
  unverified matches return review candidates and never auto-merge.
- Canonical lead lifecycle with immutable status history. Appointment requests
  remain separate from confirmed appointments.
- Product-neutral conversations pinned to the entitlement snapshot that
  authorized creation, strictly ordered immutable messages, external-message
  replay protection, handover events, notes, and transitions.
- Tenant Inbox, Contacts, Leads, Knowledge, and Data Controls workspaces.
- Revision-backed knowledge sources and chunks ready for product-specific
  ingestion adapters.
- Typed action gateway with exactly seven approved effects: lead create/update,
  sales fact, appointment request, follow-up, handover, and allow-listed merchant
  notification. Arbitrary webhook and arbitrary recipient effects are rejected.
- Tenant Master Admin-only privacy jobs. Exports cover source and derived records,
  are AES-GCM encrypted at rest, expire in seven days, and are downloaded only
  through the authenticated tenant realm.
- Contact erasure through a restricted worker-only security-definer function.
  Personal content is anonymized while immutable lineage and legally necessary
  relational records remain auditable.
- Migration `0042_privacy_job_scope` requires every actionable erasure to name
  one exact contact and keeps the JSON scope equal to the tenant foreign key.
  Workspace-wide export remains supported; workspace-wide erasure does not.
  Conflicting reuse of a privacy idempotency key now fails closed.
- Platform support grants with a distinct requester and approver, recent owner
  assurance, four-hour maximum, full platform audit, revocation, and a persistent
  merchant-visible banner while access is active.

## Security invariants

- All 25 P3 tenant tables use forced RLS and same-tenant references.
- Worker access is tenant contextual. The broad P3 draft worker policies were
  removed before completion.
- Messages remain immutable. The worker role has no direct update grant; only the
  audited erasure function can activate the narrowly checked redaction path.
- Closed conversations reject new messages.
- Entitlement authority is server resolved; browser plan values never authorize
  a conversation or action.
- Tenant and public applications expose no provider/model configuration.
- Support grants do not create tenant memberships or tenant-realm sessions and
  do not confer AI-routing authority.
- Browser, API, repository, foreign key, and PostgreSQL check constraints all
  enforce the same export-versus-erasure scope. Cross-tenant or already-erased
  contact substitution is non-revealing and creates no job.

## Completion gate

Migration/RLS tests, repository integration tests, privacy export/erasure,
two-person support approval, unit/type/boundary/build checks, and 12 responsive
browser views passed. Evidence is in `../validation/p3-shared-domain-operations.md`.
