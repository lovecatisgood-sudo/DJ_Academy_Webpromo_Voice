# FlowBot Runtime Runbook

## Required services and secrets

- API uses `FLOWBOT_DATABASE_URL`,
  `FLOWBOT_INTEGRATION_ENVELOPE_KEY`, and
  `FLOWBOT_NOTIFICATION_ENVELOPE_KEY`. Deterministic LINE/Messenger transport
  additionally requires `FLOWBOT_SOCIAL_CREDENTIAL_ENVELOPE_KEY` and
  `FLOWBOT_SOCIAL_SUBJECT_HASH_KEY`.
- Workers use `WORKER_DATABASE_URL`, `FLOWBOT_WORKER_ENABLED=true`, both FlowBot
  envelope keys, and the approved email delivery configuration. Enable social
  receipt and delivery processing with `FLOWBOT_SOCIAL_WORKER_ENABLED=true` and
  provide `FLOWBOT_SOCIAL_CREDENTIAL_ENVELOPE_KEY` to the worker service.
- Integration and notification keys must be independent base64-encoded 32-byte
  secrets. Social credential and subject-hash keys must also be independent of
  each other and every other application key. Rotate through the deployment
  secret manager, never tenant settings.

## LINE and Messenger activation

1. Keep social connection creation restricted to Flow Advanced authority and a
   currently published, writable bot.
2. Create the connection in the tenant Flow workspace. Record the returned
   one-time webhook URL directly in the provider console; it is not recoverable
   from the tenant API.
3. Complete the provider challenge and send a signed test event. Unsigned,
   replayed, oversized, or out-of-order events must not execute a second turn.
4. Verify the inbound receipt, deterministic pinned-version execution, quota
   settlement, and durable outbound delivery without inspecting message bodies
   or credentials in normal logs.
5. Test revocation. Revocation must destroy usable credential ciphertext, disable
   the internal deployment, and prevent further public runtime resolution.

## Health and observation

Monitor safe dimensions only: request ID, tenant ID, deployment ID, execution ID,
public plan, status, queue age, attempts, and usage quantity. Do not log visitor
messages, form data, endpoints, recipients, deployment/session keys, or decrypted
payloads.

Alert on public session failures, install-check failures, timer/dispatch queue
age, dead letters, notification failure rate, usage reconciliation variance,
origin denials, social signature failures, inbound/outbound social queue age,
provider delivery failure rate, and any provider-leak detector event.

## Worker recovery

Timer, webhook, and notification claims use stale-lock recovery and bounded
attempts. Before replaying a dead letter:

1. Confirm the tenant and entitlement still authorize the effect.
2. Confirm the deployment/profile is active and same-tenant.
3. Correct the external endpoint or recipient profile without altering history.
4. Record operator reason and correlation ID in the restricted incident system.
5. Requeue only through an audited operation; never edit a sent item to pending.

## Emergency response

- Provider leak or cross-tenant suspicion: disable the affected rollout flag,
  preserve evidence, revoke keys, and invoke the security incident process.
- Widget abuse: disable the deployment, rotate its key, and retain the hashed old
  key for audit.
- Webhook outage: leave deterministic sessions waiting until bounded failure
  continuation runs; do not bypass profile approval.
- Email outage: allow bounded retries; keep lead capture available and surface the
  safe dead-letter count to operations.
- Usage inconsistency: stop new rollout expansion, retain immutable events, and
  reconcile reservations before issuing credits or changing balances.

## Rollback

Application rollback must remain schema-compatible. Published versions are never
rewritten; rollback publishes a new immutable copy. A started execution continues
on its pinned version. Do not remove migrations or FlowBot tables during first
activation or an incident rollback.
