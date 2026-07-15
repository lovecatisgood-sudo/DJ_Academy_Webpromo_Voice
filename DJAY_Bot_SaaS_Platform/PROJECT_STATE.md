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

P6 builds AI Chatbot Premium social channels on the completed P1-P5 authority.
The controlled delivery order is LINE, WhatsApp, then Messenger. Active LINE
work now covers secure connection operations, signed and ordered inbound events,
idempotent Sales Core turns, atomic actions and usage, and durable outbound
delivery. P5 AI Chatbot Basic remains Web-only and provider-neutral.

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

## P6 LINE runtime checkpoint

The LINE runtime and delivery slices are implemented locally:

- Premium-only LINE connection creation and revocation.
- One-time opaque webhook keys and separately encrypted channel credentials.
- Safe tenant connection listing without credentials or webhook keys.
- Tenant-admin connection UI with one-time webhook display, provider health
  checks, encrypted credential rotation, reauthorization state, and revocation.
- Audit records for credential rotation and every requested health check.
- Untouched-body LINE signature verification before parsing or mutation.
- LINE text, postback, and opt-out normalization.
- Connection/event deduplication and per-subject timestamp ordering.
- Accepted events create one durable inbound outbox item; replayed and older
  events create no additional work.
- External subject IDs and LINE reply tokens are envelope-encrypted before
  durable receipt storage; their keyed subject digest remains the ordering key.
- Migration `0021_ai_chat_social_workers` adds forced-RLS subject links and a
  restricted worker claim/lease/retry/dead-letter contract with a fresh Premium
  entitlement check at claim time.
- Migration `0022_ai_chat_social_sessions` serializes work per subject and
  idempotently creates the connection-scoped contact, LINE conversation, pinned
  AI session, customer message, metered AI turn, and quota reservation.
- Migration `0023_ai_chat_social_commit` atomically commits the shared Sales
  Core action set, AI transcript message, native usage, settled quota, and one
  outbound reply. Commit-time authority loss fails closed and releases quota.
- Migration `0024_ai_chat_social_delivery` adds worker-only `SKIP LOCKED`
  delivery claims, bounded retry/dead-letter state, immutable attempted-quantity
  events, and provider receipt IDs without inventing channel rates.
- The worker uses the shared AI text runtime and channel-native LINE renderer,
  retries transient failures, terminates credential/action failures, applies
  opt-outs even after entitlement loss, and never counts a blocked request as
  an attempted channel unit.
- Tenant operators can see delivered, pending, failed, and attempted-unit totals.
  Production Chromium covers owner actions, viewer restrictions, secrets,
  desktop/mobile overflow, console errors, and provider-identity leakage.

This does not yet include social identity review candidates, WhatsApp,
Messenger, approved monetary rate treatment, or omnichannel analytics. LINE
still requires restricted staging credentials and real platform acceptance.
P6 remains active and production social activation remains disabled.

## Latest verification

```bash
scripts/use-node24.sh pnpm run verify
scripts/test-db-integration.sh
scripts/use-node24.sh pnpm run qa:p3-ui
scripts/use-node24.sh pnpm run qa:p4-flowbot
scripts/use-node24.sh pnpm run qa:p5-ai-chat
scripts/use-node24.sh pnpm run qa:p6-line
```

All passed on 2026-07-15. The database gate now applies migrations `0000` through
`0024` and includes the complete local LINE inbound, Sales Core commit, outbound
retry, quantity-ledger, delivery-status, opt-out, and quota-release journey. Full
verification passes across 27 packages/apps, and the API production build
contains 65 dynamic routes. Production Chromium passes AI Chat Basic plus the
P6 LINE tenant operations surface. These results do not authorize social
production activation, AI Chat self-service, or paid launch without the
remaining engineering and external acceptance gates.
