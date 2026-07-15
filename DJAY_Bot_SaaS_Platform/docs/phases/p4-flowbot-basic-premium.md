# P4 Scope: FlowBot Basic and Premium

- Status: Engineering complete (2026-07-15)
- Rollout status: named pilots only; self-service expansion remains disabled
- Authority: implementation plan P4 and protected FlowBot V1 behavior inventory

## Delivered

- Provider-neutral deterministic domain, execution engine, widget, and migration
  packages. Basic and Premium share one graph contract with server-side node,
  publish, deployment, and runtime entitlement enforcement.
- Tenant-scoped visual authoring, immutable versions, publish-copy rollback,
  deployment limits, exact-origin keys, onboarding templates, install checks,
  analytics, CSV export, and downgrade remediation.
- Public runtime with opaque hashed credentials, immutable version and entitlement
  pins, idempotent inputs, exact execution metering, durable transcript replay,
  reconnect polling, and immediate automation suspension during human takeover.
- Premium delays, embedded immutable subflows, IANA-timezone business schedules,
  team routing, encrypted approved webhooks, bounded retries, failure branches,
  and branding removal.
- Basic/Premium lead capture into the shared domain plus transactional, encrypted,
  fixed-template merchant email delivery with worker-only claims and dead letters.
- Restartable FlowBot V1 conversion with deterministic IDs, rotated deployment
  keys, quarantine, reconciliation evidence, and rollback refusal after target
  executions exist.

## Security invariants

- All FlowBot tenant tables use forced RLS and same-tenant references.
- Public widget and worker roles receive restricted function execution, not broad
  runtime table access.
- Basic and Premium require `ai.enabled=false`; provider SDKs, provider names, and
  model identifiers are absent from the FlowBot engine, widget, migration, tenant
  UI, and public contracts.
- Existing sessions retain their original flow version and entitlement snapshot
  when another version is published or a plan changes.
- Integration endpoints and notification recipients use independent AES-GCM
  envelope keys. Merchant notification templates and webhook profiles are
  server allow-listed.

## Completion and rollout gate

The code, database, browser, and migration-tooling gates pass. This authorizes P5
engineering to begin. It does not authorize broad FlowBot self-service rollout.
Three real, isolated named pilot tenants must still complete the acceptance
worksheet in the validation record before the rollout flag is expanded. This is
an external operational acceptance gate, not an unimplemented code path.
