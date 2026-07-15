# FlowBot Planning Bundle Changelog — v1.1

## Critical corrections

1. Added immutable `flow_version_id` pin to every conversation.
2. Defined publish/rollback behavior so active conversations never switch versions.
3. Replaced split `/message` + `/lead` public flow with one atomic idempotent `/message` flow.
4. Added required `inputId`, processed response storage and duplicate-request behavior.
5. Replaced raw session-key URL usage with hashed session tokens and short-lived SSE tokens.
6. Made SSE resume database-backed with message sequence cursors; in-memory hub is live fan-out only.
7. Added POST sync fallback instead of session capability in a polling query string.
8. Replaced fire-and-forget email and throttle ledger with a retryable notification outbox.
9. Made tenancy wording precise: every tenant-owned table, with transaction-local context for pooled connections.
10. Aligned tenant_id across flow versions, nodes, options, keywords, messages, notes and notifications.

## Schema and integrity corrections

- Same-version composite FKs for parent, next and option target.
- Target node deletion changed from cascade to restrict.
- Owned hierarchy versus reference-link semantics documented.
- Phone/email customer uniqueness removed; matching is suggest-and-confirm.
- Exact LINE identity remains uniquely enforceable.
- Added `audio` message type and `system` sender.
- Added lead soft deletion.
- Added admin sessions/invites, processed inputs, outbox, audit logs and job heartbeats.
- Booking double-booking changed from same-start uniqueness to range-overlap exclusion.
- Added duration and availability checks.

## Product and UI corrections

- Responsive option grid replaces forced 2×3 layout.
- Mobile inbox requires drill-down navigation rather than simply hiding the profile pane.
- Added explicit bot health/version states.
- Defined Restart/Main Menu behavior during handoff.
- Disabled stale/previous option controls.
- Added incoming-reference deletion report and reference-link rendering.
- Simulator must use the exact production engine.
- Clarified demo credentials are prototype-only.

## Security and privacy corrections

- Raw visitor capabilities prohibited in URLs and logs.
- Added complete PII logging restrictions.
- Added centralized erasure across customer, leads, messages, notes, bookings, events, outbox and exports.
- Added post-restore erasure reapplication requirement.
- Added customer export and stronger erasure UI/API distinction.

## Stack correction

- Updated from Node 20 / Next.js 14+ to Node.js 24 LTS and a tested pinned Next.js 16.x release.

## Build-order correction

A seeded end-to-end conversation vertical slice now precedes the full flow-builder UI. This proves session, version pinning, idempotency, handoff, SSE replay, lead atomicity and notification behavior before investing in the deepest editor screen.

## Final validation corrections

- Moved idempotency checking behind a per-conversation row lock to prevent concurrent duplicate effects.
- Added buffered live-listener handoff around SSE backlog replay to close the query/subscribe race.
- Added 30-second/focus bot-state sync so staff-initiated takeover is discovered before SSE is open.
- Standardized PostgreSQL bigint sequence cursors as decimal JSON strings.
- Added message sender/admin consistency and lead source-consistency database checks.
- Aligned admin reply idempotency with the message schema and added cursor-based session reload catch-up.
- Added a ready-to-copy root `AGENTS.md` for Codex.
