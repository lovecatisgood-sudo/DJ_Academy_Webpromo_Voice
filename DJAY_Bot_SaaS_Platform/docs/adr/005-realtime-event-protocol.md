# ADR-005: Canonical Realtime Event and Delivery Protocol

- Status: Accepted
- Date: 2026-07-14
- Phase: P0

## Context

FlowBot uses durable database replay plus process-local SSE fan-out. Voice uses provider-specific WebRTC/WebSocket protocols. AI social channels require webhook normalization. The platform needs one durable event model without pretending all transports are identical.

## Decision

Use a canonical versioned interaction event envelope internally:

```text
eventId, tenantId, conversationId, sequence, type, occurredAt,
actor, channel, payloadVersion, payload, idempotencyKey,
behaviorSnapshotId, entitlementSnapshotId, traceId
```

Conversation event sequence is monotonic and serialized publicly as a decimal string. Durable database events/messages are the replay source. A transactional outbox publishes committed events to tenant/conversation-scoped fan-out. In-memory fan-out is an optimization only.

Transport adapters normalize web widget, LINE, WhatsApp, Messenger, browser voice, and future telephony into canonical commands/events. Renderers convert canonical responses to channel capabilities. Vendor payloads remain in restricted, retained-as-needed ingress records and do not become domain contracts.

### Web text/FlowBot delivery

- authenticated POST commands with UUID idempotency keys;
- short-lived purpose-bound stream grants, never raw conversation tokens in URLs;
- SSE replay by sequence with buffered live handoff;
- heartbeat and reconnect backoff;
- POST sync fallback;
- external pub/sub required before more than one API instance serves live fan-out.

### Voice delivery

Audio/media uses the separate gateway protocol in ADR-006. Only canonical control/action/transcript events enter the shared event stream. Raw media frames do not pass through the ordinary outbox.

### Ordering and idempotency

Commands are deduplicated by tenant, aggregate, command kind, and idempotency key. Consumer effects are idempotent by event ID/handler. Out-of-order external webhooks are stored and reconciled by adapter rules. No provider retry can create a duplicate lead, message, appointment, or usage settlement.

## Validation

- concurrent duplicate commands return one stored result;
- replay/live boundary has no gap or duplicate visible result;
- process restart preserves replay;
- tenant A cannot subscribe to tenant B stream by guessed IDs/tokens;
- malformed/unknown event versions fail safely and enter DLQ where durable;
- webhook reorder/retry fixtures converge;
- payload serializers exclude provider/model and secrets.

