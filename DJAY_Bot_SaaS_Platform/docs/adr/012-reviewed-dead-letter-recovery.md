# ADR-012: Reviewed dead-letter recovery

Status: Accepted for local engineering validation on 16 July 2026. Production
use still requires managed-environment acceptance and current release evidence.

## Decision

Dead-letter recovery is a queue-specific, two-person platform workflow. It is
not a generic status editor. Only these email queues may be requested:

- system identity and workspace email;
- FlowBot merchant email;
- AI Chat merchant email.

Each eligible delivery uses the immutable outbox UUID as the downstream
idempotency key. Platform Support, AI Operations, and Platform Owner may request
one retry after recording the corrected root cause. Only a different Platform
Owner with authentication no older than ten minutes may approve or reject it.
Approval atomically verifies the queue kind, opaque item UUID, dead-letter
status, topic allow-list, and unchanged attempt count before making one item due.
It preserves the attempt count, ciphertext/payload, and immutable audit history.

FlowBot webhooks, social inbound work, and social outbound delivery are
explicitly excluded. A webhook recipient is outside our authority to honor an
idempotency header, while social work can contain terminal or partially applied
external effects. Those dead letters require queue-specific remediation and
continue to fail the zero-dead-letter release objective.

## Schema and API

Migration `0040_dead_letter_recovery.sql` adds
`platform.dead_letter_replay_requests`, one-open-request uniqueness, independent
review constraints, and narrow fixed-search-path security-definer functions.
The platform database role receives function execution—not direct access to
tenant or operations outboxes.

- `GET /platform/dead-letter-recovery` returns bounded safe metadata and request
  history for Owner, Support, and AI Operations.
- `POST /platform/dead-letter-recovery` creates a request from a current
  dead-letter snapshot.
- `POST /platform/dead-letter-recovery/{requestId}/review` approves or rejects
  with trusted-origin, Owner, recent-authentication, and different-actor checks.

Responses contain only queue class, opaque item/request IDs, attempt count, safe
error code, timestamps, reason, review status, and opaque platform actor IDs.
They never include tenant/customer identifiers, recipients, content, payloads,
ciphertext, credentials, provider/model identity, route, native usage, or cost.

## Failure, observability, and audit behavior

Stale or changed items become `invalidated`; repeated review and duplicate open
requests fail closed. A successful approval changes only `dead_letter` to due
`failed`, clears the old lease/completion timestamp, and records
`reviewed_replay`. Normal workers remain the only delivery path. Requests,
approvals, invalidations, and rejections write immutable platform audit events
with safe metadata. Existing queue/SLO observations still report the source
dead letter until approval, and release remains blocked until the retried item
actually succeeds and fresh zero-dead-letter evidence is accepted.

## Migration, rollback, and tests

The migration is additive. Application rollback removes the routes and UI but
retains migration 0040, request/audit evidence, and the queue data. Operators
must pause recovery actions before rollback; they must never delete the table,
rewrite attempts, or use direct SQL to replay an item.

Validation covers fresh PostgreSQL application, least-privilege role behavior,
safe listing, excluded topics, duplicate requests, unauthorized Support review,
independent Owner application, optimistic attempt-count protection, repeated
review denial, unchanged payload, immutable audit events, and desktop/mobile
role/confidentiality/overflow states.
