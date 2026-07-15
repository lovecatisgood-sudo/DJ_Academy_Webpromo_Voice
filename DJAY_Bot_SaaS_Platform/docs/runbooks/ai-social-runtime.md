# AI Social Runtime Runbook

## Scope and release state

This runbook covers LINE, WhatsApp, and Messenger inbound events and replies for
AI Chat Premium. Social production activation remains disabled until the
channel-specific acceptance record is complete. Marketing, bulk sends, arbitrary
recipient entry, media ingestion, and outside-window Meta templates are not part
of this release.

## Required services and secrets

- API requires `AI_DATABASE_URL`, `AI_SOCIAL_CREDENTIAL_ENVELOPE_KEY`, and
  `AI_SOCIAL_SUBJECT_HASH_KEY`.
- Workers require `WORKER_DATABASE_URL`, `AI_SOCIAL_WORKER_ENABLED=true`, the
  same social credential envelope key, and the approved AI text gateway
  configuration.
- Delivery uses restricted deployment configuration for the LINE API base and
  Meta Graph API base. API versions and hosts are never tenant input.
- Tenant-entered channel credentials are envelope-encrypted. The one-time opaque
  callback key and Meta verify token must be transferred through the merchant's
  restricted setup session and must not be copied into tickets, chat, logs, or
  this repository.
- Use independent secrets for credential encryption and subject hashing. Rotate
  through the tenant credential-rotation operation; never edit ciphertext.

## Pre-activation checklist

For each named merchant and channel:

1. Confirm the tenant has an active `ai_chat_premium` snapshot and the exact
   channel entitlement.
2. Confirm the agent has a published immutable playbook and approved knowledge
   pins. Record their IDs in the restricted release record.
3. Confirm least-privilege channel application scopes, business verification,
   privacy/legal review, and channel terms acceptance outside this repository.
4. Create the connection in the tenant workspace. Copy the callback URL once,
   configure the channel console, and immediately run the health check.
5. Prove an invalid signature creates no receipt. Prove exact webhook replay
   creates no additional work. Prove an older subject event is retained as out
   of order and is not processed.
6. Send one inbound text and one supported quick-reply/postback journey. Reconcile
   the contact, conversation, pinned session, transcript, actions, quota,
   delivery receipt, and channel quantity event.
7. For WhatsApp and Messenger, prove an in-window reply succeeds and an
   after-window reply withholds recipient and credentials, records zero attempted
   quantity, and becomes a visible dead letter.
8. Revoke the connection and prove callback resolution and outbound authority
   stop immediately. Rotate to a new credential set and repeat health and reply
   checks before re-enabling the merchant rollout flag.

## Safe operations and alert inputs

Platform Operations reads aggregate channel health from
`platform.ai_social_health_summary()`. Tenant analytics provides the merchant's
Website/LINE/WhatsApp/Messenger breakdown. Observe only channel, state, queue
counts and age, attempts, safe error code, and correlation IDs.

Alert the restricted operations channel when any of these conditions is true:

- oldest inbound or delivery queue age exceeds the accepted service objective;
- inbound or delivery dead-letter count increases;
- failed-attempt ratio exceeds the approved channel baseline;
- any connection enters `reauthorization_required`;
- service-window closures unexpectedly increase;
- usage settlements and channel quantity events do not reconcile; or
- a provider/model leak detector, cross-tenant substitution check, or signature
  validation check fails.

Do not log customer text, subject identifiers, recipients, reply tokens,
credentials, raw signatures, structured output, AI routing identity, internal
cost, or an unapproved monetary rate.

## Incident response and kill path

1. Identify the affected channel and correlation IDs from aggregate health.
2. Revoke the affected tenant connection. For a channel-wide event, disable the
   social worker rollout and reject callbacks at the deployment edge.
3. Preserve immutable receipts, outbox items, transcript messages, quantity
   events, and audit logs. Do not rewrite or delete them during response.
4. If credentials may be exposed, revoke them in the channel console, rotate the
   tenant connection, and re-run the invalid-signature and health checks.
5. Requeue only after confirming tenant, connection, deployment, subject,
   entitlement, service window, and quota authority. Never change a sent or
   dead-letter row back to pending by direct SQL.
6. For cross-tenant, customer-data, signature-boundary, or AI-routing disclosure,
   stop all social traffic and invoke the security incident process.

## Rollback and recovery rehearsal

- Application rollback must remain compatible with migrations `0020` through
  `0028`. These migrations retain immutable evidence and are not rolled back by
  dropping tables or functions.
- Revoke connections before removing callback routes. Stop workers only after
  in-flight claims either finish or reach stale-lock recovery.
- A partial Meta delivery resumes from `delivered_part_count`; verify stored
  provider IDs and never resend already completed parts manually.
- Restore service in this order: database compatibility, aggregate health,
  callback signature/challenge, inbound replay, worker claim, outbound reply,
  tenant analytics.

## External acceptance record

Store merchant identity, credentials, screenshots, platform-console evidence,
timestamps, approvers, and incident contacts only in the restricted release
system. The repository records status without those details.

| Check | LINE | WhatsApp | Messenger |
|---|---|---|---|
| Restricted staging connection healthy | Pending | Pending | Pending |
| Signature, replay, and ordering accepted | Pending | Pending | Pending |
| Inbound Sales Core journey reconciled | Pending | Pending | Pending |
| Reply receipt and quantity reconciled | Pending | Pending | Pending |
| Service-window boundary accepted | N/A | Pending | Pending |
| Alerts and queue-age signal verified | Pending | Pending | Pending |
| Revoke/rotation/rollback rehearsal | Pending | Pending | Pending |
| Named merchant sign-off | Pending | Pending | Pending |

No social channel may be enabled in production while any applicable cell remains
pending or while commercial charging treatment is unresolved.
