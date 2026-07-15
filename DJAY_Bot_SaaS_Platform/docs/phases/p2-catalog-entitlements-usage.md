# P2 Scope: Catalog, Entitlements, Subscriptions, and Usage

- Status: Complete (2026-07-15)
- Authority: ADR-003, ADR-008, package matrix document 14
- Product code migrated: none

## Delivered

- Exactly six stable public plans across FlowBot, AI Chatbot, and Voice Agent.
- Immutable, effective-dated published plan versions with provider-neutral public
  DTOs and nullable unapproved commercial values.
- One live plan per tenant/product and up to three combined product subscriptions.
- Explicit subscription state machine and state-to-access policy.
- Server-resolved immutable entitlement snapshots and approved-override schema.
- Tenant-scoped quota accounts, idempotent reservations, settlement/release, and
  immutable customer usage events.
- Public catalog and signup plan-selection flow.
- Tenant subscription/usage view and Tenant Master Admin-only, MFA plus recent
  reauthentication plan-selection command.
- Platform Master commerce overview, subscription list, and reauthenticated
  Platform Owner-only pilot activation.
- Provider-neutral payment interface and timestamped signed webhook inbox with
  encryption, event-ID idempotency, and conflict detection.

## Security invariants

- Browser plan keys are selector candidates, never entitlement authority.
- Tenant IDs come only from resolved sessions and branded tenant context.
- Tenant Admin and lower roles cannot change subscriptions.
- Published plan versions, snapshots, and usage events cannot be updated/deleted.
- All six tenant commerce/usage tables use forced RLS and same-tenant references.
- Billing webhooks never trust browser checkout success.
- Public and tenant responses contain no provider, adapter, model, or internal
  cost fields.
- Provider/model routing remains absent from tenant applications and reserved for
  future restricted Platform Owner/AI Operations implementation.

## Commercial boundary

ADR-008 remains Proposed. All six seeded versions are non-sellable, with null
price, allowance, and overage values. Platform Owner activation is an audited
manual pilot operation, not evidence of payment. Public charging, tax invoices,
refunds, trials, proration, and overage collection remain blocked until an
accepted commercial ADR supplies exact policy and provider contracts.

## Completion gate

The generated six-plan matrix, cross-tenant database tests, one-tier constraint,
multi-product coexistence, signup provisioning, entitlement denial, quota replay,
webhook replay/tamper, realm confusion, provider-leak scan, production build, and
responsive browser checks passed. Evidence is in
`../validation/p2-catalog-entitlements-usage.md`.
