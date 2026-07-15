# DJAY Bot SaaS Platform State

Last updated: 2026-07-15

## Completed phases

- P0: baseline audit, boundaries, and accepted architecture decisions.
- P1: public self-registration, tenant provisioning, exactly one Tenant Master
  Admin, team/session/MFA/ownership controls, and separate Platform Master realm.
- P2: exactly six plans, subscriptions, immutable entitlement snapshots, quota
  accounting, signed billing webhook inbox, and pilot activation.
- P3: shared contacts, leads, conversations, inbox, knowledge revisions, typed
  action gateway, privacy export/erasure, and two-person support grants.
- P4 engineering: FlowBot Basic/Premium deterministic authoring and runtime,
  widget deployments, Premium operations, migration tooling, and release QA.

## Active phase

P5 builds AI Chatbot Basic Web on the shared P1-P4 authority. It must introduce a
restricted Provider Gateway and Sales Conversation Core without exposing provider
or model identity to tenant/browser packages. P4 FlowBot stays provider-neutral.

## P4 release checkpoint

The P4 engineering gate passes. Delivered behavior includes visual plan-aware
authoring, immutable publish/rollback and execution pins, exact-origin opaque
widget sessions, durable transcript replay and handover, execution metering,
Premium timers/subflows/schedules/team routing/approved webhooks, analytics,
install checks, downgrade remediation, encrypted lead notifications, and
restartable legacy migration tooling.

Broad FlowBot self-service remains disabled until three real named pilot tenants
complete the acceptance worksheet in
`docs/validation/p4-flowbot-basic-premium.md`. Synthetic tests do not replace that
merchant sign-off, but the external rollout gate does not block P5 engineering.

## Non-negotiable boundaries

- Every merchant workspace is tenant scoped and protected by forced PostgreSQL RLS.
- A merchant Tenant Master Admin registers only through the public SaaS identity flow.
- Tenant roles cannot select, view, or alter AI providers, model identifiers, routing,
  credentials, internal cost, or fallback policy.
- Provider/model routing belongs only to restricted Platform Owner and delegated
  Platform AI Operations controls.
- Public charging remains disabled while ADR-008 commercial values are unresolved.

## Latest verification

```bash
scripts/use-node24.sh pnpm run verify
scripts/test-db-integration.sh
scripts/use-node24.sh pnpm run qa:p3-ui
scripts/use-node24.sh pnpm run qa:p4-flowbot
```

All passed on 2026-07-15. The production workspace contains 21 packages/apps and
the API build contains 55 dynamic routes. The database gate applies migrations
`0000` through `0016` and passes the P0-P4 repository/runtime suites. Production
Chromium passes Basic/Premium desktop/mobile authoring plus built-widget replay
and handover. These results complete P4 engineering, not the three-merchant
self-service expansion gate or paid launch.
